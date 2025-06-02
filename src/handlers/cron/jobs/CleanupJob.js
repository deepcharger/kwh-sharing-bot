// src/handlers/cron/jobs/CleanupJob.js
const logger = require('../../../utils/logger');

class CleanupJob {
    constructor(bot) {
        this.bot = bot;
        this.db = bot.db;
        this.chatCleaner = bot.chatCleaner;
    }

    /**
     * Run hourly cleanup
     */
    async runHourlyCleanup() {
        try {
            logger.info('🧹 Starting hourly cleanup...');
            
            // Clean old messages from chat
            this.chatCleaner.cleanupOldMessages();
            
            // Clean expired sessions
            const expiredSessions = await this.cleanExpiredSessions();
            
            // Archive old notifications
            const archivedNotifications = await this.archiveOldNotifications();
            
            logger.info(`✅ Hourly cleanup completed: ${expiredSessions} sessions, ${archivedNotifications} notifications`);
            
        } catch (error) {
            logger.error('Error in hourly cleanup:', error);
        }
    }

    /**
     * Run daily deep cleanup
     */
    async runDailyCleanup() {
        try {
            logger.info('🧹 Starting daily deep cleanup...');
            
            // Deep clean chat history
            this.chatCleaner.deepCleanup();
            
            // Archive completed transactions
            const archivedTransactions = await this.archiveOldTransactions();
            
            // Clean old error logs
            const cleanedErrors = await this.cleanOldErrors();
            
            // Remove expired announcements
            const removedAnnouncements = await this.removeExpiredAnnouncements();
            
            // Optimize database
            await this.optimizeDatabase();
            
            const report = {
                transactions: archivedTransactions,
                errors: cleanedErrors,
                announcements: removedAnnouncements
            };
            
            logger.info('✅ Daily cleanup completed:', report);
            
            // Send report to admin
            await this.sendCleanupReport(report);
            
        } catch (error) {
            logger.error('Error in daily cleanup:', error);
        }
    }

    /**
     * Run weekly cleanup
     */
    async runWeeklyCleanup() {
        try {
            logger.info('🧹 Starting weekly cleanup...');
            
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            
            // Archive old transactions
            const archivedCount = await this.db.getCollection('transactions').updateMany(
                { 
                    status: 'completed',
                    completedAt: { $lt: oneMonthAgo }
                },
                { 
                    $set: { 
                        archived: true, 
                        archivedAt: new Date() 
                    }
                }
            );
            
            // Delete very old archived messages
            const deletedMessages = await this.db.getCollection('archived_messages').deleteMany({
                archivedAt: { $lt: oneMonthAgo }
            });
            
            // Clean old analytics data
            const twoMonthsAgo = new Date();
            twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
            
            const deletedAnalytics = await this.db.getCollection('analytics').deleteMany({
                timestamp: { $lt: twoMonthsAgo }
            });
            
            const report = {
                archivedTransactions: archivedCount.modifiedCount,
                deletedMessages: deletedMessages.deletedCount,
                deletedAnalytics: deletedAnalytics.deletedCount
            };
            
            logger.info('✅ Weekly cleanup completed:', report);
            
            // Notify admin
            await this.notifyAdminCleanup(report);
            
        } catch (error) {
            logger.error('Error in weekly cleanup:', error);
        }
    }

    // Helper methods

    async cleanExpiredSessions() {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const result = await this.db.getCollection('user_sessions').deleteMany({
            lastActivity: { $lt: sixHoursAgo }
        });
        return result.deletedCount;
    }

    async archiveOldNotifications() {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        const notifications = await this.db.getCollection('notifications')
            .find({ createdAt: { $lt: threeDaysAgo }, archived: { $ne: true } })
            .toArray();
        
        if (notifications.length > 0) {
            await this.db.getCollection('archived_notifications').insertMany(notifications);
            await this.db.getCollection('notifications').updateMany(
                { _id: { $in: notifications.map(n => n._id) } },
                { $set: { archived: true } }
            );
        }
        
        return notifications.length;
    }

    async archiveOldTransactions() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const result = await this.db.getCollection('transactions').updateMany(
            {
                status: { $in: ['completed', 'cancelled'] },
                updatedAt: { $lt: thirtyDaysAgo },
                archived: { $ne: true }
            },
            {
                $set: {
                    archived: true,
                    archivedAt: new Date()
                }
            }
        );
        
        return result.modifiedCount;
    }

    async cleanOldErrors() {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const result = await this.db.getCollection('errors').deleteMany({
            timestamp: { $lt: sevenDaysAgo }
        });
        
        return result.deletedCount;
    }

    async removeExpiredAnnouncements() {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const result = await this.db.getCollection('announcements').deleteMany({
            active: false,
            expiresAt: { $lt: sevenDaysAgo }
        });
        
        return result.deletedCount;
    }

    async optimizeDatabase() {
        const collections = ['users', 'transactions', 'announcements', 'feedback'];
        
        for (const collectionName of collections) {
            try {
                await this.db.getCollection(collectionName).reIndex();
            } catch (error) {
                logger.error(`Error reindexing ${collectionName}:`, error);
            }
        }
    }

    async sendCleanupReport(report) {
        const message = `🧹 **REPORT PULIZIA GIORNALIERA**\n\n` +
            `📦 Transazioni archiviate: ${report.transactions}\n` +
            `🗑️ Errori eliminati: ${report.errors}\n` +
            `📋 Annunci rimossi: ${report.announcements}\n\n` +
            `✅ Database ottimizzato`;
        
        try {
            await this.bot.bot.telegram.sendMessage(
                this.bot.adminUserId,
                message,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            logger.error('Error sending cleanup report:', error);
        }
    }

    async notifyAdminCleanup(report) {
        const message = `🧹 **PULIZIA SETTIMANALE COMPLETATA**\n\n` +
            `📦 Transazioni archiviate: ${report.archivedTransactions}\n` +
            `🗑️ Messaggi eliminati: ${report.deletedMessages}\n` +
            `📊 Analytics eliminati: ${report.deletedAnalytics}\n\n` +
            `✅ Sistema ottimizzato`;
        
        try {
            await this.bot.bot.telegram.sendMessage(
                this.bot.adminUserId,
                message,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            logger.error('Error notifying admin about cleanup:', error);
        }
    }
}

module.exports = CleanupJob;
