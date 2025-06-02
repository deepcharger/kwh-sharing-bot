// src/handlers/cron/jobs/NotificationJob.js
const logger = require('../../../utils/logger');
const { TRANSACTION_STATUS } = require('../../../config/constants');

class NotificationJob {
    constructor(bot) {
        this.bot = bot;
        this.db = bot.db;
        this.notificationService = bot.services.notification;
    }

    /**
     * Check and send reminders for pending actions
     */
    async runPendingReminders() {
        try {
            logger.info('📬 Checking pending reminders...');
            
            // Check pending transactions
            await this.checkPendingTransactions();
            
            // Check expiring announcements
            await this.checkExpiringAnnouncements();
            
            // Check missing feedback
            await this.checkMissingFeedback();
            
            // Check incomplete payments
            await this.checkIncompletePayments();
            
        } catch (error) {
            logger.error('Error in notification job:', error);
        }
    }

    /**
     * Send scheduled notifications
     */
    async runScheduledNotifications() {
        try {
            const now = new Date();
            
            // Get scheduled notifications
            const scheduled = await this.db.getCollection('scheduled_notifications')
                .find({
                    scheduledFor: { $lte: now },
                    sent: false
                })
                .toArray();
            
            for (const notification of scheduled) {
                try {
                    await this.notificationService.notifyUser(
                        notification.userId,
                        notification.message,
                        notification.options
                    );
                    
                    // Mark as sent
                    await this.db.getCollection('scheduled_notifications').updateOne(
                        { _id: notification._id },
                        { $set: { sent: true, sentAt: new Date() } }
                    );
                    
                } catch (error) {
                    logger.error(`Failed to send scheduled notification ${notification._id}:`, error);
                }
            }
            
            if (scheduled.length > 0) {
                logger.info(`✅ Sent ${scheduled.length} scheduled notifications`);
            }
            
        } catch (error) {
            logger.error('Error sending scheduled notifications:', error);
        }
    }

    async checkPendingTransactions() {
        const pendingTransactions = await this.bot.services.transaction.getPendingTransactions();
        
        for (const transaction of pendingTransactions) {
            const hoursSinceCreated = (Date.now() - transaction.createdAt.getTime()) / (1000 * 60 * 60);
            
            // Skip if recently created
            if (hoursSinceCreated < 2) continue;
            
            // Check if already reminded
            const reminderKey = `tx_reminder_${transaction.transactionId}`;
            const reminded = await this.checkIfReminded(reminderKey);
            
            if (!reminded) {
                await this.sendTransactionReminder(transaction, hoursSinceCreated);
                await this.markAsReminded(reminderKey);
            }
        }
    }

    async checkExpiringAnnouncements() {
        const expiringAnnouncements = await this.bot.services.announcement.getExpiringAnnouncements();
        
        for (const announcement of expiringAnnouncements) {
            const reminderKey = `ann_expiry_${announcement.announcementId}`;
            const reminded = await this.checkIfReminded(reminderKey);
            
            if (!reminded) {
                await this.notificationService.sendReminder(
                    announcement.userId,
                    'announcement_expiring',
                    {
                        announcementId: announcement.announcementId,
                        hours: 1
                    }
                );
                
                await this.markAsReminded(reminderKey);
            }
        }
    }

    async checkMissingFeedback() {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        // Find completed transactions without feedback
        const completedTransactions = await this.db.getCollection('transactions')
            .find({
                status: TRANSACTION_STATUS.COMPLETED,
                completedAt: { $lt: threeDaysAgo }
            })
            .toArray();
        
        for (const transaction of completedTransactions) {
            // Check both parties for feedback
            for (const userId of [transaction.sellerId, transaction.buyerId]) {
                const hasFeedback = await this.db.getCollection('feedback')
                    .findOne({
                        transactionId: transaction.transactionId,
                        fromUserId: userId
                    });
                
                if (!hasFeedback) {
                    const reminderKey = `feedback_reminder_${transaction.transactionId}_${userId}`;
                    const reminded = await this.checkIfReminded(reminderKey);
                    
                    if (!reminded) {
                        await this.notificationService.sendReminder(
                            userId,
                            'feedback_missing',
                            { transactionId: transaction.transactionId }
                        );
                        
                        await this.markAsReminded(reminderKey);
                    }
                }
            }
        }
    }

    async checkIncompletePayments() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const pendingPayments = await this.db.getCollection('transactions')
            .find({
                status: TRANSACTION_STATUS.PAYMENT_REQUESTED,
                updatedAt: { $lt: oneHourAgo }
            })
            .toArray();
        
        for (const transaction of pendingPayments) {
            const reminderKey = `payment_reminder_${transaction.transactionId}`;
            const reminded = await this.checkIfReminded(reminderKey);
            
            if (!reminded) {
                await this.notificationService.sendReminder(
                    transaction.buyerId,
                    'payment_pending',
                    { transactionId: transaction.transactionId }
                );
                
                await this.markAsReminded(reminderKey);
            }
        }
    }

    async sendTransactionReminder(transaction, hoursSinceCreated) {
        let reminderType = null;
        let targetUserId = null;
        
        switch (transaction.status) {
            case TRANSACTION_STATUS.PENDING_SELLER:
                reminderType = 'pending_confirmation';
                targetUserId = transaction.sellerId;
                break;
                
            case TRANSACTION_STATUS.CHARGING_COMPLETED:
                reminderType = 'photo_upload_pending';
                targetUserId = transaction.buyerId;
                break;
                
            case TRANSACTION_STATUS.PAYMENT_REQUESTED:
                reminderType = 'payment_pending';
                targetUserId = transaction.buyerId;
                break;
        }
        
        if (reminderType && targetUserId) {
            await this.notificationService.sendReminder(
                targetUserId,
                reminderType,
                {
                    transactionId: transaction.transactionId,
                    hours: Math.floor(hoursSinceCreated)
                }
            );
        }
    }

    async checkIfReminded(key) {
        const reminder = await this.db.getCollection('reminders').findOne({ key });
        return !!reminder;
    }

    async markAsReminded(key) {
        await this.db.getCollection('reminders').updateOne(
            { key },
            { 
                $set: { 
                    key,
                    remindedAt: new Date()
                }
            },
            { upsert: true }
        );
    }
}

module.exports = NotificationJob;
