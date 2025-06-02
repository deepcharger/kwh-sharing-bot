// src/handlers/callbacks/HelpCallbacks.js - NUOVO FILE
const BaseHandler = require('../base/BaseHandler');
const Keyboards = require('../../utils/keyboards/Keyboards');
const Messages = require('../../utils/messages/Messages');
const MarkdownEscape = require('../../utils/MarkdownEscape');

class HelpCallbacks extends BaseHandler {
    constructor(bot) {
        super(bot);
    }

    /**
     * Main handler method
     */
    async handle(ctx, callbackData) {
        await this.answerCallback(ctx);
        
        // Route to specific handler
        switch (callbackData) {
            case 'help_selling':
                await this.handleHelpSelling(ctx);
                break;
            case 'help_buying':
                await this.handleHelpBuying(ctx);
                break;
            case 'help_feedback':
                await this.handleHelpFeedback(ctx);
                break;
            case 'help_faq':
                await this.handleHelpFAQ(ctx);
                break;
            case 'contact_admin':
                await this.handleContactAdmin(ctx);
                break;
        }
    }

    /**
     * Handle help selling
     */
    async handleHelpSelling(ctx) {
        const helpText = Messages.templates.help.selling();
        
        await ctx.editMessageText(helpText, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
        });
    }

    /**
     * Handle help buying
     */
    async handleHelpBuying(ctx) {
        const helpText = Messages.templates.help.buying();
        
        await ctx.editMessageText(helpText, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
        });
    }

    /**
     * Handle help feedback
     */
    async handleHelpFeedback(ctx) {
        const helpText = Messages.templates.help.feedback();
        
        await ctx.editMessageText(helpText, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
        });
    }

    /**
     * Handle help FAQ
     */
    async handleHelpFAQ(ctx) {
        const faqText = Messages.templates.help.faq();
        
        await ctx.editMessageText(faqText, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
        });
    }

    /**
     * Handle contact admin
     */
    async handleContactAdmin(ctx) {
        const adminUsername = process.env.ADMIN_USERNAME || 'amministratore';
        
        await ctx.editMessageText(
            `📞 **CONTATTA ADMIN**\n\n` +
            `Per supporto diretto contatta:\n` +
            `👤 @${MarkdownEscape.escape(adminUsername)}\n\n` +
            `🚨 **Per emergenze:**\n` +
            `Usa il pulsante "Chiama admin" durante le transazioni.`,
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
            }
        );
    }
}

module.exports = HelpCallbacks;
