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

            console.log(`🧹 Weekly cleanup completed: ${result.modifiedCount} transactions archived`);
            
            // Send cleanup report to admin
            const cleanupReport = `🧹 **PULIZIA SETTIMANALE COMPLETATA**\n\n` +
                `📦 Transazioni archiviate: ${result.modifiedCount}\n` +
                `🗑️ Messaggi vecchi eliminati\n` +
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
