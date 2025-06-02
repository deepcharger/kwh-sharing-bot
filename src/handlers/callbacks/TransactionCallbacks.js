// src/handlers/callbacks/TransactionCallbacks.js - NUOVO FILE
const BaseHandler = require('../base/BaseHandler');
const Keyboards = require('../../utils/keyboards/Keyboards');
const Messages = require('../../utils/messages/Messages');
const MarkdownEscape = require('../../utils/MarkdownEscape');
const { TRANSACTION_STATUS } = require('../../config/constants');

class TransactionCallbacks extends BaseHandler {
    constructor(bot) {
        super(bot);
    }

    /**
     * Main handler method
     */
    async handle(ctx, callbackData) {
        await this.answerCallback(ctx);
        
        // Route to specific handler
        if (callbackData.startsWith('accept_request_')) {
            await this.handleAcceptRequest(ctx, callbackData);
        } else if (callbackData.startsWith('reject_request_')) {
            await this.handleRejectRequest(ctx, callbackData);
        } else if (callbackData.startsWith('contact_buyer_')) {
            await this.handleContactBuyer(ctx, callbackData);
        } else if (callbackData.startsWith('view_tx_')) {
            await this.handleViewTransaction(ctx, callbackData);
        } else if (callbackData.startsWith('manage_tx_')) {
            await this.handleManageTransaction(ctx, callbackData);
        } else if (callbackData.startsWith('arrived_at_station_')) {
            await this.handleArrivedAtStation(ctx, callbackData);
        }
    }

    /**
     * Handle accept request
     */
    async handleAcceptRequest(ctx, callbackData) {
        const transactionId = callbackData.replace('accept_request_', '');
        const transaction = await this.services.transaction.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        await this.services.transaction.updateTransactionStatus(
            transactionId,
            TRANSACTION_STATUS.CONFIRMED
        );

        // Notify buyer with new message and button
        try {
            let buyerMessage = Messages.templates.transaction.requestAccepted(transaction);
            
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.buyerId } },
                buyerMessage,
                { 
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📍 Sono arrivato alla colonnina', callback_data: `arrived_at_station_${transactionId}` }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await this.utils.chatCleaner.sendConfirmationMessage(ctx,
            '✅ Richiesta accettata! L\'acquirente è stato notificato.\n\n' +
            'Riceverai una notifica quando l\'acquirente sarà arrivato alla colonnina.'
        );
        
        // Set reminder after 30 minutes
        this.scheduleArrivalReminder(transaction, ctx);
    }

    /**
     * Handle reject request
     */
    async handleRejectRequest(ctx, callbackData) {
        const transactionId = callbackData.replace('reject_request_', '');
        ctx.session.rejectingTransactionId = transactionId;
        
        await ctx.editMessageText(
            '📝 *Motivo del rifiuto:*\n\n' +
            'Scrivi brevemente il motivo per cui rifiuti questa richiesta:',
            { parse_mode: 'Markdown' }
        );
        
        ctx.session.waitingForRejectionReason = true;
    }

    /**
     * Handle contact buyer
     */
    async handleContactBuyer(ctx, callbackData) {
        const match = callbackData.match(/contact_buyer_(\d+)_(.+)/);
        if (!match) return;
        
        const buyerId = match[1];
        const buyerUsername = match[2];
        
        const telegramLink = buyerUsername !== 'user' ? 
            `https://t.me/${buyerUsername}` : 
            `tg://user?id=${buyerId}`;
        
        const message = Messages.templates.transaction.contactBuyer(
            buyerUsername,
            buyerId,
            telegramLink
        );
        
        await this.utils.chatCleaner.sendTemporaryMessage(ctx, message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true 
        }, 10000);
    }

    /**
     * Handle view transaction
     */
    async handleViewTransaction(ctx, callbackData) {
        const index = parseInt(callbackData.replace('view_tx_', ''));
        const userId = ctx.from.id;
        
        const allTransactions = await this.services.transaction.getUserTransactions(userId, 'all');
        const pending = allTransactions.filter(t => 
            ![TRANSACTION_STATUS.COMPLETED, TRANSACTION_STATUS.CANCELLED].includes(t.status)
        );
        
        if (index >= pending.length) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
            return;
        }
        
        const transaction = pending[index];
        const announcement = await this.services.announcement.getAnnouncement(transaction.announcementId);
        
        const statusText = this.bot.getStatusText(transaction.status);
        const statusEmoji = this.bot.getStatusEmoji(transaction.status);
        const role = userId === transaction.sellerId ? 'VENDITORE' : 'ACQUIRENTE';
        
        let detailText = Messages.formatters.transaction.details(
            transaction,
            role,
            statusText,
            statusEmoji,
            announcement
        );
        
        const shortId = transaction.transactionId.slice(-10);
        this.utils.transactionCache.set(shortId, transaction.transactionId);
        
        await this.utils.chatCleaner.editOrReplace(ctx, detailText, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: Keyboards.transaction.getActionsKeyboard(
                transaction.transactionId,
                transaction.status,
                userId === transaction.sellerId
            ).reply_markup,
            messageType: 'transaction_details'
        });
    }

    /**
     * Handle manage transaction
     */
    async handleManageTransaction(ctx, callbackData) {
        const shortId = callbackData.replace('manage_tx_', '');
        
        const transaction = await this.bot.findTransactionByShortId(shortId, ctx.from.id);
        
        if (!transaction) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
            return;
        }
        
        ctx.session.transactionId = transaction.transactionId;
        await this.utils.chatCleaner.enterScene(ctx, 'transactionScene');
    }

    /**
     * Handle buyer arrived at station
     */
    async handleArrivedAtStation(ctx, callbackData) {
        const transactionId = callbackData.replace('arrived_at_station_', '');
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
            TRANSACTION_STATUS.BUYER_ARRIVED
        );
        
        // Confirm to buyer
        const confirmMessage = Messages.templates.transaction.buyerArrivedConfirm(transaction);
        
        await ctx.editMessageText(confirmMessage, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true 
        });
        
        // Notify seller
        await this.services.notification.notifyTransactionUpdate(
            transaction,
            TRANSACTION_STATUS.BUYER_ARRIVED,
            { buyerUsername: ctx.from.username || ctx.from.first_name }
        );
    }

    /**
     * Schedule arrival reminder
     */
    scheduleArrivalReminder(transaction, ctx) {
        setTimeout(async () => {
            const updatedTransaction = await this.services.transaction.getTransaction(transaction.transactionId);
            
            if (updatedTransaction && updatedTransaction.status === TRANSACTION_STATUS.CONFIRMED) {
                await this.services.notification.sendReminder(
                    transaction.buyerId,
                    'charging_scheduled',
                    {
                        transactionId: transaction.transactionId,
                        scheduledDate: transaction.scheduledDate
                    }
                );
            }
        }, 30 * 60 * 1000); // 30 minutes
    }
}

module.exports = TransactionCallbacks;
