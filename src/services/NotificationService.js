// src/services/NotificationService.js - Servizio centralizzato per le notifiche
const logger = require('../utils/logger');

class NotificationService {
    constructor(bot) {
        this.bot = bot;
        this.telegram = bot.bot.telegram;
        this.adminUserId = bot.adminUserId;
        this.templates = {
            transactionUpdate: this.getTransactionUpdateTemplate.bind(this),
            reminder: this.getReminderTemplate.bind(this),
            announcement: this.getAnnouncementTemplate.bind(this)
        };
    }

    /**
     * Notify user with message
     */
    async notifyUser(userId, message, options = {}) {
        try {
            const finalOptions = {
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
                ...options
            };

            const sentMessage = await this.telegram.sendMessage(userId, message, finalOptions);
            
            logger.info(`Notification sent to user ${userId}`);
            return sentMessage;
        } catch (error) {
            logger.error(`Failed to notify user ${userId}:`, error);
            
            // Try to notify admin if user notification fails
            if (error.response?.error_code === 403) {
                await this.notifyAdmin(`User ${userId} has blocked the bot`);
            }
            
            throw error;
        }
    }

    /**
     * Notify transaction update
     */
    async notifyTransactionUpdate(transaction, newStatus, data = {}) {
        try {
            const { buyerMessage, sellerMessage } = this.templates.transactionUpdate(
                transaction, 
                newStatus, 
                data
            );

            const notifications = [];

            // Notify buyer
            if (buyerMessage && transaction.buyerId) {
                notifications.push(
                    this.notifyUser(transaction.buyerId, buyerMessage, data.buyerOptions)
                );
            }

            // Notify seller
            if (sellerMessage && transaction.sellerId) {
                notifications.push(
                    this.notifyUser(transaction.sellerId, sellerMessage, data.sellerOptions)
                );
            }

            await Promise.allSettled(notifications);
            
            logger.info(`Transaction update notifications sent for ${transaction.transactionId}`);
        } catch (error) {
            logger.error(`Error in notifyTransactionUpdate:`, error);
        }
    }

    /**
     * Send reminder notification
     */
    async sendReminder(userId, reminderType, data = {}) {
        try {
            const message = this.templates.reminder(reminderType, data);
            
            if (!message) {
                logger.warn(`No template found for reminder type: ${reminderType}`);
                return;
            }

            const options = this.getReminderOptions(reminderType, data);
            await this.notifyUser(userId, message, options);
            
            logger.info(`Reminder sent to user ${userId}, type: ${reminderType}`);
        } catch (error) {
            logger.error(`Error sending reminder to ${userId}:`, error);
        }
    }

    /**
     * Notify announcement event
     */
    async notifyAnnouncementEvent(announcement, eventType, data = {}) {
        try {
            const message = this.templates.announcement(eventType, announcement, data);
            
            if (!message) {
                logger.warn(`No template found for announcement event: ${eventType}`);
                return;
            }

            await this.notifyUser(announcement.userId, message, data.options);
            
            logger.info(`Announcement notification sent, type: ${eventType}`);
        } catch (error) {
            logger.error(`Error in notifyAnnouncementEvent:`, error);
        }
    }

    /**
     * Notify admin
     */
    async notifyAdmin(message, options = {}) {
        try {
            if (!this.adminUserId) {
                logger.warn('Admin user ID not configured');
                return;
            }

            const adminMessage = `🚨 **ADMIN NOTIFICATION**\n\n${message}`;
            
            await this.notifyUser(this.adminUserId, adminMessage, {
                parse_mode: 'Markdown',
                ...options
            });
            
            logger.info('Admin notification sent');
        } catch (error) {
            logger.error('Error notifying admin:', error);
        }
    }

    /**
     * Broadcast message to multiple users
     */
    async broadcast(userIds, message, options = {}) {
        const results = {
            sent: 0,
            failed: 0,
            errors: []
        };

        const notifications = userIds.map(async (userId) => {
            try {
                await this.notifyUser(userId, message, options);
                results.sent++;
            } catch (error) {
                results.failed++;
                results.errors.push({ userId, error: error.message });
            }
        });

        await Promise.allSettled(notifications);
        
        logger.info(`Broadcast completed: ${results.sent} sent, ${results.failed} failed`);
        return results;
    }

    /**
     * Schedule notification for later
     */
    async scheduleNotification(userId, message, delayMs, options = {}) {
        setTimeout(async () => {
            try {
                await this.notifyUser(userId, message, options);
                logger.info(`Scheduled notification sent to user ${userId}`);
            } catch (error) {
                logger.error(`Error sending scheduled notification to ${userId}:`, error);
            }
        }, delayMs);
        
        logger.info(`Notification scheduled for user ${userId} in ${delayMs}ms`);
    }

    // Template Methods

    /**
     * Get transaction update template
     */
    getTransactionUpdateTemplate(transaction, newStatus, data) {
        const templates = {
            'buyer_arrived': {
                sellerMessage: `📍 **ACQUIRENTE ARRIVATO**\n\n` +
                    `L'acquirente ${data.buyerUsername ? '@' + data.buyerUsername : 'utente'} è arrivato alla colonnina.\n\n` +
                    `🔍 ID Transazione: \`${transaction.transactionId}\`\n\n` +
                    `⚡ È il momento di attivare la ricarica!`,
                sellerOptions: {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⚡ Attiva ricarica', callback_data: `activate_charging_${transaction.transactionId}` }],
                            [{ text: '⏸️ Ritarda 5 min', callback_data: `delay_charging_${transaction.transactionId}` }]
                        ]
                    }
                }
            },

            'charging_started': {
                buyerMessage: `⚡ **RICARICA ATTIVATA**\n\n` +
                    `Il venditore ha attivato la ricarica.\n` +
                    `Verifica che il processo sia iniziato correttamente.\n\n` +
                    `🔍 ID Transazione: \`${transaction.transactionId}\``,
                buyerOptions: {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Sta caricando', callback_data: `charging_ok_${transaction.transactionId}` },
                                { text: '❌ Non carica', callback_data: `charging_fail_${transaction.transactionId}` }
                            ]
                        ]
                    }
                }
            },

            'payment_requested': {
                buyerMessage: `💳 **PAGAMENTO RICHIESTO**\n\n` +
                    `Il venditore ha confermato i KWH erogati.\n` +
                    `Procedi con il pagamento secondo gli accordi.\n\n` +
                    `🔍 ID Transazione: \`${transaction.transactionId}\``,
                buyerOptions: {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💳 Ho effettuato il pagamento', callback_data: 'payment_completed' }],
                            [{ text: '❌ Ho problemi', callback_data: 'payment_issues' }]
                        ]
                    }
                }
            },

            'completed': {
                buyerMessage: `🎉 **TRANSAZIONE COMPLETATA!**\n\n` +
                    `Il venditore ha confermato la ricezione del pagamento.\n\n` +
                    `⭐ Lascia un feedback per aiutare la community!\n\n` +
                    `🔍 ID Transazione: \`${transaction.transactionId}\``,
                sellerMessage: `🎉 **TRANSAZIONE COMPLETATA!**\n\n` +
                    `Hai confermato la ricezione del pagamento.\n\n` +
                    `⭐ Lascia un feedback per l'acquirente!\n\n` +
                    `🔍 ID Transazione: \`${transaction.transactionId}\``,
                buyerOptions: {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⭐ Valuta il venditore', callback_data: `feedback_tx_${transaction.transactionId}` }]
                        ]
                    }
                },
                sellerOptions: {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⭐ Valuta l\'acquirente', callback_data: `feedback_tx_${transaction.transactionId}` }]
                        ]
                    }
                }
            }
        };

        return templates[newStatus] || { buyerMessage: null, sellerMessage: null };
    }

    /**
     * Get reminder template
     */
    getReminderTemplate(reminderType, data) {
        const templates = {
            'pending_confirmation': `⏰ **PROMEMORIA**\n\n` +
                `Hai una richiesta di acquisto in attesa di conferma da ${data.hours || 2} ore.\n\n` +
                `🔍 ID Transazione: \`${data.transactionId}\``,

            'payment_pending': `⏰ **PROMEMORIA PAGAMENTO**\n\n` +
                `Hai un pagamento in sospeso da ${data.hours || 1} ore.\n\n` +
                `🔍 ID Transazione: \`${data.transactionId}\``,

            'feedback_missing': `⭐ **FEEDBACK MANCANTE**\n\n` +
                `Non hai ancora lasciato feedback per una transazione completata.\n\n` +
                `🔍 ID Transazione: \`${data.transactionId}\``,

            'announcement_expiring': `⏰ **ANNUNCIO IN SCADENZA**\n\n` +
                `Il tuo annuncio scadrà tra ${data.hours || 1} ora.\n\n` +
                `🔍 ID Annuncio: \`${data.announcementId}\``,

            'charging_scheduled': `⚡ **RICARICA PROGRAMMATA**\n\n` +
                `La tua ricarica è programmata per ${data.scheduledDate}.\n` +
                `Ricordati di essere puntuale!\n\n` +
                `🔍 ID Transazione: \`${data.transactionId}\``
        };

        return templates[reminderType] || null;
    }

    /**
     * Get announcement template
     */
    getAnnouncementTemplate(eventType, announcement, data) {
        const templates = {
            'expired': `⏰ **ANNUNCIO SCADUTO**\n\n` +
                `Il tuo annuncio \`${announcement.announcementId}\` è scaduto e è stato rimosso dal marketplace.\n\n` +
                `Puoi crearne uno nuovo quando vuoi dal menu principale.`,

            'extended': `✅ **ANNUNCIO ESTESO**\n\n` +
                `Il tuo annuncio \`${announcement.announcementId}\` è stato esteso per altre 24 ore.\n\n` +
                `Nuova scadenza: ${data.newExpiry || 'domani alla stessa ora'}.`,

            'request_received': `📥 **NUOVA RICHIESTA**\n\n` +
                `Hai ricevuto una nuova richiesta di acquisto per il tuo annuncio.\n\n` +
                `👤 Da: ${data.buyerName || 'Utente'}\n` +
                `🔍 ID Annuncio: \`${announcement.announcementId}\``
        };

        return templates[eventType] || null;
    }

    /**
     * Get reminder options based on type
     */
    getReminderOptions(reminderType, data) {
        const optionsMap = {
            'pending_confirmation': {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Gestisci richiesta', callback_data: `manage_tx_${data.transactionId}` }]
                    ]
                }
            },

            'payment_pending': {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💳 Gestisci pagamento', callback_data: 'payment_completed' }]
                    ]
                }
            },

            'feedback_missing': {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⭐ Lascia feedback', callback_data: `feedback_tx_${data.transactionId}` }]
                    ]
                }
            },

            'announcement_expiring': {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 Estendi annuncio', callback_data: `extend_ann_notify_${data.announcementId}` }]
                    ]
                }
            }
        };

        return optionsMap[reminderType] || {};
    }

    /**
     * Get notification statistics
     */
    getStats() {
        return {
            type: 'NotificationService',
            templatesAvailable: {
                transaction: Object.keys(this.getTransactionUpdateTemplate({}, '', {}).templates || {}),
                reminder: ['pending_confirmation', 'payment_pending', 'feedback_missing', 'announcement_expiring'],
                announcement: ['expired', 'extended', 'request_received']
            }
        };
    }
}

module.exports = NotificationService;
