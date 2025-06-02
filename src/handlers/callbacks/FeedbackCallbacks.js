// src/handlers/callbacks/FeedbackCallbacks.js - NUOVO FILE
const BaseHandler = require('../base/BaseHandler');
const Keyboards = require('../../utils/keyboards/Keyboards');
const Messages = require('../../utils/messages/Messages');

class FeedbackCallbacks extends BaseHandler {
    constructor(bot) {
        super(bot);
    }

    /**
     * Main handler method
     */
    async handle(ctx, callbackData) {
        await this.answerCallback(ctx);
        
        // Route to specific handler
        if (callbackData.startsWith('feedback_tx_')) {
            await this.handleFeedbackTransaction(ctx, callbackData);
        } else if (callbackData.match(/^feedback_[1-5]$/)) {
            await this.handleFeedbackRating(ctx, callbackData);
        }
    }

    /**
     * Handle feedback for transaction
     */
    async handleFeedbackTransaction(ctx, callbackData) {
        const transactionId = callbackData.replace('feedback_tx_', '');
        
        const transaction = await this.services.transaction.getTransaction(transactionId);
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        // Verify user is part of the transaction
        if (ctx.from.id !== transaction.buyerId && ctx.from.id !== transaction.sellerId) {
            await this.answerCallback(ctx, '❌ Non sei autorizzato.', true);
            return;
        }
        
        ctx.session.completedTransactionId = transactionId;
        
        await ctx.editMessageText(
            Messages.FEEDBACK_REQUEST,
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.feedback.getRatingKeyboard().reply_markup
            }
        );
    }

    /**
     * Handle feedback rating
     */
    async handleFeedbackRating(ctx, callbackData) {
        const rating = parseInt(callbackData.replace('feedback_', ''));
        
        let transactionId;
        const messageText = ctx.callbackQuery.message.text;
        const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
        
        if (transactionIdMatch) {
            transactionId = transactionIdMatch[1].replace(/\\/g, '');
        } else if (ctx.session.completedTransactionId) {
            transactionId = ctx.session.completedTransactionId;
        } else {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ ID transazione non trovato.');
            return;
        }
        
        const transaction = await this.services.transaction.getTransaction(transactionId);
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        const isSellerGivingFeedback = ctx.from.id === transaction.sellerId;
        const targetUserId = isSellerGivingFeedback ? transaction.buyerId : transaction.sellerId;

        if (rating <= 2) {
            // Negative feedback - ask for reason
            await ctx.editMessageText(Messages.NEGATIVE_FEEDBACK_REASON, { reply_markup: undefined });
            ctx.session.waitingFor = 'feedback_reason';
            ctx.session.feedbackRating = rating;
            ctx.session.feedbackTargetUserId = targetUserId;
            ctx.session.transaction = transaction;
        } else {
            // Positive feedback - save immediately
            await this.saveFeedback(ctx, transaction, targetUserId, rating, '');
        }
    }

    /**
     * Save feedback
     */
    async saveFeedback(ctx, transaction, targetUserId, rating, comment) {
        await this.services.transaction.createFeedback(
            transaction.transactionId,
            ctx.from.id,
            targetUserId,
            rating,
            comment
        );

        await this.utils.chatCleaner.sendConfirmationMessage(ctx,
            '⭐ Grazie per il feedback!\n\n' +
            'La transazione è stata completata con successo.'
        );

        delete ctx.session.completedTransactionId;
        delete ctx.session.feedbackRating;
        delete ctx.session.feedbackTargetUserId;
        delete ctx.session.transaction;
        
        setTimeout(async () => {
            await this.utils.chatCleaner.resetUserChat(ctx);
        }, 3000);
    }
}

module.exports = FeedbackCallbacks;
