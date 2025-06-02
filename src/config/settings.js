// src/config/settings.js - NUOVO FILE
require('dotenv').config();

module.exports = {
    // Environment
    ENV: process.env.NODE_ENV || 'development',
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    DEBUG: process.env.DEBUG === 'true',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    
    // Bot configuration
    BOT: {
        TOKEN: process.env.BOT_TOKEN,
        USERNAME: process.env.BOT_USERNAME,
        WEBHOOK_URL: process.env.WEBHOOK_URL,
        WEBHOOK_SECRET: process.env.WEBHOOK_SECRET
    },
    
    // Group configuration
    GROUP: {
        ID: process.env.GROUP_ID,
        TOPIC_ID: process.env.TOPIC_ID
    },
    
    // Admin configuration
    ADMIN: {
        USER_ID: process.env.ADMIN_USER_ID,
        USERNAME: process.env.ADMIN_USERNAME,
        API_TOKEN: process.env.ADMIN_API_TOKEN
    },
    
    // Database configuration
    DATABASE: {
        URI: process.env.MONGODB_URI,
        NAME: 'kwh_bot',
        OPTIONS: {
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 10000
        }
    },
    
    // Server configuration
    SERVER: {
        PORT: process.env.PORT || 3000,
        KEEP_ALIVE_URL: process.env.KEEP_ALIVE_URL
    },
    
    // Rate limiting
    RATE_LIMIT: {
        WINDOW_MS: 1 * 60 * 1000, // 1 minute
        MAX_REQUESTS: 30,
        MESSAGE: 'Too many requests from this IP'
    },
    
    // Session configuration
    SESSION: {
        TTL: 6 * 60 * 60 // 6 hours in seconds
    },
    
    // Feature flags
    FEATURES: {
        ENABLE_ANALYTICS: process.env.ENABLE_ANALYTICS === 'true',
        ENABLE_KEEP_ALIVE: process.env.NODE_ENV === 'production' && !!process.env.KEEP_ALIVE_URL,
        ENABLE_WEBHOOK: process.env.NODE_ENV === 'production',
        ENABLE_RATE_LIMIT: true
    }
};
