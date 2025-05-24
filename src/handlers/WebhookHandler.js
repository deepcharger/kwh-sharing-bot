const express = require('express');
const rateLimit = require('express-rate-limit');

class WebhookHandler {
    constructor(bot) {
        this.bot = bot;
    }

    async setupWebhook() {
        // Setup Express server for webhook
        this.bot.app.use(express.json());
        
        // Trust proxy for Render.com - specific configuration
        this.bot.app.set('trust proxy', 1); // Trust first proxy
        
        // Rate limiting with proper configuration for proxied requests
        const limiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 30, // limit each IP to 30 requests per windowMs
            message: 'Too many requests from this IP',
            standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
            legacyHeaders: false, // Disable the `X-RateLimit-*` headers
            // Skip rate limiting for health checks
            skip: (req) => req.path === '/',
            // Use custom key generator that handles proxied IPs properly
            keyGenerator: (req) => {
                // For Render.com, use the X-Forwarded-For header
                return req.ip || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
            }
        });
        
        // Apply rate limiting to webhook endpoint
        this.bot.app.use('/webhook', limiter);
        
        // Health check endpoint with database status
        this.bot.app.get('/', async (req, res) => {
            try {
                const dbConnected = await this.bot.db.isConnected().catch(() => false);
                const uptime = process.uptime();
                const memoryUsage = process.memoryUsage();
                
                const healthData = { 
                    status: 'OK', 
                    bot: 'KWH Sharing Bot',
                    version: '1.0.0',
                    timestamp: new Date().toISOString(),
                    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
                    database: dbConnected ? 'connected' : 'disconnected',
                    environment: process.env.NODE_ENV || 'development',
                    memory: {
                        used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                        total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
                    }
                };

                res.json(healthData);
            } catch (error) {
                // Use 200 to avoid Render marking as unhealthy
                res.status(200).json({ 
                    status: 'DEGRADED', 
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // API status endpoint
        this.bot.app.get('/api/status', async (req, res) => {
            try {
                const stats = await this.bot.transactionService.getTransactionStats();
                const announcementStats = await this.bot.announcementService.getAnnouncementStats();
                const pendingTransactions = await this.bot.transactionService.getPendingTransactions();

                res.json({
                    status: 'online',
                    transactions: {
                        total: stats?.overall?.totalTransactions || 0,
                        completed: stats?.overall?.completedTransactions || 0,
                        pending: pendingTransactions.length
                    },
                    announcements: {
                        active: announcementStats?.totalActive || 0,
                        avgPrice: announcementStats?.avgPrice || 0
                    },
                    lastUpdate: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    message: error.message
                });
            }
        });
        
        // Webhook endpoint for Telegram with security
        this.bot.app.post('/webhook', (req, res) => {
            // Verify webhook secret if configured
            if (process.env.WEBHOOK_SECRET) {
                const secret = req.headers['x-telegram-bot-api-secret-token'];
                if (secret !== process.env.WEBHOOK_SECRET) {
                    console.warn('Webhook request with invalid secret');
                    return res.status(401).send('Unauthorized');
                }
            }
            
            try {
                this.bot.bot.handleUpdate(req.body);
                res.sendStatus(200);
            } catch (error) {
                console.error('Error handling webhook:', error);
                res.sendStatus(500);
            }
        });

        // Admin endpoints (protected)
        this.bot.app.get('/admin/stats', async (req, res) => {
            // Simple auth check
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (token !== process.env.ADMIN_API_TOKEN) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            try {
                const stats = await this.bot.transactionService.getTransactionStats();
                const announcementStats = await this.bot.announcementService.getAnnouncementStats();
                const users = await this.bot.userService.getAllUsersWithStats();

                res.json({
                    transactions: stats,
                    announcements: announcementStats,
                    users: {
                        total: users.length,
                        topSellers: users.filter(u => u.sellerBadge === 'TOP').length,
                        reliableSellers: users.filter(u => u.sellerBadge === 'AFFIDABILE').length
                    }
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Metrics endpoint for monitoring
        this.bot.app.get('/metrics', async (req, res) => {
            try {
                const stats = await this.bot.transactionService.getTransactionStats();
                const pendingCount = (await this.bot.transactionService.getPendingTransactions()).length;
                const dbConnected = await this.bot.db.isConnected();

                // Prometheus-style metrics
                const metrics = [
                    `# HELP kwh_bot_transactions_total Total number of transactions`,
                    `# TYPE kwh_bot_transactions_total counter`,
                    `kwh_bot_transactions_total ${stats?.overall?.totalTransactions || 0}`,
                    ``,
                    `# HELP kwh_bot_transactions_completed Completed transactions`,
                    `# TYPE kwh_bot_transactions_completed counter`, 
                    `kwh_bot_transactions_completed ${stats?.overall?.completedTransactions || 0}`,
                    ``,
                    `# HELP kwh_bot_transactions_pending Pending transactions`,
                    `# TYPE kwh_bot_transactions_pending gauge`,
                    `kwh_bot_transactions_pending ${pendingCount}`,
                    ``,
                    `# HELP kwh_bot_database_connected Database connection status`,
                    `# TYPE kwh_bot_database_connected gauge`,
                    `kwh_bot_database_connected ${dbConnected ? 1 : 0}`,
                    ``,
                    `# HELP kwh_bot_uptime_seconds Bot uptime in seconds`,
                    `# TYPE kwh_bot_uptime_seconds counter`,
                    `kwh_bot_uptime_seconds ${process.uptime()}`,
                    ``
                ].join('\n');

                res.set('Content-Type', 'text/plain');
                res.send(metrics);
            } catch (error) {
                res.status(500).send('Error generating metrics');
            }
        });

        // Error handler
        this.bot.bot.catch((err, ctx) => {
            console.error('Bot error:', err);
            if (ctx?.reply) {
                ctx.reply('❌ Si è verificato un errore. Riprova o contatta l\'admin.')
                    .catch(() => console.error('Could not send error message'));
            }
        });
        
        // Graceful shutdown
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
        
        // Start server
        const PORT = process.env.PORT || 3000;
        this.bot.app.listen(PORT, async () => {
            console.log(`🚀 Server avviato sulla porta ${PORT}`);
            
            // Set webhook URL
            if (process.env.NODE_ENV === 'production') {
                await this.configureWebhook();
            } else {
                // In sviluppo usa polling
                this.bot.bot.launch();
                console.log('🔄 Bot avviato in modalità polling (sviluppo)');
            }
        });
    }

    async configureWebhook() {
        const webhookUrl = process.env.WEBHOOK_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook`;
        const webhookOptions = {
            drop_pending_updates: true
        };
        
        // Add webhook secret if configured
        if (process.env.WEBHOOK_SECRET) {
            webhookOptions.secret_token = process.env.WEBHOOK_SECRET;
        }
        
        try {
            await this.bot.bot.telegram.setWebhook(webhookUrl, webhookOptions);
            const webhookInfo = await this.bot.bot.telegram.getWebhookInfo();
            
            console.log(`✅ Webhook configurato: ${webhookUrl}`);
            console.log(`Webhook info:`, {
                url: webhookInfo.url,
                has_custom_certificate: webhookInfo.has_custom_certificate,
                pending_update_count: webhookInfo.pending_update_count,
                last_error_date: webhookInfo.last_error_date,
                last_error_message: webhookInfo.last_error_message
            });

            // Verify webhook is working
            setTimeout(async () => {
                try {
                    const updatedInfo = await this.bot.bot.telegram.getWebhookInfo();
                    if (updatedInfo.last_error_date) {
                        console.warn('⚠️ Webhook error detected:', updatedInfo.last_error_message);
                        
                        // Notify admin of webhook issues
                        try {
                            await this.bot.bot.telegram.sendMessage(
                                this.bot.adminUserId,
                                `⚠️ **WEBHOOK ERROR**\n\n${updatedInfo.last_error_message}`,
                                { parse_mode: 'Markdown' }
                            );
                        } catch (notifyError) {
                            console.error('Could not notify admin of webhook error:', notifyError);
                        }
                    }
                } catch (checkError) {
                    console.error('Error checking webhook status:', checkError);
                }
            }, 30000); // Check after 30 seconds
            
        } catch (error) {
            console.error('❌ Errore configurazione webhook:', error);
            
            // Fallback to polling if webhook fails
            console.log('🔄 Fallback a polling mode...');
            this.bot.bot.launch();
        }
    }

    // Method to update webhook URL (useful for dynamic environments)
    async updateWebhook(newUrl) {
        try {
            const webhookOptions = {
                drop_pending_updates: false
            };
            
            if (process.env.WEBHOOK_SECRET) {
                webhookOptions.secret_token = process.env.WEBHOOK_SECRET;
            }
            
            await this.bot.bot.telegram.setWebhook(newUrl, webhookOptions);
            console.log(`✅ Webhook aggiornato: ${newUrl}`);
            
            return true;
        } catch (error) {
            console.error('❌ Errore aggiornamento webhook:', error);
            return false;
        }
    }

    // Method to get webhook info
    async getWebhookInfo() {
        try {
            return await this.bot.bot.telegram.getWebhookInfo();
        } catch (error) {
            console.error('Error getting webhook info:', error);
            return null;
        }
    }

    // Method to delete webhook (switch to polling)
    async deleteWebhook() {
        try {
            await this.bot.bot.telegram.deleteWebhook();
            console.log('✅ Webhook eliminato, switch a polling');
            
            // Start polling
            this.bot.bot.launch();
            return true;
        } catch (error) {
            console.error('Error deleting webhook:', error);
            return false;
        }
    }
}

module.exports = WebhookHandler;
