// src/handlers/messages/MessageHandler.js - NUOVO FILE (sostituisce il vecchio)
const BaseHandler = require('../base/BaseHandler');
const Messages = require('../../utils/messages/Messages');
const Keyboards = require('../../utils/keyboards/Keyboards');
const MarkdownEscape = require('../../utils/MarkdownEscape');

class MessageHandler extends BaseHandler {
    constructor(bot) {
        super(bot);
    }

    /**
     * Setup message handlers
     */
    async setup() {
        console.log('🔧 Setting up message handlers...');
        
        // Handle text messages
        this.bot.bot.on('text', async (ctx, next) => {
            await this.handleTextMessage(ctx, next);
        });
        
        // Handle photo uploads
        this.bot.bot.on('photo', async (ctx) => {
            await this.handlePhotoMessage(ctx);
        });
        
        // Handle documents
        this.bot.bot.on('document', async (ctx) => {
            await this.handleDocumentMessage(ctx);
        });
        
        // Handle locations
        this.bot.bot.on('location', async (ctx) => {
            await this.handleLocationMessage(ctx);
        });
        
        // Handle voice messages
        this.bot.bot.on('voice', async (ctx) => {
            await this.handleVoiceMessage(ctx);
        });
        
        // Handle stickers
        this.bot.bot.on('sticker', async (ctx) => {
            await this.handleStickerMessage(ctx);
        });
        
        // Handle video
        this.bot.bot.on('video', async (ctx) => {
            await this.handleVideoMessage(ctx);
        });
        
        // Handle unexpected messages
        this.bot.bot.on('message', async (ctx) => {
            await this.handleUnexpectedMessage(ctx);
        });
        
        console.log('✅ Message handlers setup completed');
    }

    /**
     * Handle text messages
     */
    async handleTextMessage(ctx, next) {
        const text = ctx.message.text.trim();
        
        // Check if waiting for rejection reason
        if (ctx.session?.waitingForRejectionReason && ctx.session?.rejectingTransactionId) {
            await this.handleRejectionReason(ctx, text);
            return;
        }
        
        // Check if waiting for feedback reason
        if (ctx.session?.waitingFor === 'feedback_reason') {
            await this.handleFeedbackReason(ctx, text);
            return;
        }
        
        // Check if waiting for KWH dispute
        if (ctx.session?.waitingFor === 'kwh_dispute_reason' && ctx.session?.disputingKwh) {
            await this.handleKwhDispute(ctx, text);
            return;
        }
        
        // Continue to next handler if not handling anything special
        return next();
    }

    /**
     * Handle rejection reason
     */
    async handleRejectionReason(ctx, reason) {
        const transactionId = ctx.session.rejectingTransactionId;
        
        delete ctx.session.waitingForRejectionReason;
        delete ctx.session.rejectingTransactionId;
        
        const transaction = await this.services.transaction.getTransaction(transactionId);
        if (!transaction) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
            return;
        }
        
        await this.services.transaction.updateTransactionStatus(
            transactionId,
            'cancelled',
            { cancellationReason: reason }
        );

        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.buyerId } },
                Messages.templates.transaction.requestRejected(reason),
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await this.utils.chatCleaner.sendConfirmationMessage(ctx,
            '❌ Richiesta rifiutata. L\'acquirente è stato notificato.'
        );
        
        setTimeout(async () => {
            await this.utils.chatCleaner.resetUserChat(ctx);
        }, 3000);
    }

    /**
     * Handle feedback reason
     */
    async handleFeedbackReason(ctx, reason) {
        const transaction = ctx.session.transaction;

        await this.services.transaction.createFeedback(
            transaction.transactionId,
            ctx.from.id,
            ctx.session.feedbackTargetUserId,
            ctx.session.feedbackRating,
            reason
        );

        await this.utils.chatCleaner.sendConfirmationMessage(ctx,
            '⭐ Grazie per il feedback!\n\n' +
            'Il tuo commento aiuterà a migliorare il servizio.'
        );

        // Clear session
        delete ctx.session.waitingFor;
        delete ctx.session.feedbackRating;
        delete ctx.session.feedbackTargetUserId;
        delete ctx.session.transaction;
        
        setTimeout(async () => {
            await this.utils.chatCleaner.resetUserChat(ctx);
        }, 3000);
    }

    /**
     * Handle KWH dispute
     */
    async handleKwhDispute(ctx, reason) {
        const shortId = ctx.session.disputeTransactionId;
        
        const transaction = await this.bot.findTransactionByShortId(shortId, ctx.from.id);
        if (!transaction) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
            return;
        }
        
        await this.services.transaction.addTransactionIssue(
            transaction.transactionId,
            `Discrepanza KWH: ${reason}`,
            ctx.from.id
        );
        
        try {
            await this.utils.chatCleaner.sendPersistentMessage(
                { telegram: this.telegram, from: { id: transaction.buyerId } },
                Messages.templates.transaction.kwhDispute(reason),
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }
        
        await this.utils.chatCleaner.sendConfirmationMessage(ctx,
            '⚠️ Problema segnalato all\'acquirente.\n\n' +
            'Potete chiarire privatamente la questione.'
        );
        
        // Clear session
        delete ctx.session.disputingKwh;
        delete ctx.session.disputeTransactionId;
        delete ctx.session.waitingFor;
        
        setTimeout(async () => {
            await this.utils.chatCleaner.resetUserChat(ctx);
        }, 5000);
    }

    /**
     * Handle photo messages
     */
    async handlePhotoMessage(ctx) {
        if (ctx.session?.waitingFor === 'payment_proof') {
            await this.handlePaymentProof(ctx);
            return;
        }
        
        // Handle photos in scenes or other contexts
        if (!ctx.scene) {
            await this.utils.chatCleaner.sendTemporaryMessage(ctx,
                '❌ Non aspettavo una foto in questo momento.',
                {},
                3000
            );
        }
    }

    /**
     * Handle payment proof
     */
    async handlePaymentProof(ctx) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        
        let transactionId = ctx.session.currentTransactionId;
        
        if (!transactionId) {
            const userId = ctx.from.id;
            const transactions = await this.services.transaction.getUserTransactions(userId, 'all');
            const paymentPending = transactions.filter(t => 
                t.status === 'payment_requested' && t.buyerId === userId
            );
            
            if (paymentPending.length === 1) {
                transactionId = paymentPending[0].transactionId;
            } else {
                await this.utils.chatCleaner.sendErrorMessage(ctx, 
                    '❌ Non riesco a identificare la transazione. Riprova dal menu pagamenti.'
                );
                delete ctx.session.waitingFor;
                return;
            }
        }
        
        const transaction = await this.services.transaction.getTransaction(transactionId);
        if (!transaction) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
            delete ctx.session.waitingFor;
            return;
        }
        
        try {
            await ctx.telegram.sendPhoto(transaction.sellerId, photo.file_id, {
                caption: Messages.templates.payment.proofCaption(ctx.from, transactionId)
            });
            
            await this.utils.chatCleaner.sendConfirmationMessage(ctx,
                '✅ Prova di pagamento inviata al venditore.\n\n' +
                'Attendi la conferma.'
            );
            
            setTimeout(async () => {
                await this.utils.chatCleaner.resetUserChat(ctx);
            }, 5000);
            
        } catch (error) {
            console.error('Error forwarding payment proof:', error);
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Errore nell\'invio. Riprova.');
        }
        
        delete ctx.session.waitingFor;
    }

    /**
     * Handle document messages
     */
    async handleDocumentMessage(ctx) {
        if (!ctx.scene) {
            await this.utils.chatCleaner.sendTemporaryMessage(ctx,
                '❌ Non accetto documenti in questo momento.',
                {},
                3000
            );
        }
    }

    /**
     * Handle location messages
     */
    async handleLocationMessage(ctx) {
        if (!ctx.scene) {
            await this.utils.chatCleaner.sendTemporaryMessage(ctx,
                '❌ Non aspettavo una posizione in questo momento.',
                {},
                3000
            );
        }
    }

    /**
     * Handle voice messages
     */
    async handleVoiceMessage(ctx) {
        await this.utils.chatCleaner.sendTemporaryMessage(ctx,
            '❌ I messaggi vocali non sono supportati. Scrivi il testo.',
            {},
            5000
        );
    }

    /**
     * Handle sticker messages
     */
    async handleStickerMessage(ctx) {
        await this.utils.chatCleaner.sendTemporaryMessage(ctx,
            '❌ Gli sticker non sono supportati in questo bot.',
            {},
            3000
        );
    }

    /**
     * Handle video messages
     */
    async handleVideoMessage(ctx) {
        await this.utils.chatCleaner.sendTemporaryMessage(ctx,
            '❌ I video non sono supportati. Invia foto per documentare le transazioni.',
            {},
            5000
        );
    }

    /**
     * Handle unexpected messages
     */
    async handleUnexpectedMessage(ctx) {
        // Only if not in a scene
        if (!ctx.scene) {
            await this.utils.chatCleaner.sendTemporaryMessage(ctx,
                '❌ Messaggio non riconosciuto. Usa i pulsanti del menu o i comandi disponibili.',
                {},
                5000
            );
        }
    }
}

module.exports = MessageHandler;
