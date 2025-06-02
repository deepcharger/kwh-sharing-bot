// src/scenes/transaction/states/CompletionState.js
const { TRANSACTION_STATUS } = require('../../../config/constants');
const Messages = require('../../../utils/messages/Messages');
const Keyboards = require('../../../utils/keyboards/Keyboards');
const logger = require('../../../utils/logger');

class CompletionState {
    constructor(bot) {
        this.bot = bot;
        this.services = bot.services;
        this.chatCleaner = bot.chatCleaner;
    }

    /**
     * Handle completion states
     */
    async handle(ctx, transaction, announcement) {
        const status = transaction.status;
        const userId = ctx.from.id;
        const isSeller = userId === transaction.sellerId;
        const isBuyer = userId === transaction.buyerId;

        switch (status) {
            case TRANSACTION_STATUS.COMPLETED:
                return await this.handleCompleted(ctx, transaction, announcement, isSeller, isBuyer);
                
            case TRANSACTION_STATUS.CANCELLED:
                return await this.handleCancelled(ctx, transaction, isSeller, isBuyer);
                
            case TRANSACTION_STATUS.DISPUTED:
                return await this.handleDisputed(ctx, transaction, isSeller, isBuyer);
                
            default:
                return false;
        }
    }

    /**
     * Handle completed transaction
     */
    async handleCompleted(ctx, transaction, announcement, isSeller, isBuyer) {
        // Check if user has left feedback
        const hasFeedback = await this.checkUserFeedback(transaction, userId);
        
        await this.showCompletedView(ctx, transaction, announcement, isSeller, hasFeedback);
        return true;
    }

    /**
     * Show completed transaction view
     */
    async showCompletedView(ctx, transaction, announcement, isSeller, hasFeedback) {
        const role = isSeller ? 'venditore' : 'acquirente';
        
        let message = `🎉 **TRANSAZIONE COMPLETATA**\n\n`;
        message += `✅ La transazione è stata completata con successo!\n\n`;
        
        // Transaction summary
        message += `📊 **RIEPILOGO:**\n`;
        message += `• Data: ${transaction.completedAt?.toLocaleDateString('it-IT') || 'N/A'}\n`;
        message += `• KWH: ${transaction.declaredKwh || transaction.actualKwh}\n`;
        
        if (transaction.totalAmount) {
            message += `• Importo: €${transaction.totalAmount.toFixed(2)}\n`;
        }
        
        message += `• Durata totale: ${this.calculateTotalDuration(transaction)}\n\n`;
        
        // Stats update
        if (isSeller) {
            message += `📈 Hai venduto ${transaction.declaredKwh} KWH in più!\n`;
        } else {
            message += `📈 Hai acquistato ${transaction.declaredKwh} KWH!\n`;
        }
        
        // Feedback status
        if (!hasFeedback) {
            message += `\n⭐ **Non dimenticare di lasciare un feedback!**`;
        } else {
            message += `\n✅ Hai già lasciato il tuo feedback.`;
        }
        
        const buttons = [];
        
        if (!hasFeedback) {
            buttons.push([{ text: '⭐ Lascia feedback', callback_data: `feedback_tx_${transaction.transactionId}` }]);
        }
        
        buttons.push(
            [{ text: '📋 Dettagli completi', callback_data: `view_full_details_${transaction.transactionId}` }],
            [{ text: '📜 Cronologia transazioni', callback_data: 'tx_history' }],
            [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
        );
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
    }

    /**
     * Handle cancelled transaction
     */
    async handleCancelled(ctx, transaction, isSeller, isBuyer) {
        await this.showCancelledView(ctx, transaction, isSeller);
        return true;
    }

    /**
     * Show cancelled transaction view
     */
    async showCancelledView(ctx, transaction, isSeller) {
        const role = isSeller ? 'venditore' : 'acquirente';
        
        let message = `❌ **TRANSAZIONE ANNULLATA**\n\n`;
        
        if (transaction.cancellationReason) {
            message += `📝 Motivo: ${transaction.cancellationReason}\n\n`;
        }
        
        message += `• Data annullamento: ${transaction.updatedAt.toLocaleDateString('it-IT')}\n`;
        message += `• Ruolo: ${role}\n`;
        
        // Cancellation stats
        const cancelledBy = transaction.cancelledBy === transaction.sellerId ? 'venditore' : 'acquirente';
        if (cancelledBy === role) {
            message += `\n⚠️ Hai annullato tu questa transazione.`;
        } else {
            message += `\n⚠️ L'altra parte ha annullato questa transazione.`;
        }
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📜 Cronologia transazioni', callback_data: 'tx_history' }],
                    [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                ]
            }
        });
    }

    /**
     * Handle disputed transaction
     */
    async handleDisputed(ctx, transaction, isSeller, isBuyer) {
        await this.showDisputedView(ctx, transaction, isSeller);
        return true;
    }

    /**
     * Show disputed transaction view
     */
    async showDisputedView(ctx, transaction, isSeller) {
        const role = isSeller ? 'venditore' : 'acquirente';
        
        let message = `⚠️ **TRANSAZIONE IN DISPUTA**\n\n`;
        message += `Questa transazione ha dei problemi aperti.\n\n`;
        
        if (transaction.issues && transaction.issues.length > 0) {
            message += `📋 **PROBLEMI SEGNALATI:**\n`;
            
            for (const issue of transaction.issues.slice(-3)) { // Show last 3 issues
                const reportedBy = issue.reportedBy === transaction.sellerId ? 'Venditore' : 'Acquirente';
                message += `\n• ${issue.description}\n`;
                message += `  _Segnalato da: ${reportedBy} - ${new Date(issue.timestamp).toLocaleDateString('it-IT')}_\n`;
            }
            
            if (transaction.issues.length > 3) {
                message += `\n_...e altri ${transaction.issues.length - 3} problemi_\n`;
            }
        }
        
        message += `\n💡 **COSA PUOI FARE:**\n`;
        message += `• Contatta l'altra parte per risolvere\n`;
        message += `• Fornisci prove se necessario\n`;
        message += `• Chiedi assistenza all'amministratore\n`;
        
        const otherPartyId = isSeller ? transaction.buyerId : transaction.sellerId;
        const otherPartyRole = isSeller ? 'acquirente' : 'venditore';
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: `📞 Contatta ${otherPartyRole}`, callback_data: `contact_${otherPartyRole}_${otherPartyId}` }],
                    [{ text: '📷 Invia prove', callback_data: `send_dispute_proof_${transaction.transactionId}` }],
                    [{ text: '🚨 Chiama admin', callback_data: 'contact_admin' }],
                    [{ text: '✅ Problema risolto', callback_data: `resolve_dispute_${transaction.transactionId}` }],
                    [{ text: '🔙 Indietro', callback_data: 'tx_back' }]
                ]
            }
        });
    }

    /**
     * Show transaction details
     */
    async showFullDetails(ctx, transaction, announcement) {
        const userId = ctx.from.id;
        const isSeller = userId === transaction.sellerId;
        
        const detailText = await Messages.formatters.transaction.fullDetails(
            transaction,
            announcement,
            isSeller,
            this.bot.getStatusText.bind(this.bot)
        );
        
        // Add timeline
        const timeline = this.generateTimeline(transaction);
        const finalText = detailText + '\n\n' + timeline;
        
        await ctx.editMessageText(finalText, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Torna ai dettagli', callback_data: `view_tx_${transaction.transactionId}` }],
                    [{ text: '📜 Cronologia', callback_data: 'tx_history' }],
                    [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                ]
            }
        });
    }

    /**
     * Generate transaction timeline
     */
    generateTimeline(transaction) {
        let timeline = '📅 **CRONOLOGIA:**\n';
        
        const events = [];
        
        // Created
        events.push({
            date: transaction.createdAt,
            text: '🆕 Richiesta creata'
        });
        
        // Status changes
        if (transaction.statusHistory) {
            for (const change of transaction.statusHistory) {
                events.push({
                    date: change.timestamp,
                    text: `${this.bot.getStatusEmoji(change.status)} ${this.bot.getStatusText(change.status)}`
                });
            }
        }
        
        // Completed
        if (transaction.completedAt) {
            events.push({
                date: transaction.completedAt,
                text: '✅ Completata'
            });
        }
        
        // Sort by date
        events.sort((a, b) => a.date - b.date);
        
        // Format timeline
        for (const event of events) {
            const dateStr = event.date.toLocaleDateString('it-IT');
            const timeStr = event.date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            timeline += `• ${dateStr} ${timeStr} - ${event.text}\n`;
        }
        
        return timeline;
    }

    /**
     * Check if user has left feedback
     */
    async checkUserFeedback(transaction, userId) {
        const feedback = await this.bot.db.getCollection('feedback')
            .findOne({
                transactionId: transaction.transactionId,
                fromUserId: userId
            });
        
        return !!feedback;
    }

    /**
     * Calculate total duration
     */
    calculateTotalDuration(transaction) {
        if (!transaction.completedAt) return 'N/A';
        
        const start = transaction.createdAt;
        const end = transaction.completedAt;
        const diffMs = end - start;
        
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days} giorn${days === 1 ? 'o' : 'i'}`;
        } else if (hours > 0) {
            return `${hours} or${hours === 1 ? 'a' : 'e'} e ${minutes} minut${minutes === 1 ? 'o' : 'i'}`;
        } else {
            return `${minutes} minut${minutes === 1 ? 'o' : 'i'}`;
        }
    }

    /**
     * Handle dispute resolution
     */
    async handleDisputeResolution(ctx, transaction) {
        await ctx.editMessageText(
            '✅ **VUOI RISOLVERE LA DISPUTA?**\n\n' +
            'Se il problema è stato risolto con l\'altra parte, puoi chiudere la disputa.\n\n' +
            'Sei sicuro di voler segnare questa transazione come risolta?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Sì, risolvi', callback_data: `confirm_resolve_${transaction.transactionId}` },
                            { text: '❌ No, annulla', callback_data: `view_tx_${transaction.transactionId}` }
                        ]
                    ]
                }
            }
        );
    }

    /**
     * Confirm dispute resolution
     */
    async confirmDisputeResolution(ctx, transaction) {
        try {
            // Add resolution to issues
            await this.services.transaction.addTransactionIssue(
                transaction.transactionId,
                'Disputa risolta di comune accordo',
                ctx.from.id
            );
            
            // Update status to completed
            await this.services.transaction.updateTransactionStatus(
                transaction.transactionId,
                TRANSACTION_STATUS.COMPLETED
            );
            
            // Notify other party
            const otherPartyId = ctx.from.id === transaction.sellerId ? 
                transaction.buyerId : transaction.sellerId;
            
            try {
                await this.bot.bot.telegram.sendMessage(
                    otherPartyId,
                    `✅ **DISPUTA RISOLTA**\n\n` +
                    `L'altra parte ha segnato la disputa come risolta.\n` +
                    `La transazione è ora completata.\n\n` +
                    `ID: \`${transaction.transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⭐ Lascia feedback', callback_data: `feedback_tx_${transaction.transactionId}` }]
                            ]
                        }
                    }
                );
            } catch (error) {
                logger.error('Error notifying dispute resolution:', error);
            }
            
            await ctx.editMessageText(
                '✅ **DISPUTA RISOLTA!**\n\n' +
                'La transazione è stata segnata come completata.\n' +
                'Non dimenticare di lasciare un feedback!',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⭐ Lascia feedback', callback_data: `feedback_tx_${transaction.transactionId}` }],
                            [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            logger.error('Error resolving dispute:', error);
            await ctx.answerCbQuery('❌ Errore nella risoluzione', { show_alert: true });
        }
    }

    /**
     * Send dispute proof
     */
    async sendDisputeProof(ctx, transaction) {
        await ctx.editMessageText(
            '📷 **INVIA PROVE**\n\n' +
            'Puoi inviare foto o documenti che supportano la tua posizione nella disputa.\n\n' +
            'Cosa puoi inviare:\n' +
            '• Screenshot di conversazioni\n' +
            '• Foto del display o della colonnina\n' +
            '• Prove di pagamento\n' +
            '• Qualsiasi documento rilevante\n\n' +
            'Invia le prove ora:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Annulla', callback_data: `view_tx_${transaction.transactionId}` }]
                    ]
                }
            }
        );
        
        ctx.session.waitingFor = 'dispute_proof';
        ctx.session.disputeTransactionId = transaction.transactionId;
    }
}

module.exports = CompletionState;
