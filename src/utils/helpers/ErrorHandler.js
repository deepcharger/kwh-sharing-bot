// src/utils/helpers/ErrorHandler.js - Gestione centralizzata degli errori
const logger = require('../logger');
const { ERROR_TYPES } = require('../../config/constants');

class ErrorHandler {
    static errorCounts = {};
    static lastError = null;

    /**
     * Handle error uniformly
     */
    static async handle(error, ctx, severity = 'error') {
        // Store last error
        this.lastError = {
            message: error.message,
            stack: error.stack,
            timestamp: new Date(),
            severity
        };

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
            
            if (ctx.message) {
                logData.messageText = ctx.message.text?.substring(0, 100);
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
        } else if (error.message?.includes('unauthorized') || error.message?.includes('Forbidden')) {
            details.type = ERROR_TYPES.UNAUTHORIZED;
            details.message = 'Unauthorized access';
        } else if (error.code === 'ETELEGRAM' || error.response?.error_code) {
            details.type = ERROR_TYPES.NETWORK;
            details.message = this.getTelegramErrorMessage(error);
        } else if (error.name === 'MongoError' || error.name === 'MongooseError') {
            details.type = ERROR_TYPES.DATABASE;
            details.message = 'Database operation failed';
        } else if (error.code === 'MODULE_NOT_FOUND') {
            details.type = ERROR_TYPES.SYSTEM;
            details.message = 'Missing module or file';
        } else if (error.name === 'TypeError' && error.message?.includes('Cannot read properties')) {
            details.type = ERROR_TYPES.SYSTEM;
            details.message = 'Service or method not available';
        }
        
        return details;
    }

    /**
     * Get Telegram-specific error message
     */
    static getTelegramErrorMessage(error) {
        const errorCode = error.response?.error_code;
        const description = error.response?.description;
        
        switch (errorCode) {
            case 400:
                return 'Invalid request format';
            case 401:
                return 'Bot token invalid';
            case 403:
                return 'Bot blocked by user or insufficient permissions';
            case 404:
                return 'Resource not found';
            case 429:
                return 'Too many requests, rate limited';
            case 500:
                return 'Telegram server error';
            default:
                return description || 'Telegram API error';
        }
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
                await ctx.reply(userMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                        ]
                    }
                });
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
            [ERROR_TYPES.DATABASE]: '❌ Errore del database. Riprova tra poco.',
            [ERROR_TYPES.NETWORK]: '❌ Errore di connessione. Riprova.',
            [ERROR_TYPES.SYSTEM]: '❌ Errore del sistema. Contatta l\'admin se persiste.',
            [ERROR_TYPES.UNKNOWN]: '❌ Si è verificato un errore imprevisto. Riprova.'
        };
        
        return messages[errorDetails.type] || messages[ERROR_TYPES.UNKNOWN];
    }

    /**
     * Check if error is critical
     */
    static isCritical(errorType, severity) {
        return severity === 'critical' || 
               [ERROR_TYPES.DATABASE, ERROR_TYPES.SYSTEM].includes(errorType);
    }

    /**
     * Notify admin about critical errors
     */
    static async notifyAdmin(error, ctx, errorDetails) {
        try {
            const adminMessage = this.formatAdminErrorMessage(error, ctx, errorDetails);
            
            // This should use the bot's notification service
            // For now, just log it as a placeholder
            logger.error('ADMIN NOTIFICATION NEEDED:', adminMessage);
            
            // TODO: Integrate with NotificationService when available
            // await notificationService.notifyAdmin(adminMessage);
            
        } catch (notifyError) {
            logger.error('Could not notify admin about error:', notifyError);
        }
    }

    /**
     * Format admin error message
     */
    static formatAdminErrorMessage(error, ctx, errorDetails) {
        let message = `🚨 **ERRORE CRITICO**\n\n`;
        message += `**Tipo:** ${errorDetails.type}\n`;
        message += `**Messaggio:** ${error.message}\n`;
        
        if (ctx) {
            message += `**Utente:** ${ctx.from?.username || 'unknown'} (${ctx.from?.id})\n`;
            if (ctx.callbackQuery) {
                message += `**Callback:** ${ctx.callbackQuery.data}\n`;
            }
            if (ctx.message?.text) {
                message += `**Messaggio:** ${ctx.message.text.substring(0, 100)}\n`;
            }
        }
        
        message += `**Timestamp:** ${new Date().toISOString()}\n`;
        message += `**Stack:** \`\`\`${error.stack?.substring(0, 500)}\`\`\``;
        
        return message;
    }

    /**
     * Track error metrics
     */
    static trackError(errorDetails) {
        const key = errorDetails.type;
        this.errorCounts[key] = (this.errorCounts[key] || 0) + 1;
        
        // Clean old counts periodically (keep last 24 hours)
        if (Math.random() < 0.01) { // 1% chance to cleanup
            this.cleanupOldCounts();
        }
    }

    /**
     * Cleanup old error counts
     */
    static cleanupOldCounts() {
        // Simple cleanup - reset if too many errors
        const totalErrors = Object.values(this.errorCounts).reduce((sum, count) => sum + count, 0);
        if (totalErrors > 1000) {
            this.errorCounts = {};
            logger.info('Error counts reset due to high volume');
        }
    }

    /**
     * Get error statistics
     */
    static getStats() {
        return {
            counts: { ...this.errorCounts },
            lastError: this.lastError,
            totalErrors: Object.values(this.errorCounts).reduce((sum, count) => sum + count, 0)
        };
    }

    /**
     * Reset error statistics
     */
    static resetStats() {
        this.errorCounts = {};
        this.lastError = null;
        logger.info('Error statistics reset');
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
                
                // Return default value if specified
                return options.defaultValue;
            }
        };
    }

    /**
     * Create error middleware for bot
     */
    static createMiddleware() {
        return async (ctx, next) => {
            try {
                await next();
            } catch (error) {
                await this.handle(error, ctx);
            }
        };
    }

    /**
     * Handle specific error types
     */
    static async handleDatabaseError(error, ctx) {
        return await this.handle(error, ctx, 'critical');
    }

    static async handleValidationError(error, ctx) {
        return await this.handle(error, ctx, 'warning');
    }

    static async handleNetworkError(error, ctx) {
        return await this.handle(error, ctx, 'error');
    }

    static async handleUnauthorizedError(error, ctx) {
        return await this.handle(error, ctx, 'warning');
    }

    /**
     * Bulk error analysis
     */
    static analyzeErrors() {
        const stats = this.getStats();
        const analysis = {
            totalErrors: stats.totalErrors,
            mostCommon: null,
            criticalCount: 0,
            recommendations: []
        };

        if (stats.totalErrors === 0) {
            analysis.recommendations.push('No errors detected - system is stable');
            return analysis;
        }

        // Find most common error
        let maxCount = 0;
        for (const [type, count] of Object.entries(stats.counts)) {
            if (count > maxCount) {
                maxCount = count;
                analysis.mostCommon = { type, count };
            }
            
            if ([ERROR_TYPES.DATABASE, ERROR_TYPES.SYSTEM].includes(type)) {
                analysis.criticalCount += count;
            }
        }

        // Generate recommendations
        if (analysis.criticalCount > 10) {
            analysis.recommendations.push('High number of critical errors - investigate system health');
        }

        if (stats.counts[ERROR_TYPES.NETWORK] > 20) {
            analysis.recommendations.push('Network issues detected - check Telegram API status');
        }

        if (stats.counts[ERROR_TYPES.DATABASE] > 5) {
            analysis.recommendations.push('Database issues detected - check MongoDB connection');
        }

        return analysis;
    }
}

module.exports = ErrorHandler;
