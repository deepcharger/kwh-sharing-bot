// src/config/constants.js - NUOVO FILE
module.exports = {
    // Bot settings
    BOT_NAME: 'KWH Sharing Bot',
    BOT_VERSION: '2.0.0',
    
    // Transaction statuses
    TRANSACTION_STATUS: {
        PENDING_SELLER: 'pending_seller_confirmation',
        CONFIRMED: 'confirmed',
        BUYER_ARRIVED: 'buyer_arrived',
        CHARGING_STARTED: 'charging_started',
        CHARGING_IN_PROGRESS: 'charging_in_progress',
        CHARGING_COMPLETED: 'charging_completed',
        PHOTO_UPLOADED: 'photo_uploaded',
        KWH_DECLARED: 'kwh_declared',
        PAYMENT_REQUESTED: 'payment_requested',
        PAYMENT_DECLARED: 'payment_declared',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled',
        DISPUTED: 'disputed'
    },
    
    // Announcement settings
    ANNOUNCEMENT: {
        EXPIRE_HOURS: 24,
        MAX_ACTIVE_PER_USER: 5,
        REFRESH_INTERVAL_MINUTES: 15,
        WARNING_BEFORE_EXPIRE_HOURS: 1
    },
    
    // Pricing limits
    PRICING: {
        MIN_PRICE: 0.01,
        MAX_PRICE: 10.00,
        MIN_KWH: 1,
        MAX_KWH: 1000,
        MAX_MINIMUM_KWH: 100
    },
    
    // UI settings
    UI: {
        MAX_BUTTONS_PER_ROW: 2,
        MAX_TRANSACTION_LIST: 8,
        MAX_ANNOUNCEMENT_LIST: 10,
        TEMP_MESSAGE_DURATION: 5000,
        ERROR_MESSAGE_DURATION: 8000
    },
    
    // Cache settings
    CACHE: {
        MAX_SIZE: 100,
        SHORT_ID_LENGTH: 10
    },
    
    // Cron settings
    CRON: {
        CLEANUP_SCHEDULE: '0 * * * *', // Every hour
        DEEP_CLEANUP_SCHEDULE: '0 3 * * *', // 3 AM daily
        STATS_REPORT_SCHEDULE: '0 9 * * *', // 9 AM daily
        KEEP_ALIVE_SCHEDULE: '*/14 * * * *', // Every 14 minutes
        ANNOUNCEMENT_CHECK_SCHEDULE: '*/5 * * * *', // Every 5 minutes
        ANNOUNCEMENT_REFRESH_SCHEDULE: '*/15 * * * *' // Every 15 minutes
    },
    
    // Feedback settings
    FEEDBACK: {
        MIN_FOR_BADGE: 5,
        RELIABLE_THRESHOLD: 90,
        TOP_THRESHOLD: 95
    },
    
    // Error types
    ERROR_TYPES: {
        VALIDATION: 'VALIDATION_ERROR',
        NOT_FOUND: 'NOT_FOUND',
        UNAUTHORIZED: 'UNAUTHORIZED',
        DATABASE: 'DATABASE_ERROR',
        NETWORK: 'NETWORK_ERROR',
        UNKNOWN: 'UNKNOWN_ERROR'
    }
};
