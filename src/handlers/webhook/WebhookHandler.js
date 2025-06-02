// src/handlers/webhook/WebhookHandler.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const ApiRoutes = require('./ApiRoutes');
const logger = require('../../utils/logger');

class WebhookHandler {
    constructor(bot) {
        this.bot = bot;
        this.apiRoutes = new ApiRoutes(bot);
    }

    async setupWebhook() {
        // Setup Express server for webhook
        this.bot.app.use(express.json());
        
        // Trust proxy for Render.com
        this.bot.app.set('trust proxy', 1);
        
        // Rate limiting
        const limiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 30,
            message: 'Too many requests from this IP',
            standardHeaders: true,
            legacyHeaders: false,
            skip: (req) => req.path === '/',
            keyGenerator: (req) => {
                return req.ip || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
            }
        });
        
        // Apply rate limiting to webhook endpoint
        this.bot.app.use('/webhook', limiter);
        
        // Health check endpoint
        this.bot.app.get('/', async (req, res) => {
            try {
                const dbConnected = await this.bot.db.isConnected().catch(() => false);
                const uptime = process.uptime();
                const memoryUsage = process.memoryUsage();
                
                const healthData = { 
                    status: 'OK', 
                    bot: 'KWH Sharing Bot',
                    version: require('../../../package.json').version,
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
                res.status(200).json({ 
                    status: 'DEGRADED', 
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        // Metrics endpoint
        this.bot.app.get('/metrics', async (req, res) => {
            try {
                const stats = await this.bot.services.transaction.getTransactionStats();
                const pendingCount = (await this.bot.services.transaction.getPendingTransactions()).length;
                const dbConnected = await this.bot.db.isConnected();

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
        
        // Webhook endpoint for Telegram
        this.bot.app.post('/webhook', (req, res) => {
            // Verify webhook secret if configured
            if (process.env.WEBHOOK_SECRET) {
                const secret = req.headers['x-telegram-bot-api-secret-token'];
                if (secret !== process.env.WEBHOOK_SECRET) {
                    logger.warn('Webhook request with invalid secret');
                    return res.status(401).send('Unauthorized');
                }
            }
            
            try {
                this.bot.bot.handleUpdate(req.body);
                res.sendStatus(200);
            } catch (error) {
                logger.error('Error handling webhook:', error);
                res.sendStatus(500);
            }
        });
        
        // Mount API routes
        this.bot.app.use(this.apiRoutes.router);
        
        // Error handler
        this.bot.bot.catch((err, ctx) => {
            logger.error('Bot error:', err);
            if (ctx?.reply) {
                ctx.reply('❌ Si è verificato un errore. Riprova o contatta l\'admin.')
                    .catch(() => logger.error('Could not send error message'));
            }
        });
        
        // Graceful shutdown
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
        
        // Start server
        const PORT = process.env.PORT || 3000;
        this.bot.app.listen(PORT, async () => {
            logger.info(`🚀 Server started on port ${PORT}`);
            
            // Set webhook URL
            if (process.env.NODE_ENV === 'production') {
                await this.configureWebhook();
            } else {
                // In development use polling
                this.bot.bot.launch();
                logger.info('🔄 Bot started in polling mode (development)');
            }
        });
    }

    async configureWebhook() {
        const webhookUrl = process.env.WEBHOOK_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook`;
        const webhookOptions = {
            drop_pending_updates: true
        };
        
        if (process.env.WEBHOOK_SECRET) {
            webhookOptions.secret_token = process.env.WEBHOOK_SECRET;
        }
        
        try {
            await this.bot.bot.telegram.setWebhook(webhookUrl, webhookOptions);
            const webhookInfo = await this.bot.bot.telegram.getWebhookInfo();
            
            logger.info(`✅ Webhook configured: ${webhookUrl}`);
            logger.info(`Webhook info:`, {
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
                        logger.warn('⚠️ Webhook error detected:', updatedInfo.last_error_message);
                        
                        await this.bot.services.notification.notifyAdmin(
                            `⚠️ **WEBHOOK ERROR**\n\n${updatedInfo.last_error_message}`
                        );
                    }
                } catch (checkError) {
                    logger.error('Error checking webhook status:', checkError);
                }
            }, 30000); // Check after 30 seconds
            
        } catch (error) {
            logger.error('❌ Error configuring webhook:', error);
            
            // Fallback to polling if webhook fails
            logger.info('🔄 Fallback to polling mode...');
            this.bot.bot.launch();
        }
    }
}

module.exports = WebhookHandler;
