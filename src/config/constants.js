// src/config/constants.js - Costanti aggiornate per il refactoring

// Stati delle transazioni
const TRANSACTION_STATUS = {
    // Stati iniziali
    PENDING_SELLER: 'pending_seller',           // In attesa conferma venditore
    CONFIRMED: 'confirmed',                     // Confermata dal venditore
    
    // Stati durante la ricarica
    BUYER_ARRIVED: 'buyer_arrived',             // Acquirente arrivato
    CHARGING_STARTED: 'charging_started',       // Ricarica avviata
    CHARGING_IN_PROGRESS: 'charging_in_progress', // Ricarica in corso
    CHARGING_COMPLETED: 'charging_completed',   // Ricarica completata
    
    // Stati post-ricarica
    PHOTO_UPLOADED: 'photo_uploaded',           // Foto display caricata
    KWH_DECLARED: 'kwh_declared',               // KWH dichiarati
    PAYMENT_REQUESTED: 'payment_requested',     // Pagamento richiesto
    PAYMENT_DECLARED: 'payment_declared',       // Pagamento dichiarato
    
    // Stati finali
    COMPLETED: 'completed',                     // Completata
    CANCELLED: 'cancelled',                     // Annullata
    DISPUTED: 'disputed'                        // In disputa
};

// Tipi di errore per ErrorHandler
const ERROR_TYPES = {
    VALIDATION: 'validation',       // Errori di validazione input
    NOT_FOUND: 'not_found',        // Risorsa non trovata
    UNAUTHORIZED: 'unauthorized',   // Non autorizzato
    DATABASE: 'database',          // Errori database
    NETWORK: 'network',            // Errori di rete/Telegram
    SYSTEM: 'system',              // Errori di sistema
    UNKNOWN: 'unknown'             // Errori non classificati
};

// Configurazione prezzi
const PRICING = {
    MIN_PRICE: 0.15,               // Prezzo minimo per KWH
    MAX_PRICE: 1.00,               // Prezzo massimo per KWH
    DEFAULT_PRICE: 0.35,           // Prezzo di default
    CURRENCY: '€'                  // Valuta
};

// Limiti sistema
const LIMITS = {
    MAX_ANNOUNCEMENTS_PER_USER: 3,    // Max annunci per utente
    MAX_ZONES_PER_ANNOUNCEMENT: 10,   // Max zone per annuncio
    MAX_NETWORKS_PER_ANNOUNCEMENT: 20, // Max reti per annuncio
    MIN_KWH: 5,                       // KWH minimi per transazione
    MAX_KWH: 200,                     // KWH massimi per transazione
    ANNOUNCEMENT_EXPIRY_HOURS: 24,    // Ore di validità annuncio
    SESSION_TIMEOUT_MINUTES: 30,      // Timeout sessione scene
    MAX_TRANSACTION_ISSUES: 5,        // Max problemi per transazione
    MAX_RETRY_ATTEMPTS: 3             // Max tentativi retry
};

// Configurazione cron jobs
const CRON = {
    CLEANUP_SCHEDULE: '0 */1 * * *',           // Ogni ora
    DEEP_CLEANUP_SCHEDULE: '0 2 * * *',        // Ogni giorno alle 2:00
    ANNOUNCEMENT_CHECK_SCHEDULE: '*/10 * * * *', // Ogni 10 minuti
    ANNOUNCEMENT_REFRESH_SCHEDULE: '*/15 * * * *', // Ogni 15 minuti
    NOTIFICATION_SCHEDULE: '*/5 * * * *',       // Ogni 5 minuti
    STATS_REPORT_SCHEDULE: '0 9 * * *',        // Ogni giorno alle 9:00
    KEEP_ALIVE_SCHEDULE: '*/14 * * * *'         // Ogni 14 minuti (per servizi gratuiti)
};

// Configurazione cache
const CACHE = {
    TRANSACTION_CACHE_SIZE: 100,       // Max elementi cache transazioni
    ANNOUNCEMENT_CACHE_SIZE: 50,       // Max elementi cache annunci
    SESSION_CACHE_SIZE: 1000,          // Max sessioni in cache
    CACHE_TTL_HOURS: 6,                // TTL cache in ore
    CLEANUP_INTERVAL_MINUTES: 60       // Intervallo pulizia cache
};

// Messaggi di sistema
const SYSTEM_MESSAGES = {
    BOT_STARTING: '🚀 KWH Sharing Bot is starting...',
    BOT_READY: '✅ KWH Sharing Bot is ready!',
    BOT_STOPPING: '🛑 KWH Sharing Bot is stopping...',
    DATABASE_CONNECTED: '✅ Database connected',
    DATABASE_DISCONNECTED: '❌ Database disconnected',
    WEBHOOK_CONFIGURED: '✅ Webhook configured',
    SCENES_SETUP: '✅ Scenes setup completed',
    HANDLERS_SETUP: '✅ Handlers setup completed'
};

// Configurazione notifiche
const NOTIFICATIONS = {
    TYPES: {
        TRANSACTION_UPDATE: 'transaction_update',
        REMINDER: 'reminder',
        ANNOUNCEMENT: 'announcement',
        ADMIN_ALERT: 'admin_alert',
        SYSTEM: 'system'
    },
    REMINDER_TYPES: {
        PENDING_CONFIRMATION: 'pending_confirmation',
        PAYMENT_PENDING: 'payment_pending',
        FEEDBACK_MISSING: 'feedback_missing',
        ANNOUNCEMENT_EXPIRING: 'announcement_expiring',
        CHARGING_SCHEDULED: 'charging_scheduled'
    },
    DELAYS: {
        PAYMENT_REMINDER_HOURS: 1,
        FEEDBACK_REMINDER_HOURS: 72,
        ANNOUNCEMENT_EXPIRY_WARNING_HOURS: 4,
        TRANSACTION_TIMEOUT_HOURS: 24
    }
};

// Badge venditore
const SELLER_BADGES = {
    NONE: null,
    AFFIDABILE: 'AFFIDABILE',    // >90% feedback positivi
    TOP: 'TOP'                   // >95% feedback positivi
};

// Metodi di pagamento supportati
const PAYMENT_METHODS = {
    PAYPAL: 'PayPal',
    BONIFICO: 'Bonifico bancario',
    SATISPAY: 'Satispay',
    CONTANTI: 'Contanti',
    CRYPTO: 'Criptovalute',
    ALTRO: 'Altro'
};

// Tipi di corrente
const CURRENT_TYPES = {
    DC_ONLY: 'dc_only',           // Solo corrente continua
    AC_ONLY: 'ac_only',           // Solo corrente alternata
    BOTH: 'both'                  // Entrambe
};

// Reti di ricarica principali
const CHARGING_NETWORKS = {
    ENEL_X: 'Enel X',
    IONITY: 'Ionity',
    TESLA: 'Tesla Supercharger',
    FASTNED: 'Fastned',
    ALLEGO: 'Allego',
    REPOWER: 'Repower',
    DUFERCO: 'Duferco',
    FREE_TO_X: 'Free To X',
    NEXTCHARGE: 'NextCharge',
    ALTRO: 'Altro'
};

// Configurazione rate limiting
const RATE_LIMITS = {
    WEBHOOK_PER_MINUTE: 30,        // Max richieste webhook per minuto
    CALLBACKS_PER_MINUTE: 60,      // Max callback per minuto per utente
    MESSAGES_PER_MINUTE: 20,       // Max messaggi per minuto per utente
    COMMANDS_PER_MINUTE: 10        // Max comandi per minuto per utente
};

// Configurazione logging
const LOGGING = {
    LEVELS: {
        ERROR: 'error',
        WARN: 'warn',
        INFO: 'info',
        DEBUG: 'debug'
    },
    RETENTION_DAYS: 30,            // Giorni di retention log
    MAX_LOG_SIZE_MB: 100,          // Dimensione massima log in MB
    ROTATE_INTERVAL: 'daily'       // Intervallo rotazione log
};

// File patterns per pulizia
const CLEANUP_PATTERNS = {
    TEMPORARY_FILES: /^temp_.*$/,
    LOG_FILES: /\.log$/,
    CACHE_FILES: /^cache_.*$/,
    BACKUP_FILES: /\.bak$/
};

// Configurazione health check
const HEALTH_CHECK = {
    INTERVALS: {
        DATABASE: 60000,           // 1 minuto
        TELEGRAM_API: 120000,      // 2 minuti
        MEMORY: 300000,            // 5 minuti
        DISK_SPACE: 600000         // 10 minuti
    },
    THRESHOLDS: {
        MEMORY_USAGE_PERCENT: 85,  // Soglia memoria
        DISK_USAGE_PERCENT: 90,    // Soglia disco
        ERROR_RATE_PERCENT: 10,    // Soglia errori
        RESPONSE_TIME_MS: 5000     // Tempo risposta massimo
    }
};

// Export everything
module.exports = {
    TRANSACTION_STATUS,
    ERROR_TYPES,
    PRICING,
    LIMITS,
    CRON,
    CACHE,
    SYSTEM_MESSAGES,
    NOTIFICATIONS,
    SELLER_BADGES,
    PAYMENT_METHODS,
    CURRENT_TYPES,
    CHARGING_NETWORKS,
    RATE_LIMITS,
    LOGGING,
    CLEANUP_PATTERNS,
    HEALTH_CHECK
};
