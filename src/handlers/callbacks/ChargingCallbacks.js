// src/handlers/callbacks/ChargingCallbacks.js - NUOVO FILE
const BaseHandler = require('../base/BaseHandler');
const Keyboards = require('../../utils/keyboards/Keyboards');
const Messages = require('../../utils/messages/Messages');
const { TRANSACTION_STATUS } = require('../../config/constants');

class ChargingCallbacks extends BaseHandler {
    constructor(bot) {
        super(bot);
    }

    /**
     * Main handler method
     */
    async handle(ctx, callbackData) {
        await this.answerCallback(ctx);
        
        // Route to specific handler
        if (callbackData.startsWith('activate_charging_')) {
            await this.handleActivateCharging(ctx, callbackData);
        } else if (callbackData.startsWith('delay_charging_')) {
            await this.handleDelayCharging(ctx, callbackData);
        } else if (callbackData.startsWith('technical_issues_')) {
            await this.handleTechnicalIssues(ctx, callbackData);
        } else if (callbackData.startsWith('charging_ok_')) {
            await this.handleChargingOk(ctx, callbackData);
        } else if (callbackData.startsWith('charging_fail_')) {
            await this.handleChargingFail(ctx, callbackData);
        } else if (callbackData === 'charging_confirmed') {
            await this.handleChargingConfirmed(ctx);
        } else if (callbackData === 'charging_failed') {
            await this.handleChargingFailed(ctx);
        } else if (callbackData === 'charging_finished') {
            await this.handleChargingFinished(ctx);
        } else if (callbackData.startsWith('kwh_ok_')) {
            await this.handleKwhOk(ctx, callbackData);
        } else if (callbackData.startsWith('kwh_bad_')) {
            await this.handleKwhBad(ctx, callbackData);
        } else if (callbackData === 'retry_activation') {
            await this.handleRetryActivation(ctx);
        } else if (callbackData === 'activate_charging') {
            await this.handleActivateChargingSimple(ctx);
        } else if (callbackData === 'delay_charging') {
            await this.handleDelayChargingSimple(ctx);
        }
    }

    /**
     * Handle activate charging
     */
    async handleActivateCharging(ctx, callbackData) {
        const transactionId = callbackData.replace('activate_charging_', '');
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
        
        // Update status
        await this.services.transaction.updateTransactionStatus(
            transactionId,
            TRANSACTION_STATUS.CHARGING_STARTED
        );
        
        // Notify buyer
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.buyerId } },
                Messages.templates.charging.chargingStarted(transactionId),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Confermo, sta caricando', callback_data: `charging_ok_${transactionId}` },
                                { text: '❌ Non sta caricando', callback_data: `charging_fail_${transactionId}` }
                            ]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }
        
        await ctx.editMessageText(
            '⚡ **Ricarica attivata!**\n\n' +
            'Attendi la conferma dell\'acquirente che la ricarica sia iniziata correttamente.',
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Handle delay charging
     */
    async handleDelayCharging(ctx, callbackData) {
        const transactionId = callbackData.replace('delay_charging_', '');
        
        setTimeout(async () => {
            try {
                await this.utils.chatCleaner.sendPersistentMessage(
                    { telegram: this.telegram, from: { id: ctx.from.id } },
                    Messages.templates.charging.delayReminder(transactionId),
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⚡ Attiva ricarica ORA', callback_data: `activate_charging_${transactionId}` }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Error sending delayed reminder:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes
        
        await ctx.editMessageText(
            '⏸️ **Ricarica rimandata di 5 minuti.**\n\n' +
            'Riceverai un promemoria quando sarà il momento di attivare.',
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Handle technical issues
     */
    async handleTechnicalIssues(ctx, callbackData) {
        const transactionId = callbackData.replace('technical_issues_', '');
        const transaction = await this.services.transaction.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        await this.services.transaction.addTransactionIssue(
            transactionId,
            'Problemi tecnici segnalati dal venditore',
            ctx.from.id
        );
        
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.buyerId } },
                Messages.templates.charging.technicalIssues(),
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }
        
        await ctx.editMessageText('⚠️ Problema tecnico segnalato all\'acquirente.');
    }

    /**
     * Handle charging OK (buyer confirms)
     */
    async handleChargingOk(ctx, callbackData) {
        const transactionId = callbackData.replace('charging_ok_', '');
        
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
        
        // Update status
        await this.services.transaction.updateTransactionStatus(
            transactionId,
            TRANSACTION_STATUS.CHARGING_IN_PROGRESS
        );
        
        // Notify seller
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.sellerId } },
                Messages.templates.charging.chargingConfirmedBySeller(ctx.from, transactionId),
                {
                    parse_mode: 'Markdown'
                }
            );
        } catch (error) {
            console.error('Error notifying seller about charging confirmation:', error);
        }
        
        // Update buyer message
        await ctx.editMessageText(
            Messages.templates.charging.chargingInProgressBuyer(transactionId),
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 Vai alla transazione', callback_data: `open_tx_${transactionId}` }]
                    ]
                }
            }
        );
    }

    /**
     * Handle charging fail
     */
    async handleChargingFail(ctx, callbackData) {
        const transactionId = callbackData.replace('charging_fail_', '');
        
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
        
        const retryCount = await this.services.transaction.incrementRetryCount(transactionId);
        
        // Notify seller
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.sellerId } },
                Messages.templates.charging.chargingFailedNotify(transaction, transactionId),
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.charging.getRetryKeyboard(retryCount).reply_markup
                }
            );
        } catch (error) {
            console.error('Error notifying seller about charging failure:', error);
        }
        
        await ctx.editMessageText(
            '❌ **SEGNALAZIONE INVIATA**\n\n' +
            'Il venditore è stato avvisato del problema e riproverà l\'attivazione.\n\n' +
            'Attendi ulteriori istruzioni.',
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Handle charging confirmed (from message)
     */
    async handleChargingConfirmed(ctx) {
        const messageText = ctx.callbackQuery.message.text;
        const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
        
        if (!transactionIdMatch) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '⚠️ Per continuare, inserisci l\'ID della transazione.');
            return;
        }
        
        const transactionId = transactionIdMatch[1].replace(/\\/g, '');
        const transaction = await this.services.transaction.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        // Update status
        await this.services.transaction.updateTransactionStatus(
            transactionId,
            TRANSACTION_STATUS.CHARGING_IN_PROGRESS
        );
        
        // Notify seller
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.sellerId } },
                Messages.templates.charging.chargingConfirmedBySeller(ctx.from, transactionId),
                {
                    parse_mode: 'Markdown'
                }
            );
        } catch (error) {
            console.error('Error notifying seller:', error);
        }
        
        // Enter transaction scene
        ctx.session.transactionId = transactionId;
        ctx.session.chargingConfirmed = true;
        await this.utils.chatCleaner.enterScene(ctx, 'transactionScene');
    }

    /**
     * Handle charging failed (from message)
     */
    async handleChargingFailed(ctx) {
        const messageText = ctx.callbackQuery.message.text;
        const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
        
        if (!transactionIdMatch) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '⚠️ ID transazione non trovato.');
            return;
        }
        
        const transactionId = transactionIdMatch[1].replace(/\\/g, '');
        const transaction = await this.services.transaction.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        const retryCount = await this.services.transaction.incrementRetryCount(transactionId);
        
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.sellerId } },
                Messages.CHARGING_FAILED_RETRY + `\n\nID Transazione: \`${transactionId}\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.charging.getRetryKeyboard(retryCount).reply_markup
                }
            );
        } catch (error) {
            console.error('Error notifying seller:', error);
        }

        await ctx.editMessageText(
            '❌ Segnalazione ricevuta. Il venditore proverà a risolvere il problema.',
            { reply_markup: undefined }
        );
    }

    /**
     * Handle charging finished
     */
    async handleChargingFinished(ctx) {
        await ctx.editMessageText(
            Messages.templates.charging.sendDisplayPhoto(),
            { parse_mode: 'Markdown' }
        );
        
        ctx.session.waitingFor = 'display_photo';
        ctx.session.waitingForDisplayPhoto = true;
    }

    /**
     * Handle KWH OK
     */
    async handleKwhOk(ctx, callbackData) {
        const shortId = callbackData.replace('kwh_ok_', '');
        
        const transaction = await this.bot.findTransactionByShortId(shortId, ctx.from.id);
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }

        await this.services.transaction.updateTransactionStatus(
            transaction.transactionId,
            TRANSACTION_STATUS.PAYMENT_REQUESTED
        );

        const announcement = await this.services.announcement.getAnnouncement(transaction.announcementId);

        try {
            const amount = transaction.totalAmount ? 
                transaction.totalAmount.toFixed(2) : 
                'ERRORE CALCOLO';
            
            let buyerMessage = Messages.templates.charging.kwhConfirmed(transaction, announcement, amount);
            
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.buyerId } },
                buyerMessage,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.payment.getConfirmationKeyboard().reply_markup
                }
            );

            // Save transaction ID in session for payment
            ctx.session.currentTransactionId = transaction.transactionId;

        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await ctx.editMessageText(
            '✅ KWH confermati! L\'acquirente è stato invitato a procedere con il pagamento.',
            { reply_markup: undefined }
        );
    }

    /**
     * Handle KWH bad
     */
    async handleKwhBad(ctx, callbackData) {
        const shortId = callbackData.replace('kwh_bad_', '');
        
        await ctx.editMessageText(
            '📝 *KWH non corretti*\n\n' +
            'Specifica il problema:\n' +
            '• Quanti KWH mostra realmente la foto?\n' +
            '• Qual è il problema riscontrato?',
            { parse_mode: 'Markdown' }
        );
        
        ctx.session.disputingKwh = true;
        ctx.session.disputeTransactionId = shortId;
        ctx.session.waitingFor = 'kwh_dispute_reason';
    }

    /**
     * Handle retry activation
     */
    async handleRetryActivation(ctx) {
        const messageText = ctx.callbackQuery.message.text;
        const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
        
        if (!transactionIdMatch) {
            await ctx.editMessageText('❌ ID transazione non trovato.');
            return;
        }
        
        const transactionId = transactionIdMatch[1];
        const transaction = await this.services.transaction.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        // Retry activation
        await this.services.transaction.updateTransactionStatus(
            transactionId,
            TRANSACTION_STATUS.CHARGING_STARTED
        );
        
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.buyerId } },
                Messages.templates.charging.retryAttempt(transactionId),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Ora funziona!', callback_data: `charging_ok_${transactionId}` },
                                { text: '❌ Ancora non carica', callback_data: `charging_fail_${transactionId}` }
                            ]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error notifying buyer about retry:', error);
        }
        
        await ctx.editMessageText(
            '🔄 **RIATTIVAZIONE IN CORSO**\n\n' +
            'Nuovo tentativo inviato. L\'acquirente verificherà se ora funziona.',
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Handle simple activate charging (from message)
     */
    async handleActivateChargingSimple(ctx) {
        const messageText = ctx.callbackQuery.message.text;
        const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
        
        if (!transactionIdMatch) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ ID transazione non trovato.');
            return;
        }
        
        const transactionId = transactionIdMatch[1].replace(/\\/g, '');
        const transaction = await this.services.transaction.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        await this.services.transaction.updateTransactionStatus(
            transactionId,
            TRANSACTION_STATUS.CHARGING_STARTED
        );

        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.buyerId } },
                Messages.templates.charging.chargingStarted(transactionId),
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.charging.getBuyerConfirmKeyboard().reply_markup
                }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await this.utils.chatCleaner.sendConfirmationMessage(ctx,
            '⚡ Ricarica attivata!\n\n' +
            'In attesa della conferma dall\'acquirente che la ricarica sia iniziata correttamente.'
        );
    }

    /**
     * Handle simple delay charging
     */
    async handleDelayChargingSimple(ctx) {
        const messageText = ctx.callbackQuery.message.text;
        const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
        const transactionId = transactionIdMatch ? transactionIdMatch[1].replace(/\\/g, '') : null;
        
        setTimeout(async () => {
            try {
                let message = '⏰ Promemoria: È il momento di attivare la ricarica!';
                if (transactionId) {
                    message += `\n\nID Transazione: \`${transactionId}\``;
                }
                
                await this.utils.chatCleaner.sendPersistentMessage(
                    { telegram: this.telegram, from: { id: ctx.from.id } },
                    message,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: Keyboards.charging.getActivateKeyboard().reply_markup
                    }
                );
            } catch (error) {
                console.error('Error sending delayed reminder:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes

        await this.utils.chatCleaner.sendConfirmationMessage(ctx,
            '⏸️ Ricarica rimandata di 5 minuti.\n\n' +
            'Riceverai un promemoria quando sarà il momento di attivare.'
        );
    }

    /**
     * Handle open transaction
     */
    async handleOpenTransaction(ctx, transactionId) {
        ctx.session.transactionId = transactionId;
        await this.utils.chatCleaner.enterScene(ctx, 'transactionScene');
    }
}

module.exports = ChargingCallbacks;
