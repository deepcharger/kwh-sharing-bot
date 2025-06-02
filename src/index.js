// src/index.js
require('dotenv').config();
const BotInitializer = require('./bot/BotInitializer');
const logger = require('./utils/logger');

/**
 * KWH Sharing Bot - Main Entry Point
 * Version 2.0.0
 * 
 * This is the main entry point for the application.
 * It initializes the bot using BotInitializer and handles
 * graceful shutdown and health monitoring.
 */

// Store global reference for cleanup
let botInitializer = null;

/**
 * Main application entry point
 */
async function main() {
    botInitializer = new BotInitializer();
    
    try {
        // Initialize and start the bot
        await botInitializer.initialize();
        await botInitializer.start();
        
        logger.info('🚀 KWH Sharing Bot is running!');
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`Port: ${process.env.PORT || 3000}`);
        
        // Setup health check monitoring
        if (process.env.NODE_ENV === 'production') {
            setInterval(async () => {
                const health = await botInitializer.healthCheck();
                if (health.status !== 'OK') {
                    logger.warn('Health check failed:', health);
                }
            }, 60000); // Check every minute
        }
        
    } catch (error) {
        logger.error('Failed to start application:', error);
        process.exit(1);
    }
}

// Graceful shutdown handlers
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    if (botInitializer) {
        botInitializer.shutdown('uncaughtException').finally(() => process.exit(1));
    } else {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    if (botInitializer) {
        botInitializer.shutdown('unhandledRejection').finally(() => process.exit(1));
    } else {
        process.exit(1);
    }
});

// Start the application
main().catch(error => {
    logger.error('Unhandled error in main:', error);
    process.exit(1);
});
