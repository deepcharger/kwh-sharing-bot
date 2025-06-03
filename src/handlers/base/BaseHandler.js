// src/handlers/base/BaseHandler.js
const { ERROR_TYPES } = require('../../config/constants');

class BaseHandler {
    constructor(bot) {
        this.bot = bot;
        this.db = bot.db;
        this.telegram = bot.bot.telegram;
        
        // Services shortcuts - FIX: accediamo correttamente ai servizi
        this.services = bot.services || {};
        
        // Utils shortcuts
        this.utils = {
            chatCleaner: bot.chatCleaner,
            transactionCache: bot.transactionCache
        };
    }

    /**
     * Handle errors uniformly across all handlers
     */
    async handleError(ctx, error, customMessage = null) {
        console.error(`Error in ${this.constructor.name}:`, error);
        
        // Determine error type
        const errorType = this.getErrorType(error);
        const message = customMessage || this.getErrorMessage(errorType);
        
        // Try to respond to user
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(message, { show_alert: true });
            } else {
                await this.utils.chatCleaner.sendErrorMessage(ctx, message);
            }
        } catch (responseError) {
            console.error('Could not send error message:', responseError);
        }
        
        // Log to admin if critical
        if (this.isCriticalError(errorType)) {
            await this.notifyAdmin(error, ctx);
        }
    }

    /**
     * Check if user is authorized for an action
     */
    async checkAuthorization(ctx, resource, action) {
        const userId = ctx.from?.id;
        if (!userId) return false;
        
        switch (resource) {
            case 'transaction':
                return this.checkTransactionAuth(userId, action);
            case 'announcement':
                return this.checkAnnouncementAuth(userId, action);
            case 'admin':
                return userId == this.bot.adminUserId;
            default:
                return true;
        }
    }

    /**
     * Log action for analytics
     */
    async logAction(ctx, action, data = {}) {
        if (!this.bot.analyticsEnabled) return;
        
        try {
            await this.db.getCollection('analytics').insertOne({
                userId: ctx.from?.id,
                username: ctx.from?.username,
                action,
                data,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Analytics logging failed:', error);
        }
    }

    /**
     * Get full ID from short ID using cache
     */
    async resolveShortId(shortId, type = 'transaction') {
        if (type === 'transaction') {
            return this.utils.transactionCache.get(shortId);
        } else if (type === 'announcement') {
            return this.utils.transactionCache.getAnnouncement(shortId);
        }
        return null;
    }

    /**
     * Answer callback query safely
     */
    async answerCallback(ctx, text = null, showAlert = false) {
        try {
            await ctx.answerCbQuery(text, { show_alert: showAlert });
        } catch (error) {
            console.error('Failed to answer callback:', error);
        }
    }

    // Private helper methods
    
    getErrorType(error) {
        if (error.code === 11000) return ERROR_TYPES.DATABASE;
        if (error.name === 'ValidationError') return ERROR_TYPES.VALIDATION;
        if (error.message?.includes('not found')) return ERROR_TYPES.NOT_FOUND;
        if (error.message?.includes('unauthorized')) return ERROR_TYPES.UNAUTHORIZED;
        if (error.code === 'ETELEGRAM') return ERROR_TYPES.NETWORK;
        return ERROR_TYPES.UNKNOWN;
    }
    
    getErrorMessage(errorType) {
        const messages = {
            [ERROR_TYPES.VALIDATION]: '❌ Dati non validi. Riprova.',
            [ERROR_TYPES.NOT_FOUND]: '❌ Risorsa non trovata.',
            [ERROR_TYPES.UNAUTHORIZED]: '❌ Non sei autorizzato.',
            [ERROR_TYPES.DATABASE]: '❌ Errore database. Riprova tra poco.',
            [ERROR_TYPES.NETWORK]: '❌ Errore di rete. Riprova.',
            [ERROR_TYPES.UNKNOWN]: '❌ Si è verificato un errore. Riprova.'
        };
        return messages[errorType] || messages[ERROR_TYPES.UNKNOWN];
    }
    
    isCriticalError(errorType) {
        return [ERROR_TYPES.DATABASE, ERROR_TYPES.UNKNOWN].includes(errorType);
    }
    
    async notifyAdmin(error, ctx) {
        try {
            const adminMessage = `🚨 **ERRORE CRITICO**\n\n` +
                `Handler: ${this.constructor.name}\n` +
                `User: @${ctx.from?.username || 'unknown'} (${ctx.from?.id})\n` +
                `Error: ${error.message}\n` +
                `Stack: \`\`\`${error.stack?.substring(0, 500)}\`\`\``;
                
            await this.telegram.sendMessage(this.bot.adminUserId, adminMessage, {
                parse_mode: 'Markdown'
            });
        } catch (notifyError) {
            console.error('Could not notify admin:', notifyError);
        }
    }
    
    async checkTransactionAuth(userId, transactionId) {
        const transaction = await this.services.transaction.getTransaction(transactionId);
        if (!transaction) return false;
        return transaction.sellerId === userId || transaction.buyerId === userId;
    }
    
    async checkAnnouncementAuth(userId, announcementId) {
        const announcement = await this.services.announcement.getAnnouncement(announcementId);
        if (!announcement) return false;
        return announcement.userId === userId;
    }
}

module.exports = BaseHandler;
