const cron = require('node-cron');
const axios = require('axios');

class CronJobHandler {
    constructor(bot) {
        this.bot = bot;
    }

    setupCronJobs() {
        // Check pending transactions every 30 minutes
        cron.schedule('*/30 * * * *', async () => {
            try {
                await this.checkPendingTransactions();
            } catch (error) {
                console.error('Error in pending transactions cron job:', error);
            }
        });

        // Daily statistics to admin
        cron.schedule('0 9 * * *', async () => {
            try {
                await this.sendDailyReport();
            } catch (error) {
                console.error('Error sending daily report:', error);
            }
        });

        // Weekly cleanup of old data (every Sunday at 2 AM)
        cron.schedule('0 2 * * 0', async () => {
            try {
                await this.weeklyCleanup();
            } catch (error) {
                console.error('Error in weekly cleanup:', error);
            }
        });

        // Keep-alive ping (for free tier services)
        if (process.env.NODE_ENV === 'production' && process.env.KEEP_ALIVE_URL) {
            cron.schedule('*/14 * * * *', async () => {
                try {
                    await this.keepAlivePing();
                } catch (error) {
                    console.error('Keep-alive ping failed:', error.message);
                }
            });
        }

        // NUOVO: Controlla annunci scaduti ogni 5 minuti
        cron.schedule('*/5 * * * *', async () => {
            try {
                await this.handleExpiredAnnouncements();
            } catch (error) {
                console.error('Error handling expired announcements:', error);
            }
        });
        
        // NUOVO: Aggiorna i timer negli annunci ogni 15 minuti
        cron.schedule('*/15 * * * *', async () => {
            try {
                await this.refreshAnnouncementTimers();
            } catch (error) {
                console.error('Error refreshing announcement timers:', error);
            }
        });
        
        // NUOVO: Notifica annunci in scadenza (1 ora prima) - ogni ora
        cron.schedule('0 * * * *', async () => {
            try {
                await this.notifyExpiringAnnouncements();
            } catch (error) {
                console.error('Error notifying expiring announcements:', error);
            }
        });

        console.log('✅ Cron jobs configured successfully');
    }

    async checkPendingTransactions() {
        const pendingTransactions = await this.bot.transactionService.getPendingTransactions();
        
        // Remind users about pending actions
        for (const transaction of pendingTransactions) {
            const hoursSinceCreated = (new Date() - transaction.createdAt) / (1000 * 60 * 60);
            
            if (hoursSinceCreated > 2) { // 2 hours without action
                let reminderText = '';
                let targetUserId = null;
                
                switch (transaction.status) {
                    case 'pending_seller_confirmation':
                        reminderText = `⏰ **Promemoria:** Hai una richiesta di acquisto in sospeso da ${hoursSinceCreated.toFixed(0)} ore.\n\nID: ${transaction.transactionId}`;
                        targetUserId = transaction.sellerId;
                        break;
                        
                    case 'charging_completed':
                        reminderText = `⏰ **Promemoria:** Devi caricare la foto del display per completare la transazione.\n\nID: ${transaction.transactionId}`;
                        targetUserId = transaction.buyerId;
                        break;
                        
                    case 'payment_requested':
                        reminderText = `⏰ **Promemoria:** Pagamento in sospeso da ${hoursSinceCreated.toFixed(0)} ore.\n\nID: ${transaction.transactionId}`;
                        targetUserId = transaction.buyerId;
                        break;
                }
                
                if (reminderText && targetUserId) {
                    try {
                        await this.bot.bot.telegram.sendMessage(targetUserId, reminderText, {
                            parse_mode: 'Markdown'
                        });
                        console.log(`Reminder sent to user ${targetUserId} for transaction ${transaction.transactionId}`);
                    } catch (error) {
                        console.log(`Could not send reminder to user ${targetUserId}:`, error.description);
                    }
                }
            }
        }
        
        if (pendingTransactions.length > 0) {
            console.log(`Checked ${pendingTransactions.length} pending transactions`);
        }
    }

    async handleExpiredAnnouncements() {
        const expiredAnnouncements = await this.bot.announcementService.getExpiredAnnouncements();
        
        for (const announcement of expiredAnnouncements) {
            try {
                // Disattiva l'annuncio
                await this.bot.announcementService.updateAnnouncement(
                    announcement.announcementId,
                    { active: false }
                );
                
                // Elimina dal gruppo
                if (announcement.messageId) {
                    try {
                        await this.bot.bot.telegram.deleteMessage(
                            this.bot.groupId, 
                            announcement.messageId
                        );
                    } catch (deleteError) {
                        console.log(`Could not delete message ${announcement.messageId}:`, deleteError.description);
                    }
                }
                
                // Notifica il venditore
                try {
                    await this.bot.bot.telegram.sendMessage(
                        announcement.userId,
                        `⏰ **ANNUNCIO SCADUTO**\n\n` +
                        `Il tuo annuncio \`${announcement.announcementId}\` è scaduto dopo 24 ore ed è stato rimosso.\n\n` +
                        `Puoi pubblicarne uno nuovo quando vuoi dal menu principale.`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (notifyError) {
                    console.log(`Could not notify user ${announcement.userId}:`, notifyError.description);
                }
                
                console.log(`Expired announcement ${announcement.announcementId} removed`);
            } catch (error) {
                console.error(`Error handling expired announcement ${announcement.announcementId}:`, error);
            }
        }
        
        if (expiredAnnouncements.length > 0) {
            console.log(`Handled ${expiredAnnouncements.length} expired announcements`);
        }
    }

    async refreshAnnouncementTimers() {
        const activeAnnouncements = await this.bot.announcementService.getActiveAnnouncements(50);
        let refreshedCount = 0;
        
        for (const announcement of activeAnnouncements) {
            try {
                // Controlla se è il momento di aggiornare (ogni 15 minuti)
                const lastRefresh = announcement.lastRefreshedAt || announcement.createdAt;
                const now = new Date();
                const timeSinceRefresh = now - lastRefresh;
                
                if (timeSinceRefresh >= 15 * 60 * 1000 && announcement.messageId) {
                    // Ottieni stats utente
                    const userStats = await this.bot.userService.getUserStats(announcement.userId);
                    
                    // Rigenera il messaggio con timer aggiornati
                    const updatedMessage = this.bot.announcementService.formatAnnouncementForGroup(
                        announcement, 
                        userStats
                    );
                    
                    try {
                        await this.bot.bot.telegram.editMessageText(
                            this.bot.groupId,
                            announcement.messageId,
                            null,
                            updatedMessage,
                            {
                                parse_mode: 'Markdown',
                                message_thread_id: parseInt(this.bot.topicId),
                                reply_markup: {
                                    inline_keyboard: [[
                                        { 
                                            text: '🛒 Contatta venditore', 
                                            url: `t.me/${process.env.BOT_USERNAME}?start=contact_${announcement.announcementId}` 
                                        }
                                    ]]
                                }
                            }
                        );
                        
                        // Aggiorna timestamp refresh
                        await this.bot.announcementService.updateAnnouncement(
                            announcement.announcementId,
                            { lastRefreshedAt: now }
                        );
                        
                        refreshedCount++;
                        
                    } catch (editError) {
                        // Se non riesce a modificare (messaggio troppo vecchio), ignora
                        if (!editError.message?.includes('message is not modified')) {
                            console.error(`Error updating announcement ${announcement.announcementId}:`, editError.description);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error refreshing announcement ${announcement.announcementId}:`, error);
            }
        }
        
        if (refreshedCount > 0) {
            console.log(`Refreshed ${refreshedCount} announcement timers`);
        }
    }

    async notifyExpiringAnnouncements() {
        const expiringAnnouncements = await this.bot.announcementService.getExpiringAnnouncements();
        
        for (const announcement of expiringAnnouncements) {
            try {
                await this.bot.bot.telegram.sendMessage(
                    announcement.userId,
                    `⏰ **ANNUNCIO IN SCADENZA**\n\n` +
                    `Il tuo annuncio \`${announcement.announcementId}\` scadrà tra 1 ora.\n\n` +
                    `📍 Zone: ${announcement.zones || announcement.location}\n` +
                    `💰 Prezzo: ${announcement.basePrice || announcement.price}€/KWH\n\n` +
                    `Vuoi estenderlo per altre 24 ore?`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔄 Estendi per 24h', callback_data: `extend_ann_notify_${announcement.announcementId}` }],
                                [{ text: '❌ Lascia scadere', callback_data: 'dismiss_notification' }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error(`Error notifying expiring announcement ${announcement.announcementId}:`, error);
            }
        }
        
        if (expiringAnnouncements.length > 0) {
            console.log(`Notified ${expiringAnnouncements.length} expiring announcements`);
        }
    }

    async sendDailyReport() {
        const stats = await this.bot.transactionService.getTransactionStats();
        const announcementStats = await this.bot.announcementService.getAnnouncementStats();
        
        let dailyReport = '📊 **REPORT GIORNALIERO**\n\n';
        
        if (stats && stats.overall) {
            dailyReport += `🔄 Transazioni totali: ${stats.overall.totalTransactions || 0}\n`;
            dailyReport += `✅ Completate: ${stats.overall.completedTransactions || 0}\n`;
            dailyReport += `⚡ KWH totali erogati: ${(stats.overall.totalKwh || 0).toFixed(1)}\n\n`;
        }
        
        if (announcementStats) {
            dailyReport += `📋 Annunci attivi: ${announcementStats.totalActive || 0}\n`;
            dailyReport += `💰 Prezzo medio: €${(announcementStats.avgPrice || 0).toFixed(3)}/KWH\n\n`;
        }

        // Add pending transactions count
        const pendingTransactions = await this.bot.transactionService.getPendingTransactions();
        dailyReport += `⏳ Transazioni in sospeso: ${pendingTransactions.length}\n`;

        // Add success rate
        if (stats?.overall?.totalTransactions > 0) {
            const successRate = ((stats.overall.completedTransactions / stats.overall.totalTransactions) * 100).toFixed(1);
            dailyReport += `📈 Tasso di successo: ${successRate}%\n`;
        }

        // Add expired announcements count
        const expiredToday = await this.bot.db.getCollection('announcements')
            .find({
                active: false,
                updatedAt: {
                    $gte: new Date(new Date().setHours(0, 0, 0, 0))
                }
            }).count();
        
        dailyReport += `⏰ Annunci scaduti oggi: ${expiredToday}\n`;

        dailyReport += `\n📅 Report del ${new Date().toLocaleDateString('it-IT')}`;
        
        try {
            await this.bot.bot.telegram.sendMessage(this.bot.adminUserId, dailyReport, {
                parse_mode: 'Markdown'
            });
            console.log('Daily report sent to admin');
        } catch (error) {
            console.error('Error sending daily report to admin:', error);
        }
    }

    async weeklyCleanup() {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        try {
            // Archive completed transactions older than 1 month
            const result = await this.bot.db.getCollection('transactions').updateMany(
                { 
                    status: 'completed',
                    completedAt: { $lt: oneMonthAgo }
                },
                { 
                    $set: { archived: true, archivedAt: new Date() }
                }
            );
            
            // Clean up old archived messages
            await this.bot.db.getCollection('archived_messages').deleteMany({
                archivedAt: { $lt: oneMonthAgo }
            });

            // Clean up old session data (if any stored in DB)
            const twoWeeksAgo = new Date();
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
            
            await this.bot.db.getCollection('user_sessions')?.deleteMany({
                lastActivity: { $lt: twoWeeksAgo }
            });

            // Clean up expired announcements older than 7 days
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            
            const expiredCleanup = await this.bot.db.getCollection('announcements').deleteMany({
                active: false,
                expiresAt: { $lt: oneWeekAgo }
            });

            console.log(`🧹 Weekly cleanup completed: ${result.modifiedCount} transactions archived, ${expiredCleanup.deletedCount} old announcements deleted`);
            
            // Send cleanup report to admin
            const cleanupReport = `🧹 **PULIZIA SETTIMANALE COMPLETATA**\n\n` +
                `📦 Transazioni archiviate: ${result.modifiedCount}\n` +
                `🗑️ Messaggi vecchi eliminati\n` +
                `📋 Annunci scaduti rimossi: ${expiredCleanup.deletedCount}\n` +
                `⏰ Sessioni scadute pulite\n\n` +
                `✅ Sistema ottimizzato`;

            await this.bot.bot.telegram.sendMessage(this.bot.adminUserId, cleanupReport, {
                parse_mode: 'Markdown'
            });
            
        } catch (error) {
            console.error('Error in weekly cleanup:', error);
            
            // Notify admin of cleanup failure
            try {
                await this.bot.bot.telegram.sendMessage(this.bot.adminUserId, 
                    `⚠️ **ERRORE PULIZIA SETTIMANALE**\n\n${error.message}`,
                    { parse_mode: 'Markdown' }
                );
            } catch (notifyError) {
                console.error('Could not notify admin of cleanup error:', notifyError);
            }
        }
    }

    async keepAlivePing() {
        const keepAliveUrl = process.env.KEEP_ALIVE_URL;
        
        try {
            const response = await axios.get(keepAliveUrl, {
                timeout: 10000 // 10 seconds timeout
            });
            
            if (response.status === 200) {
                console.log('Keep-alive ping successful');
            } else {
                console.warn(`Keep-alive ping returned status: ${response.status}`);
            }
        } catch (error) {
            console.error('Keep-alive ping failed:', error.message);
            
            // If ping fails multiple times, notify admin
            if (!this.keepAliveFailCount) {
                this.keepAliveFailCount = 0;
            }
            this.keepAliveFailCount++;
            
            if (this.keepAliveFailCount >= 5) { // 5 consecutive failures
                try {
                    await this.bot.bot.telegram.sendMessage(this.bot.adminUserId,
                        `🚨 **KEEP-ALIVE ALERT**\n\n` +
                        `Il servizio keep-alive ha fallito ${this.keepAliveFailCount} volte consecutive.\n` +
                        `Ultimo errore: ${error.message}\n\n` +
                        `Controlla lo stato del server.`,
                        { parse_mode: 'Markdown' }
                    );
                    this.keepAliveFailCount = 0; // Reset after notification
                } catch (notifyError) {
                    console.error('Could not notify admin of keep-alive failures:', notifyError);
                }
            }
        }
    }

    // Method to manually trigger specific jobs (for testing or admin commands)
    async triggerDailyReport() {
        await this.sendDailyReport();
    }

    async triggerWeeklyCleanup() {
        await this.weeklyCleanup();
    }

    async triggerPendingCheck() {
        await this.checkPendingTransactions();
    }
}

module.exports = CronJobHandler;
