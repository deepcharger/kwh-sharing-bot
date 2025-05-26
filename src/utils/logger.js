const winston = require('winston');
const path = require('path');

// Configurazione formato log
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Configurazione trasporti
const transports = [
    // Console output
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    })
];

// File logging solo se LOG_FILE_PATH è configurato
if (process.env.LOG_FILE_PATH) {
    transports.push(
        // File di log generale
        new winston.transports.File({
            filename: path.join(process.env.LOG_FILE_PATH, 'app.log'),
            level: 'info'
        }),
        // File di log per errori
        new winston.transports.File({
            filename: path.join(process.env.LOG_FILE_PATH, 'error.log'),
            level: 'error'
        })
    );
}

// Crea logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports,
    // Non uscire su exception
    exitOnError: false
});

// Handle uncaught exceptions
if (process.env.NODE_ENV === 'production') {
    logger.exceptions.handle(
        new winston.transports.File({ 
            filename: path.join(process.env.LOG_FILE_PATH || '/tmp', 'exceptions.log') 
        })
    );
}

module.exports = logger;
