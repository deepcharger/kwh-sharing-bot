// src/utils/helpers/ErrorHandler.js
const logger = require('../logger');
const { ERROR_TYPES } = require('../../config/constants');

class ErrorHandler {
    /**
     * Handle error uniformly
     */
    static async handle(error, ctx, severity = 'error') {
        // Log the error
        this.logError(error, ctx, severity);
        
        // Get error details
        const errorDetails = this.parseError(error);
        
        // Notify user if context available
        if (ctx) {
            await this.notifyUser(ctx, errorDetails);
        }
        
        // Notify admin if critical
        if (this.isCritical(errorDetails.type, severity)) {
            await this.notifyAdmin(error, ctx, errorDetails);
        }
        
        // Track error metrics
        this.trackError(errorDetails);
        
        return errorDetails;
    }

    /**
     * Log error with context
     */
    static logError(error, ctx, severity) {
        const logData = {
            message: error.message,
            stack: error.stack,
            severity,
            timestamp: new Date().toISOString()
        };
        
        if (ctx) {
            logData.user = {
                id: ctx.from?.id,
                username: ctx.from?.username
            };
            logData.chat = {
                id: ctx.chat?.id,
                type: ctx.chat?.type
            };
            
            if (ctx.callbackQuery) {
                logData.callbackData = ctx.callbackQuery.data;
            }
        }
        
        switch (severity) {
            case 'critical':
                logger.error('CRITICAL ERROR:', logData);
                break;
            case 'error':
                logger.error('Error:', logData);
                break;
            case 'warning':
                logger.warn('Warning:', logData);
                break;
            default:
                logger.info('Info:', logData);
        }
    }

    /**
     * Parse error to get type and details
     */
    static parseError(error) {
        const details = {
            type: ERROR_TYPES.UNKNOWN,
            message: error.message || 'Unknown error',
            code: error.code,
            originalError: error
        };
        
        // Determine error type
        if (error.code === 11000) {
            details.type = ERROR_TYPES.DATABASE;
            details.message = 'Duplicate entry error';
        } else if (error.name === 'ValidationError') {
            details.type = ERROR_TYPES.VALIDATION;
            details.message = 'Validation failed';
        } else if (error.message?.includes('not found')) {
            details.type = ERROR_TYPES.NOT_FOUND;
            details.message = 'Resource not found';
        } else if (error.message?.includes('unauthorized')) {
            details.type = ERROR_TYPES.UNAUTHORIZED;
            details.message = 'Unauthorized access';
        } else if (error.code === 'ETELEGRAM') {
            details.type = ERROR_TYPES.NETWORK;
            details.message = 'Telegram API error';
        } else if (error.name === 'MongoError' || error.name === 'MongooseError') {
            details.type = ERROR_TYPES.DATABASE;
        }
        
        return details;
    }

    /**
     * Notify user about error
     */
    static async notifyUser(ctx, errorDetails) {
        const userMessage = this.getUserMessage(errorDetails);
        
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(userMessage, { show_alert: true });
            } else if (ctx.reply) {
                await ctx.reply(userMessage);
            }
        } catch (notifyError) {
            logger.error('Could not notify user about error:', notifyError);
        }
    }

    /**
     * Get user-friendly error message
     */
    static getUserMessage(errorDetails) {
        const messages = {
            [ERROR_TYPES.VALIDATION]: '❌ Dati non validi. Controlla e riprova.',
            [ERROR_TYPES.NOT_FOUND]: '❌ Risorsa non trovata.',
            [ERROR_TYPES.UNAUTHORIZED]: '❌ Non sei autorizzato per questa azione.',
            [ERROR_TYPES.DATABASE]: '❌ Errore database. Riprova tra poco.',
            [ERROR_TYPES.NETWORK]: '❌ Errore di connessione. Riprova.',
            [ERROR_TYPES.UNKNOWN]: '❌ Si è verificato un errore. Riprova.'
        };
        
        return messages[errorDetails.type] || messages[ERROR_TYPES.UNKNOWN];
    }

    /**
     * Check if error is critical
     */
    static isCritical(errorType, severity) {
        return severity === 'critical' || 
               [ERROR_TYPES.DATABASE, ERROR_TYPES.UNKNOWN].includes(errorType);
    }

    /**
     * Notify admin about critical errors
     */
    static async notifyAdmin(error, ctx, errorDetails) {
        // This should use the bot's notification service
        // For now, just log it
        logger.error('CRITICAL ERROR - Admin notification needed:', {
            error: error.message,
            stack: error.stack,
            type: errorDetails.type,
            user: ctx?.from?.id,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Track error metrics
     */
    static trackError(errorDetails) {
        // In a real implementation, this would send metrics to a monitoring service
        // For now, we'll keep an in-memory counter
        if (!this.errorCounts) {
            this.errorCounts = {};
        }
        
        const key = errorDetails.type;
        this.errorCounts[key] = (this.errorCounts[key] || 0) + 1;
    }

    /**
     * Get error statistics
     */
    static getStats() {
        return {
            counts: this.errorCounts || {},
            lastError: this.lastError || null
        };
    }

    /**
     * Reset error statistics
     */
    static resetStats() {
        this.errorCounts = {};
        this.lastError = null;
    }

    /**
     * Create error with context
     */
    static createError(message, type = ERROR_TYPES.UNKNOWN, context = {}) {
        const error = new Error(message);
        error.type = type;
        error.context = context;
        error.timestamp = new Date().toISOString();
        return error;
    }

    /**
     * Wrap async function with error handling
     */
    static wrap(fn, options = {}) {
        return async (ctx, ...args) => {
            try {
                return await fn(ctx, ...args);
            } catch (error) {
                await this.handle(error, ctx, options.severity || 'error');
                
                if (options.rethrow) {
                    throw error;
                }
            }
        };
    }
}

module.exports = ErrorHandler;
