// src/bot/BotInitializer.js
const Database = require('../database/Database');
const UserService = require('../services/UserService');
const AnnouncementService = require('../services/AnnouncementService');
const TransactionService = require('../services/TransactionService');
const KwhBot = require('./KwhBot');
const logger = require('../utils/logger');
const settings = require('../config/settings');

class BotInitializer {
    constructor() {
        this.db = null;
        this.services = {};
        this.bot = null;
    }

    /**
     * Initialize all components
     */
    async initialize() {
        try {
            logger.info('🚀 Starting KWH Bot initialization...');
            
            // Initialize database
            await this.initializeDatabase();
            
            // Initialize services
            await this.initializeServices();
            
            // Initialize bot
            await this.initializeBot();
            
            // Setup graceful shutdown
            this.setupGracefulShutdown();
            
            logger.info('✅ KWH Bot initialization completed!');
            
            return this.bot;
            
        } catch (error) {
            logger.error('❌ Initialization failed:', error);
            await this.cleanup();
            throw error;
        }
    }

    /**
     * Initialize database connection
     */
    async initializeDatabase() {
        logger.info('🔧 Initializing database...');
        
        this.db = new Database(settings.DATABASE.URI);
        await this.db.connect();
        
        logger.info('✅ Database initialized');
    }

    /**
     * Initialize services
     */
    async initializeServices() {
        logger.info('🔧 Initializing services...');
        
        this.services = {
            user: new UserService(this.db),
            announcement: new AnnouncementService(this.db),
            transaction: new TransactionService(this.db)
        };
        
        logger.info('✅ Services initialized');
    }

    /**
     * Initialize bot
     */
    async initializeBot() {
        logger.info('🔧 Initializing bot...');
        
        // Create bot instance
        this.bot = new KwhBot({
            bot: {
                token: settings.BOT.TOKEN,
                username: settings.BOT.USERNAME
            },
            group: {
                id: settings.GROUP.ID,
                topicId: settings.GROUP.TOPIC_ID
            },
            admin: {
                userId: settings.ADMIN.USER_ID,
                username: settings.ADMIN.USERNAME
            }
        });
        
        // Initialize bot with database and services
        await this.bot.initialize(this.db, this.services);
        
        logger.info('✅ Bot initialized');
    }

    /**
     * Start the bot
     */
    async start() {
        if (!this.bot) {
            throw new Error('Bot not initialized');
        }
        
        await this.bot.start();
    }

    /**
     * Setup graceful shutdown
     */
    setupGracefulShutdown() {
        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        
        signals.forEach(signal => {
            process.once(signal, async () => {
                logger.info(`Received ${signal}, shutting down gracefully...`);
                await this.shutdown(signal);
            });
        });
        
        // Handle uncaught exceptions
        process.on('uncaughtException', async (error) => {
            logger.error('Uncaught exception:', error);
            await this.shutdown('uncaughtException');
        });
        
        // Handle unhandled promise rejections
        process.on('unhandledRejection', async (reason, promise) => {
            logger.error('Unhandled rejection at:', promise, 'reason:', reason);
            await this.shutdown('unhandledRejection');
        });
    }

    /**
     * Shutdown the application
     */
    async shutdown(signal) {
        try {
            logger.info(`Shutting down (${signal})...`);
            
            // Stop the bot
            if (this.bot && this.bot.isRunning) {
                await this.bot.stop(signal);
            }
            
            // Cleanup resources
            await this.cleanup();
            
            logger.info('✅ Shutdown completed');
            process.exit(0);
            
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        try {
            // Disconnect from database
            if (this.db) {
                await this.db.disconnect();
            }
            
            // Clear services
            this.services = {};
            
            // Clear bot reference
            this.bot = null;
            
        } catch (error) {
            logger.error('Error during cleanup:', error);
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        const health = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            components: {}
        };
        
        // Check database
        try {
            const dbConnected = await this.db?.isConnected();
            health.components.database = {
                status: dbConnected ? 'healthy' : 'unhealthy'
            };
        } catch (error) {
            health.components.database = {
                status: 'unhealthy',
                error: error.message
            };
        }
        
        // Check bot
        if (this.bot) {
            health.components.bot = {
                status: this.bot.isRunning ? 'healthy' : 'unhealthy',
                initialized: this.bot.isInitialized,
                stats: this.bot.getStats()
            };
        }
        
        // Overall status
        const unhealthyComponents = Object.values(health.components)
            .filter(c => c.status !== 'healthy');
        
        if (unhealthyComponents.length > 0) {
            health.status = 'DEGRADED';
        }
        
        return health;
    }
}

module.exports = BotInitializer;
