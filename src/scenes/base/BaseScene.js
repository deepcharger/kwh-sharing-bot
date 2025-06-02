// src/scenes/base/BaseScene.js
const { Scenes } = require('telegraf');
const logger = require('../../utils/logger');
const ErrorHandler = require('../../utils/helpers/ErrorHandler');

class BaseScene extends Scenes.BaseScene {
    constructor(id, bot) {
        super(id);
        this.bot = bot;
        this.db = bot.db;
        this.services = bot.services;
        this.chatCleaner = bot.chatCleaner;
        
        // Setup common handlers
        this.setupCommonHandlers();
    }

    setupCommonHandlers() {
        // Handle scene leave
        this.leave((ctx) => {
            logger.debug(`User ${ctx.from?.id} left scene ${this.id}`);
        });
        
        // Error handling wrapper
        this.use(async (ctx, next) => {
            try {
                await next();
            } catch (error) {
                await this.handleError(ctx, error);
            }
        });
        
        // Common commands available in all scenes
        this.command('cancel', async (ctx) => {
            await this.cancelScene(ctx);
        });
        
        this.command('menu', async (ctx) => {
            await this.returnToMenu(ctx);
        });
        
        // Common actions
        this.action('cancel', async (ctx) => {
            await ctx.answerCbQuery();
            await this.cancelScene(ctx);
        });
        
        this.action('back_to_main', async (ctx) => {
            await ctx.answerCbQuery();
            await this.returnToMenu(ctx);
        });
    }

    /**
     * Handle errors in scene
     */
    async handleError(ctx, error) {
        logger.error(`Error in scene ${this.id}:`, error);
        await ErrorHandler.handle(error, ctx);
        
        // Leave scene on critical errors
        if (this.isCriticalError(error)) {
            await this.cancelScene(ctx);
        }
    }

    /**
     * Cancel scene and return to menu
     */
    async cancelScene(ctx) {
        // Clean up session data
        this.cleanupSession(ctx);
        
        // Leave scene
        await ctx.scene.leave();
        
        // Show cancellation message
        await this.chatCleaner.sendTemporaryMessage(
            ctx,
            '❌ Operazione annullata.',
            {},
            3000
        );
        
        // Return to main menu
        setTimeout(async () => {
            await this.chatCleaner.resetUserChat(ctx);
        }, 3000);
    }

    /**
     * Return to main menu
     */
    async returnToMenu(ctx) {
        // Clean up session
        this.cleanupSession(ctx);
        
        // Leave scene
        await ctx.scene.leave();
        
        // Reset chat
        await this.chatCleaner.resetUserChat(ctx);
    }

    /**
     * Clean up session data specific to this scene
     */
    cleanupSession(ctx) {
        // Override in child classes to clean specific session data
        const sceneKeys = this.getSessionKeys();
        for (const key of sceneKeys) {
            delete ctx.session[key];
        }
    }

    /**
     * Get session keys used by this scene (to be overridden)
     */
    getSessionKeys() {
        return [];
    }

    /**
     * Check if error is critical
     */
    isCriticalError(error) {
        return error.code === 'ETELEGRAM' || 
               error.message?.includes('database') ||
               error.message?.includes('network');
    }

    /**
     * Send a message and save for cleanup
     */
    async sendMessage(ctx, text, options = {}) {
        const message = await ctx.reply(text, options);
        this.chatCleaner.saveMessageForCleanup(
            ctx.from.id,
            message.message_id,
            'scene'
        );
        return message;
    }

    /**
     * Edit or send new message
     */
    async editOrSend(ctx, text, options = {}) {
        try {
            if (ctx.callbackQuery?.message) {
                return await ctx.editMessageText(text, options);
            } else {
                return await this.sendMessage(ctx, text, options);
            }
        } catch (error) {
            // If edit fails, send new message
            return await this.sendMessage(ctx, text, options);
        }
    }

    /**
     * Validate user input
     */
    validateInput(input, type, options = {}) {
        switch (type) {
            case 'price':
                const price = parseFloat(input.replace(',', '.'));
                if (isNaN(price) || price <= 0 || price > 10) {
                    throw new Error('Prezzo non valido (0.01-10.00)');
                }
                return price;
                
            case 'kwh':
                const kwh = parseInt(input);
                if (isNaN(kwh) || kwh <= 0 || kwh > 1000) {
                    throw new Error('KWH non valido (1-1000)');
                }
                return kwh;
                
            case 'date':
                // Parse date in format DD/MM/YYYY HH:MM
                const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;
                const match = input.match(dateRegex);
                if (!match) {
                    throw new Error('Formato data non valido (GG/MM/AAAA HH:MM)');
                }
                const [_, day, month, year, hour, minute] = match;
                const date = new Date(year, month - 1, day, hour, minute);
                if (isNaN(date.getTime())) {
                    throw new Error('Data non valida');
                }
                return date;
                
            default:
                return input;
        }
    }

    /**
     * Show loading state
     */
    async showLoading(ctx, message = '⏳ Elaborazione in corso...') {
        return await this.editOrSend(ctx, message, { parse_mode: 'Markdown' });
    }

    /**
     * Show success message
     */
    async showSuccess(ctx, message, options = {}) {
        const finalMessage = `✅ ${message}`;
        
        if (options.temporary) {
            await this.chatCleaner.sendTemporaryMessage(
                ctx,
                finalMessage,
                { parse_mode: 'Markdown' },
                options.duration || 5000
            );
        } else {
            await this.editOrSend(ctx, finalMessage, { parse_mode: 'Markdown' });
        }
    }

    /**
     * Show error message
     */
    async showError(ctx, message, options = {}) {
        const finalMessage = `❌ ${message}`;
        
        if (options.temporary) {
            await this.chatCleaner.sendErrorMessage(ctx, finalMessage);
        } else {
            await this.editOrSend(ctx, finalMessage, { parse_mode: 'Markdown' });
        }
    }
}

module.exports = BaseScene;
