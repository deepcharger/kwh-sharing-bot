// src/bot/KwhBot.js
const { Telegraf, Scenes, session } = require('telegraf');
const express = require('express');
const HandlerRegistry = require('../handlers/base/HandlerRegistry');
const sceneFactory = require('../scenes/base/SceneFactory');
const { TransactionCache } = require('../utils/TransactionCache');
const ChatCleaner = require('../utils/ChatCleaner');
const logger = require('../utils/logger');
const { TRANSACTION_STATUS } = require('../config/constants');

class KwhBot {
    constructor(config) {
        this.config = config;
        this.bot = new Telegraf(config.bot.token);
        this.app = express();
        
        // Core components
        this.db = null;
        this.services = {};
        this.handlerRegistry = new HandlerRegistry(this);
        
        // Bot settings
        this.groupId = config.group.id;
        this.topicId = config.group.topicId;
        this.adminUserId = config.admin.userId;
        
        // Utilities
        this.transactionCache = new TransactionCache();
        this.chatCleaner = null;
        
        // State
        this.isInitialized = false;
        this.isRunning = false;
    }

    /**
     * Initialize the bot
     */
    async initialize(db, services) {
        if (this.isInitialized) {
            logger.warn('Bot already initialized');
            return;
        }

        try {
            logger.info('🚀 Initializing KWH Bot...');
            
            // Set core dependencies
            this.db = db;
            this.services = services;
            
            // Initialize chat cleaner
            this.chatCleaner = new ChatCleaner(this);
            
            // Setup bot components
            await this.setupMiddleware();
            await this.setupHandlers();
            await this.setupScenes();
            await this.setupCommands();
            
            // Setup error handling
            this.setupErrorHandling();
            
            this.isInitialized = true;
            logger.info('✅ Bot initialized successfully');
            
        } catch (error) {
            logger.error('❌ Bot initialization failed:', error);
            throw error;
        }
    }

    /**
     * Setup middleware
     */
    async setupMiddleware() {
        logger.info('🔧 Setting up middleware...');
        
        // Session middleware (MUST come first)
        this.bot.use(session({
            defaultSession: () => ({}),
            ttl: 6 * 60 * 60 // 6 hours
        }));
        
        // Logging middleware
        this.bot.use(async (ctx, next) => {
            const start = Date.now();
            await next();
            const ms = Date.now() - start;
            logger.debug(`Response time: ${ms}ms`);
        });
        
        // User verification middleware
        this.bot.use(async (ctx, next) => {
            if (ctx.chat?.type === 'private') {
                const userId = ctx.from.id;
                
                // Register/update user
                await this.services.user.upsertUser({
                    userId: ctx.from.id,
                    username: ctx.from.username,
                    firstName: ctx.from.first_name,
                    lastName: ctx.from.last_name,
                    lastActivity: new Date()
                });
            }
            
            // Delete user messages in the topic (keep only announcements)
            if (ctx.chat?.id == this.groupId && ctx.message?.message_thread_id == this.topicId) {
                if (!ctx.message.text?.startsWith('🔋 Vendita kWh sharing')) {
                    try {
                        await ctx.deleteMessage();
                    } catch (error) {
                        logger.debug('Cannot delete message:', error.description);
                    }
                    return;
                }
            }
            
            return next();
        });
        
        logger.info('✅ Middleware setup completed');
    }

    /**
     * Setup handlers
     */
    async setupHandlers() {
        logger.info('🔧 Setting up handlers...');
        
        // Import and register handlers
        const CommandHandler = require('../handlers/commands/CommandHandler');
        const CallbackRouter = require('../handlers/callbacks/CallbackRouter');
        const MessageHandler = require('../handlers/messages/MessageHandler');
        const CronJobHandler = require('../handlers/cron/CronJobHandler');
        const WebhookHandler = require('../handlers/webhook/WebhookHandler');
        const NotificationService = require('../services/NotificationService');
        
        // Create notification service
        this.services.notification = new NotificationService(this);
        
        // Register handlers
        this.handlerRegistry.register('command', new CommandHandler(this));
        this.handlerRegistry.register('callback', new CallbackRouter(this));
        this.handlerRegistry.register('message', new MessageHandler(this));
        this.handlerRegistry.register('cron', new CronJobHandler(this));
        this.handlerRegistry.register('webhook', new WebhookHandler(this));
        
        // Setup all handlers
        await this.handlerRegistry.setupAll();
        
        logger.info('✅ Handlers setup completed');
    }

    /**
     * Setup scenes
     */
    async setupScenes() {
        logger.info('🔧 Setting up scenes...');
        
        // Create all scenes
        const scenes = sceneFactory.createAll(this);
        
        // Setup stage
        const stage = new Scenes.Stage(scenes);
        this.bot.use(stage.middleware());
        
        logger.info('✅ Scenes setup completed');
    }

    /**
     * Setup bot commands
     */
    async setupCommands() {
        try {
            const commands = [
                { command: 'start', description: 'Avvia il bot e mostra il menu principale' },
                { command: 'menu', description: 'Mostra il menu principale' },
                { command: 'help', description: 'Mostra la guida completa del bot' },
                { command: 'pagamenti', description: 'Visualizza pagamenti in sospeso' },
                { command: 'feedback_mancanti', description: 'Mostra feedback da lasciare' },
                { command: 'admin', description: 'Dashboard amministratore (solo admin)' },
                { command: 'stats', description: 'Mostra statistiche generali (solo admin)' }
            ];
            
            await this.bot.telegram.setMyCommands(commands);
            logger.info('✅ Bot commands set successfully');
            
        } catch (error) {
            logger.error('Error setting commands:', error);
        }
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        this.bot.catch((err, ctx) => {
            logger.error('Bot error:', err);
            if (ctx?.reply) {
                ctx.reply('❌ Si è verificato un errore. Riprova o contatta l\'admin.')
                    .catch(() => logger.error('Could not send error message'));
            }
        });
    }

    /**
     * Start the bot
     */
    async start() {
        if (!this.isInitialized) {
            throw new Error('Bot must be initialized before starting');
        }
        
        if (this.isRunning) {
            logger.warn('Bot is already running');
            return;
        }
        
        try {
            logger.info('🚀 Starting bot...');
            
            // Setup webhook handler
            const webhookHandler = this.handlerRegistry.get('webhook');
            await webhookHandler.setupWebhook();
            
            this.isRunning = true;
            logger.info('✅ Bot started successfully');
            
        } catch (error) {
            logger.error('❌ Failed to start bot:', error);
            throw error;
        }
    }

    /**
     * Stop the bot
     */
    async stop(signal = 'SIGTERM') {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        
        try {
            this.isRunning = false;
            
            // Stop cron jobs
            const cronHandler = this.handlerRegistry.get('cron');
            if (cronHandler) {
                cronHandler.stopAll();
            }
            
            // Stop bot
            await this.bot.stop(signal);
            
            // Cleanup handlers
            await this.handlerRegistry.cleanup();
            
            logger.info('✅ Bot stopped successfully');
            
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
            throw error;
        }
    }

    // Helper methods for transaction cache
    cacheTransactionId(shortId, fullId) {
        this.transactionCache.set(shortId, fullId);
    }

    getFullTransactionId(shortId) {
        return this.transactionCache.get(shortId);
    }

    async findTransactionByShortId(shortId, userId) {
        return await this.transactionCache.findTransactionByShortId(shortId, userId, this.services.transaction);
    }

    async findAnnouncementByShortId(shortId, userId) {
        return await this.transactionCache.findAnnouncementByShortId(shortId, userId, this.services.announcement);
    }

    // Helper methods for UI formatting
    getStatusEmoji(status) {
        const statusEmojis = {
            [TRANSACTION_STATUS.PENDING_SELLER]: '⏳',
            [TRANSACTION_STATUS.CONFIRMED]: '✅',
            [TRANSACTION_STATUS.BUYER_ARRIVED]: '📍',
            [TRANSACTION_STATUS.CHARGING_STARTED]: '⚡',
            [TRANSACTION_STATUS.CHARGING_IN_PROGRESS]: '🔋',
            [TRANSACTION_STATUS.CHARGING_COMPLETED]: '🏁',
            [TRANSACTION_STATUS.PHOTO_UPLOADED]: '📷',
            [TRANSACTION_STATUS.KWH_DECLARED]: '📊',
            [TRANSACTION_STATUS.PAYMENT_REQUESTED]: '💳',
            [TRANSACTION_STATUS.PAYMENT_DECLARED]: '💰',
            [TRANSACTION_STATUS.COMPLETED]: '✅',
            [TRANSACTION_STATUS.CANCELLED]: '❌',
            [TRANSACTION_STATUS.DISPUTED]: '⚠️'
        };
        return statusEmojis[status] || '❓';
    }

    getStatusText(status) {
        const statusTexts = {
            [TRANSACTION_STATUS.PENDING_SELLER]: 'Attesa conferma',
            [TRANSACTION_STATUS.CONFIRMED]: 'Confermata',
            [TRANSACTION_STATUS.BUYER_ARRIVED]: 'Acquirente arrivato',
            [TRANSACTION_STATUS.CHARGING_STARTED]: 'Ricarica avviata',
            [TRANSACTION_STATUS.CHARGING_IN_PROGRESS]: 'In ricarica',
            [TRANSACTION_STATUS.CHARGING_COMPLETED]: 'Ricarica completata',
            [TRANSACTION_STATUS.PHOTO_UPLOADED]: 'Foto caricata',
            [TRANSACTION_STATUS.KWH_DECLARED]: 'KWH dichiarati',
            [TRANSACTION_STATUS.PAYMENT_REQUESTED]: 'Pagamento richiesto',
            [TRANSACTION_STATUS.PAYMENT_DECLARED]: 'Pagamento dichiarato',
            [TRANSACTION_STATUS.COMPLETED]: 'Completata',
            [TRANSACTION_STATUS.CANCELLED]: 'Annullata',
            [TRANSACTION_STATUS.DISPUTED]: 'In disputa'
        };
        return statusTexts[status] || status;
    }

    // Statistics methods
    getStats() {
        return {
            initialized: this.isInitialized,
            running: this.isRunning,
            handlers: this.handlerRegistry.getStats(),
            cache: this.transactionCache.getStats(),
            cleaner: this.chatCleaner.getStats()
        };
    }
}

module.exports = KwhBot;
