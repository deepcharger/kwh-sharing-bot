// src/services/NotificationService.js - NUOVO FILE
const EventEmitter = require('events');
const MarkdownEscape = require('../utils/MarkdownEscape');

class NotificationService extends EventEmitter {
    constructor(bot) {
        super();
        this.bot = bot;
        this.telegram = bot.bot.telegram;
        this.chatCleaner = bot.chatCleaner;
        this.queuedNotifications = new Map();
        this.notificationStats = {
            sent: 0,
            failed: 0,
            queued: 0
        };
    }

    /**
     * Send notification to user
     */
    async notifyUser(userId, message, options = {}) {
        try {
            const defaultOptions = {
                parse_mode: 'Markdown',
                disable_notification: false,
                ...options
            };

            const result = await this.telegram.sendMessage(userId, message, defaultOptions);
            
            this.notificationStats.sent++;
            this.emit('notificationSent', { userId, type: options.type || 'general' });
            
            return result;
        } catch (error) {
            console.error(`Failed to notify user ${userId}:`, error);
            this.notificationStats.failed++;
            
            // Queue for retry if user blocked bot
            if (error.code === 403) {
                this.queueNotification(userId, message, options);
            }
            
            throw error;
        }
    }

    /**
     * Send persistent notification (won't be auto-deleted)
     */
    async sendPersistentNotification(userId, message, options = {}) {
        try {
            const result = await this.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: userId } },
                message,
                options
            );
            
            this.notificationStats.sent++;
            return result;
        } catch (error) {
            console.error(`Failed to send persistent notification to ${userId}:`, error);
            this.notificationStats.failed++;
            throw error;
        }
    }

    /**
     * Notify about transaction status change
     */
    async notifyTransactionUpdate(transaction, newStatus, additionalData = {}) {
        const notifications = this.getTransactionNotifications(transaction, newStatus, additionalData);
        
        for (const notification of notifications) {
            try {
                await this.notifyUser(
                    notification.userId,
                    notification.message,
                    notification.options
                );
            } catch (error) {
                console.error(`Failed to send transaction notification:`, error);
            }
        }
    }

    /**
     * Notify about new announcement
     */
    async notifyNewAnnouncement(announcement, targetUsers = []) {
        const message = this.formatNewAnnouncementMessage(announcement);
        
        // If no specific targets, could notify users who have shown interest in similar announcements
        if (targetUsers.length === 0) {
            // For now, we don't broadcast to all users
            return;
        }
        
        for (const userId of targetUsers) {
            try {
                await this.notifyUser(userId, message, {
                    type: 'new_announcement',
                    reply_markup: {
                        inline_keyboard: [[
                            { 
                                text: '👀 Visualizza dettagli', 
                                url: `t.me/${process.env.BOT_USERNAME}?start=view_${announcement.announcementId}` 
                            }
                        ]]
                    }
                });
            } catch (error) {
                console.error(`Failed to notify user ${userId} about announcement:`, error);
            }
        }
    }

    /**
     * Send reminder notification
     */
    async sendReminder(userId, reminderType, data) {
        const message = this.formatReminderMessage(reminderType, data);
        
        if (!message) {
            console.error(`Unknown reminder type: ${reminderType}`);
            return;
        }
        
        try {
            await this.notifyUser(userId, message, {
                type: 'reminder',
                disable_notification: false
            });
        } catch (error) {
            console.error(`Failed to send reminder to ${userId}:`, error);
        }
    }

    /**
     * Notify admin about critical events
     */
    async notifyAdmin(message, data = {}) {
        const adminMessage = `🚨 **ADMIN NOTIFICATION**\n\n${message}`;
        
        try {
            await this.notifyUser(this.bot.adminUserId, adminMessage, {
                type: 'admin_alert',
                disable_notification: false,
                ...data
            });
        } catch (error) {
            console.error('Failed to notify admin:', error);
        }
    }

    /**
     * Batch notify multiple users
     */
    async batchNotify(notifications) {
        const results = {
            success: 0,
            failed: 0,
            errors: []
        };
        
        for (const { userId, message, options } of notifications) {
            try {
                await this.notifyUser(userId, message, options);
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({ userId, error: error.message });
            }
        }
        
        return results;
    }

    // Private helper methods
    
    queueNotification(userId, message, options) {
        if (!this.queuedNotifications.has(userId)) {
            this.queuedNotifications.set(userId, []);
        }
        
        this.queuedNotifications.get(userId).push({
            message,
            options,
            timestamp: new Date()
        });
        
        this.notificationStats.queued++;
    }
    
    getTransactionNotifications(transaction, newStatus, additionalData) {
        const notifications = [];
        
        switch (newStatus) {
            case 'confirmed':
                notifications.push({
                    userId: transaction.buyerId,
                    message: this.formatTransactionConfirmedMessage(transaction),
                    options: { type: 'transaction_confirmed' }
                });
                break;
                
            case 'buyer_arrived':
                notifications.push({
                    userId: transaction.sellerId,
                    message: this.formatBuyerArrivedMessage(transaction, additionalData),
                    options: { 
                        type: 'buyer_arrived',
                        reply_markup: this.getChargingActivationKeyboard(transaction.transactionId)
                    }
                });
                break;
                
            case 'charging_started':
                notifications.push({
                    userId: transaction.buyerId,
                    message: this.formatChargingStartedMessage(transaction),
                    options: {
                        type: 'charging_started',
                        reply_markup: this.getChargingConfirmationKeyboard(transaction.transactionId)
                    }
                });
                break;
                
            case 'payment_requested':
                notifications.push({
                    userId: transaction.buyerId,
                    message: this.formatPaymentRequestMessage(transaction, additionalData),
                    options: {
                        type: 'payment_requested',
                        reply_markup: this.getPaymentKeyboard(transaction.transactionId)
                    }
                });
                break;
                
            case 'completed':
                // Notify both parties
                notifications.push(
                    {
                        userId: transaction.sellerId,
                        message: this.formatTransactionCompleteMessage(transaction, 'seller'),
                        options: { type: 'transaction_completed' }
                    },
                    {
                        userId: transaction.buyerId,
                        message: this.formatTransactionCompleteMessage(transaction, 'buyer'),
                        options: { type: 'transaction_completed' }
                    }
                );
                break;
        }
        
        return notifications;
    }
    
    // Message formatting methods
    
    formatTransactionConfirmedMessage(transaction) {
        return `✅ **RICHIESTA ACCETTATA!**\n\n` +
            `Il venditore ha confermato la tua richiesta.\n` +
            `📅 Data: ${MarkdownEscape.escape(transaction.scheduledDate)}\n` +
            `📍 Luogo: ${MarkdownEscape.escape(transaction.location)}\n\n` +
            `Ti notificheremo quando sarà il momento della ricarica.`;
    }
    
    formatBuyerArrivedMessage(transaction, data) {
        return `📍 **ACQUIRENTE ARRIVATO!**\n\n` +
            `L'acquirente @${MarkdownEscape.escape(data.buyerUsername || 'utente')} è alla colonnina.\n` +
            `🏢 Brand: ${MarkdownEscape.escape(transaction.brand)}\n` +
            `🔌 Connettore: ${MarkdownEscape.escape(transaction.connector)}\n\n` +
            `È il momento di attivare la ricarica!`;
    }
    
    formatChargingStartedMessage(transaction) {
        return `⚡ **RICARICA ATTIVATA!**\n\n` +
            `Il venditore ha attivato la ricarica.\n` +
            `Controlla che la ricarica sia iniziata correttamente.`;
    }
    
    formatPaymentRequestMessage(transaction, data) {
        return `💳 **RICHIESTA PAGAMENTO**\n\n` +
            `⚡ KWH erogati: ${data.kwhAmount}\n` +
            `💰 Importo totale: €${data.totalAmount}\n\n` +
            `Procedi con il pagamento secondo gli accordi.`;
    }
    
    formatTransactionCompleteMessage(transaction, role) {
        const message = `🎉 **TRANSAZIONE COMPLETATA!**\n\n`;
        
        if (role === 'seller') {
            return message + `Hai completato con successo la vendita.\n` +
                `Riceverai una notifica per lasciare il feedback.`;
        } else {
            return message + `La tua ricarica è stata completata.\n` +
                `Non dimenticare di lasciare un feedback!`;
        }
    }
    
    formatNewAnnouncementMessage(announcement) {
        return `🔋 **NUOVA OFFERTA ENERGIA**\n\n` +
            `📍 Zona: ${MarkdownEscape.escape(announcement.zones)}\n` +
            `💰 Prezzo: ${announcement.basePrice || announcement.price}€/KWH\n` +
            `⚡ Tipo: ${MarkdownEscape.escape(announcement.currentType)}\n\n` +
            `Clicca per vedere i dettagli!`;
    }
    
    formatReminderMessage(type, data) {
        const messages = {
            'pending_confirmation': `⏰ **PROMEMORIA**\n\nHai una richiesta in attesa da ${data.hours} ore.\nID: \`${data.transactionId}\``,
            'payment_pending': `⏰ **PROMEMORIA PAGAMENTO**\n\nRicordati di completare il pagamento per la transazione.\nID: \`${data.transactionId}\``,
            'announcement_expiring': `⏰ **ANNUNCIO IN SCADENZA**\n\nIl tuo annuncio scadrà tra ${data.hours} ore.\nVuoi estenderlo?`,
            'feedback_missing': `⏰ **LASCIA UN FEEDBACK**\n\nNon hai ancora valutato la transazione completata.\nID: \`${data.transactionId}\``
        };
        
        return messages[type];
    }
    
    // Keyboard generation methods
    
    getChargingActivationKeyboard(transactionId) {
        return {
            inline_keyboard: [
                [{ text: '⚡ Attiva ricarica', callback_data: `activate_charging_${transactionId}` }],
                [{ text: '⏸️ Ritarda 5 min', callback_data: `delay_charging_${transactionId}` }],
                [{ text: '❌ Problemi tecnici', callback_data: `technical_issues_${transactionId}` }]
            ]
        };
    }
    
    getChargingConfirmationKeyboard(transactionId) {
        return {
            inline_keyboard: [
                [
                    { text: '✅ Sta caricando', callback_data: `charging_ok_${transactionId}` },
                    { text: '❌ Non carica', callback_data: `charging_fail_${transactionId}` }
                ]
            ]
        };
    }
    
    getPaymentKeyboard(transactionId) {
        return {
            inline_keyboard: [
                [{ text: '💳 Ho pagato', callback_data: `payment_done_${transactionId}` }]
            ]
        };
    }
    
    // Statistics methods
    
    getStats() {
        return {
            ...this.notificationStats,
            queuedUsers: this.queuedNotifications.size
        };
    }
    
    resetStats() {
        this.notificationStats = {
            sent: 0,
            failed: 0,
            queued: 0
        };
    }
}

module.exports = NotificationService;
