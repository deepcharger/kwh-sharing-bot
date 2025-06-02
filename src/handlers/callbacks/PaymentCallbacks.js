// src/handlers/callbacks/PaymentCallbacks.js - NUOVO FILE
const BaseHandler = require('../base/BaseHandler');
const Keyboards = require('../../utils/keyboards/Keyboards');
const Messages = require('../../utils/messages/Messages');
const { TRANSACTION_STATUS } = require('../../config/constants');

class PaymentCallbacks extends BaseHandler {
    constructor(bot) {
        super(bot);
    }

    /**
     * Main handler method
     */
    async handle(ctx, callbackData) {
        await this.answerCallback(ctx);
        
        // Route to specific handler
        if (callbackData === 'payment_completed') {
            await this.handlePaymentCompleted(ctx);
        } else if (callbackData.startsWith('payment_done_')) {
            await this.handlePaymentDone(ctx, callbackData);
        } else if (callbackData.startsWith('confirm_payment_')) {
            await this.handleConfirmPayment(ctx, callbackData);
        } else if (callbackData === 'payment_issues') {
            await this.handlePaymentIssues(ctx);
        } else if (callbackData === 'payment_in_progress') {
            await this.handlePaymentInProgress(ctx);
        } else if (callbackData === 'payment_received') {
            await this.handlePaymentReceived(ctx);
        } else if (callbackData === 'payment_not_received') {
            await this.handlePaymentNotReceived(ctx);
        } else if (callbackData.startsWith('payment_ok_')) {
            await this.handlePaymentOk(ctx, callbackData);
        } else if (callbackData.startsWith('payment_fail_')) {
            await this.handlePaymentFail(ctx, callbackData);
        } else if (callbackData === 'retry_payment') {
            await this.handleRetryPayment(ctx);
        } else if (callbackData === 'send_payment_proof') {
            await this.handleSendPaymentProof(ctx);
        } else if (callbackData.startsWith('select_payment_')) {
            await this.handleSelectPayment(ctx, callbackData);
        }
    }

    /**
     * Handle payment completed
     */
    async handlePaymentCompleted(ctx) {
        // Extract transaction ID from message or session
        const transactionId = await this.extractTransactionId(ctx);
        
        if (!transactionId) {
            // Check if user has multiple pending payments
            const userId = ctx.from.id;
            const transactions = await this.services.transaction.getUserTransactions(userId, 'all');
            const paymentPending = transactions.filter(t => 
                t.status === TRANSACTION_STATUS.PAYMENT_REQUESTED && t.buyerId === userId
            );
            
            if (paymentPending.length === 1) {
                await this.processPaymentConfirmation(ctx, paymentPending[0].transactionId);
            } else if (paymentPending.length > 1) {
                await this.showMultiplePaymentsSelection(ctx, paymentPending);
            } else {
                await this.showNoPaymentError(ctx);
            }
            return;
        }
        
        await this.processPaymentConfirmation(ctx, transactionId);
    }

    /**
     * Handle payment done (from external message)
     */
    async handlePaymentDone(ctx, callbackData) {
        const transactionId = callbackData.replace('payment_done_', '');
        
        const transaction = await this.services.transaction.getTransaction(transactionId);
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        // Verify it's the buyer
        if (ctx.from.id !== transaction.buyerId) {
            await this.answerCallback(ctx, '❌ Non sei autorizzato.', true);
            return;
        }
        
        await this.services.transaction.updateTransactionStatus(
            transactionId,
            TRANSACTION_STATUS.PAYMENT_DECLARED
        );

        try {
            const announcement = await this.services.announcement.getAnnouncement(transaction.announcementId);
            const amount = announcement && transaction.declaredKwh ? 
                (transaction.declaredKwh * (announcement.price || announcement.basePrice)).toFixed(2) : 'N/A';
            
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.sellerId } },
                Messages.templates.payment.paymentDeclared(ctx.from, transaction, amount),
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.payment.getSellerConfirmKeyboard().reply_markup
                }
            );
        } catch (error) {
            console.error('Error notifying seller:', error);
        }

        await ctx.editMessageText(
            Messages.templates.payment.paymentDeclaredConfirm(),
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Handle confirm payment
     */
    async handleConfirmPayment(ctx, callbackData) {
        const transactionId = callbackData.replace('confirm_payment_', '');
        await this.processPaymentConfirmation(ctx, transactionId);
    }

    /**
     * Handle payment issues
     */
    async handlePaymentIssues(ctx) {
        await ctx.editMessageText(
            '⚠️ *Problemi con il pagamento?*\n\nScegli un\'opzione:',
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.payment.getIssuesKeyboard().reply_markup
            }
        );
    }

    /**
     * Handle payment in progress
     */
    async handlePaymentInProgress(ctx) {
        await ctx.editMessageText(
            Messages.templates.payment.paymentInProgress(),
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Ora ho completato il pagamento', callback_data: 'payment_completed' }],
                        [{ text: '❌ Ho ancora problemi', callback_data: 'payment_issues' }],
                        [{ text: '🏠 Torna al menu', callback_data: 'back_to_main' }]
                    ]
                }
            }
        );
    }

    /**
     * Handle payment received (seller confirms)
     */
    async handlePaymentReceived(ctx) {
        const transactionId = await this.extractTransactionIdFromMessage(ctx);
        
        if (!transactionId) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ ID transazione non trovato.');
            return;
        }
        
        const transaction = await this.services.transaction.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        await this.completeTransaction(ctx, transaction);
    }

    /**
     * Handle payment not received
     */
    async handlePaymentNotReceived(ctx) {
        const transactionId = await this.extractTransactionIdFromMessage(ctx);
        
        if (!transactionId) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ ID transazione non trovato.');
            return;
        }
        
        const transaction = await this.services.transaction.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        await this.services.transaction.addTransactionIssue(
            transactionId,
            'Pagamento non ricevuto',
            transaction.sellerId
        );
        
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.buyerId } },
                '⚠️ *Problema pagamento segnalato*\n\n' +
                'Il venditore non conferma la ricezione del pagamento.\n\n' +
                'Cosa vuoi fare?',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.payment.getIssuesKeyboard().reply_markup
                }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await ctx.editMessageText(
            '⚠️ Problema pagamento segnalato. L\'acquirente riceverà opzioni per risolvere.',
            { reply_markup: undefined }
        );
    }

    /**
     * Handle payment OK (seller button)
     */
    async handlePaymentOk(ctx, callbackData) {
        const transactionId = callbackData.replace('payment_ok_', '');
        
        const transaction = await this.services.transaction.getTransaction(transactionId);
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        // Verify it's the seller
        if (ctx.from.id !== transaction.sellerId) {
            await this.answerCallback(ctx, '❌ Non sei autorizzato.', true);
            return;
        }
        
        await this.completeTransaction(ctx, transaction);
    }

    /**
     * Handle payment fail (seller button)
     */
    async handlePaymentFail(ctx, callbackData) {
        const transactionId = callbackData.replace('payment_fail_', '');
        
        const transaction = await this.services.transaction.getTransaction(transactionId);
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        await this.services.transaction.addTransactionIssue(
            transactionId,
            'Pagamento non ricevuto dal venditore',
            transaction.sellerId
        );
        
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.buyerId } },
                Messages.templates.payment.paymentNotReceived(),
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await ctx.editMessageText('⚠️ Problema pagamento segnalato all\'acquirente.');
    }

    /**
     * Handle retry payment
     */
    async handleRetryPayment(ctx) {
        await ctx.editMessageText(
            Messages.templates.payment.retryPayment(),
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.payment.getConfirmationKeyboard().reply_markup
            }
        );
    }

    /**
     * Handle send payment proof
     */
    async handleSendPaymentProof(ctx) {
        await ctx.editMessageText(
            Messages.templates.payment.sendProof(),
            { parse_mode: 'Markdown', reply_markup: undefined }
        );
        ctx.session.waitingFor = 'payment_proof';
    }

    /**
     * Handle select payment
     */
    async handleSelectPayment(ctx, callbackData) {
        const transactionId = callbackData.replace('select_payment_', '');
        
        const transaction = await this.services.transaction.getTransaction(transactionId);
        if (!transaction) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
            return;
        }
        
        if (transaction.buyerId !== ctx.from.id) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Non sei autorizzato per questa transazione.');
            return;
        }
        
        const announcement = await this.services.announcement.getAnnouncement(transaction.announcementId);
        const amount = announcement && transaction.declaredKwh ? 
            (transaction.declaredKwh * (announcement.price || announcement.basePrice)).toFixed(2) : 'N/A';
        
        ctx.session.currentTransactionId = transactionId;
        
        await ctx.editMessageText(
            Messages.templates.payment.proceedWithPayment(transaction, amount, announcement),
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.payment.getConfirmationKeyboard().reply_markup
            }
        );
    }

    // Helper methods

    async extractTransactionId(ctx) {
        const messageText = ctx.callbackQuery.message.text || '';
        let transactionId = null;
        
        // Search in message text
        const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s\n]+)`?/);
        if (transactionIdMatch) {
            transactionId = transactionIdMatch[1];
        }
        
        // Check session
        if (!transactionId && ctx.session.currentTransactionId) {
            transactionId = ctx.session.currentTransactionId;
        }
        
        return transactionId;
    }

    async extractTransactionIdFromMessage(ctx) {
        const messageText = ctx.callbackQuery.message.text;
        const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
        
        if (!transactionIdMatch) {
            return null;
        }
        
        return transactionIdMatch[1].replace(/\\/g, '');
    }

    async processPaymentConfirmation(ctx, transactionId) {
        const transaction = await this.services.transaction.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText(`❌ Transazione non trovata con ID: \`${transactionId}\``);
            return;
        }
        
        if (transaction.buyerId !== ctx.from.id) {
            await ctx.editMessageText('❌ Non sei autorizzato per questa transazione.');
            return;
        }
        
        const amount = transaction.totalAmount ? 
            transaction.totalAmount.toFixed(2) : 
            'ERRORE CALCOLO';
        
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.sellerId } },
                Messages.templates.payment.paymentDeclaration(ctx.from, transaction, amount),
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.payment.getSellerPaymentConfirmKeyboard().reply_markup
                }
            );
            
            console.log('Payment confirmation sent to seller for transaction:', transactionId);
            
        } catch (error) {
            console.error('Error notifying seller:', error);
        }

        await ctx.editMessageText(
            Messages.templates.payment.paymentSentConfirm(transactionId, transaction, amount),
            { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🏠 Torna al menu', callback_data: 'back_to_main' }
                    ]]
                }
            }
        );
    }

    async showMultiplePaymentsSelection(ctx, paymentPending) {
        await ctx.editMessageText(
            '💳 **HAI PIÙ PAGAMENTI IN SOSPESO**\n\n' +
            'Seleziona la transazione per cui hai effettuato il pagamento:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: paymentPending.map((tx, index) => [{
                        text: `💰 \`${tx.transactionId.slice(-10)}\` - ${tx.declaredKwh || '?'} KWH`,
                        callback_data: `confirm_payment_${tx.transactionId}`
                    }])
                }
            }
        );
    }

    async showNoPaymentError(ctx) {
        await this.utils.chatCleaner.editOrReplace(ctx,
            '❌ **Errore: transazione non identificata**\n\n' +
            'Non riesco a trovare la transazione per cui confermare il pagamento.\n' +
            'Usa il comando /pagamenti per riprovare.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🏠 Menu principale', callback_data: 'back_to_main' }
                    ]]
                },
                messageType: 'error'
            }
        );
    }

    async completeTransaction(ctx, transaction) {
        await this.services.transaction.updateTransactionStatus(
            transaction.transactionId,
            TRANSACTION_STATUS.COMPLETED
        );

        await this.services.user.updateUserTransactionStats(
            transaction.sellerId,
            transaction.actualKwh || transaction.declaredKwh,
            'sell'
        );
        
        await this.services.user.updateUserTransactionStats(
            transaction.buyerId,
            transaction.actualKwh || transaction.declaredKwh,
            'buy'
        );

        // Notify both parties for feedback
        await this.notifyForFeedback(transaction);

        await ctx.editMessageText(
            '✅ **Pagamento confermato!**\n\n' +
            'La transazione è stata completata con successo.\n' +
            'Entrambi riceverete una notifica per lasciare il feedback reciproco.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                    ]
                }
            }
        );
    }

    async notifyForFeedback(transaction) {
        // Notify buyer
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.buyerId } },
                Messages.templates.feedback.requestFeedback(transaction, 'buyer'),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⭐ Valuta il venditore', callback_data: `feedback_tx_${transaction.transactionId}` }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error notifying buyer for feedback:', error);
        }

        // Notify seller
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.sellerId } },
                Messages.templates.feedback.requestFeedback(transaction, 'seller'),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⭐ Valuta l\'acquirente', callback_data: `feedback_tx_${transaction.transactionId}` }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error notifying seller for feedback:', error);
        }
    }
}

module.exports = PaymentCallbacks;
