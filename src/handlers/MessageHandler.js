const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

class MessageHandler {
    constructor(bot) {
        this.bot = bot;
    }

    setupMessageHandlers() {
        // Handle text messages
        this.bot.bot.on('text', async (ctx, next) => {
            const text = ctx.message.text.trim();
            
            // Check if we're waiting for rejection reason
            if (ctx.session?.waitingForRejectionReason && ctx.session?.rejectingTransactionId) {
                const reason = ctx.message.text;
                const transactionId = ctx.session.rejectingTransactionId;
                
                delete ctx.session.waitingForRejectionReason;
                delete ctx.session.rejectingTransactionId;
                
                const transaction = await this.bot.transactionService.getTransaction(transactionId);
                if (!transaction) {
                    await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
                    return;
                }
                
                await this.bot.transactionService.updateTransactionStatus(
                    transactionId,
                    'cancelled',
                    { cancellationReason: reason }
                );

                try {
                    await this.bot.chatCleaner.sendPersistentMessage(
                        { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                        `❌ *Richiesta rifiutata*\n\n` +
                        `Il venditore ha rifiutato la tua richiesta.\n` +
                        `Motivo: ${reason}\n\n` +
                        `Puoi provare con un altro venditore.`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (error) {
                    console.error('Error notifying buyer:', error);
                }

                await this.bot.chatCleaner.sendConfirmationMessage(ctx,
                    '❌ Richiesta rifiutata. L\'acquirente è stato notificato.'
                );
                
                // Torna al menu dopo 3 secondi
                setTimeout(async () => {
                    await this.bot.chatCleaner.resetUserChat(ctx);
                }, 3000);
                
                return;
            }

            // Handle feedback reason for negative ratings
            if (ctx.session?.waitingFor === 'feedback_reason') {
                const reason = ctx.message.text;
                const transaction = ctx.session.transaction;

                await this.bot.transactionService.createFeedback(
                    transaction.transactionId,
                    ctx.from.id,
                    ctx.session.feedbackTargetUserId,
                    ctx.session.feedbackRating,
                    reason
                );

                await this.bot.chatCleaner.sendConfirmationMessage(ctx,
                    '⭐ Grazie per il feedback!\n\n' +
                    'Il tuo commento aiuterà a migliorare il servizio.'
                );

                // Clear session
                delete ctx.session.waitingFor;
                delete ctx.session.feedbackRating;
                delete ctx.session.feedbackTargetUserId;
                delete ctx.session.transaction;
                
                // Torna al menu dopo 3 secondi
                setTimeout(async () => {
                    await this.bot.chatCleaner.resetUserChat(ctx);
                }, 3000);
                
                return;
            }

            // Handle KWH dispute reason
            if (ctx.session?.waitingFor === 'kwh_dispute_reason' && ctx.session?.disputingKwh) {
                const reason = ctx.message.text;
                const shortId = ctx.session.disputeTransactionId;
                
                // Trova la transazione usando il short ID
                const transaction = await this.bot.findTransactionByShortId(shortId, ctx.from.id);
                if (!transaction) {
                    await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
                    return;
                }
                
                await this.bot.transactionService.addTransactionIssue(
                    transaction.transactionId,
                    `Discrepanza KWH: ${reason}`,
                    ctx.from.id
                );
                
                try {
                    await this.bot.chatCleaner.sendPersistentMessage(
                        { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                        `⚠️ *Problema con i KWH dichiarati*\n\n` +
                        `Il venditore segnala: ${reason}\n\n` +
                        `Controlla nuovamente la foto e rispondi al venditore.`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (error) {
                    console.error('Error notifying buyer:', error);
                }
                
                await this.bot.chatCleaner.sendConfirmationMessage(ctx,
                    '⚠️ Problema segnalato all\'acquirente.\n\n' +
                    'Potete chiarire privatamente la questione.'
                );
                
                // Clear session
                delete ctx.session.disputingKwh;
                delete ctx.session.disputeTransactionId;
                delete ctx.session.waitingFor;
                
                // Torna al menu dopo 5 secondi
                setTimeout(async () => {
                    await this.bot.chatCleaner.resetUserChat(ctx);
                }, 5000);
                
                return;
            }
            
            // Continue to next handler if not handling anything special
            return next();
        });

        // Handle photo uploads
        this.bot.bot.on('photo', async (ctx) => {
            if (ctx.session?.waitingFor === 'payment_proof') {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                
                // FIX: Migliore gestione dell'ID transazione per la prova di pagamento
                let transactionId = ctx.session.currentTransactionId;
                
                if (!transactionId) {
                    // Cerca tra le transazioni in attesa di pagamento
                    const userId = ctx.from.id;
                    const transactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
                    const paymentPending = transactions.filter(t => 
                        t.status === 'payment_requested' && t.buyerId === userId
                    );
                    
                    if (paymentPending.length === 1) {
                        transactionId = paymentPending[0].transactionId;
                    } else {
                        await this.bot.chatCleaner.sendErrorMessage(ctx, 
                            '❌ Non riesco a identificare la transazione. Riprova dal menu pagamenti.'
                        );
                        delete ctx.session.waitingFor;
                        return;
                    }
                }
                
                const transaction = await this.bot.transactionService.getTransaction(transactionId);
                if (!transaction) {
                    await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
                    delete ctx.session.waitingFor;
                    return;
                }
                
                try {
                    await ctx.telegram.sendPhoto(transaction.sellerId, photo.file_id, {
                        caption: `📷 Prova di pagamento dall'acquirente @${ctx.from.username || ctx.from.first_name}\n\nTransazione: ${transactionId}`
                    });
                    
                    await this.bot.chatCleaner.sendConfirmationMessage(ctx,
                        '✅ Prova di pagamento inviata al venditore.\n\n' +
                        'Attendi la conferma.'
                    );
                    
                    // Torna al menu dopo 5 secondi
                    setTimeout(async () => {
                        await this.bot.chatCleaner.resetUserChat(ctx);
                    }, 5000);
                    
                } catch (error) {
                    console.error('Error forwarding payment proof:', error);
                    await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Errore nell\'invio. Riprova.');
                }
                
                delete ctx.session.waitingFor;
                return;
            }
            
            // Handle photos in scenes or other contexts
            if (!ctx.scene) {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    '❌ Non aspettavo una foto in questo momento.',
                    {},
                    3000
                );
            }
        });

        // Handle documents
        this.bot.bot.on('document', async (ctx) => {
            if (!ctx.scene) {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    '❌ Non accetto documenti in questo momento.',
                    {},
                    3000
                );
            }
        });

        // Handle locations
        this.bot.bot.on('location', async (ctx) => {
            if (!ctx.scene) {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    '❌ Non aspettavo una posizione in questo momento.',
                    {},
                    3000
                );
            }
        });

        // Handle voice messages
        this.bot.bot.on('voice', async (ctx) => {
            await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                '❌ I messaggi vocali non sono supportati. Scrivi il testo.',
                {},
                5000
            );
        });

        // Handle stickers
        this.bot.bot.on('sticker', async (ctx) => {
            await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                '❌ Gli sticker non sono supportati in questo bot.',
                {},
                3000
            );
        });

        // Handle video
        this.bot.bot.on('video', async (ctx) => {
            await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                '❌ I video non sono supportati. Invia foto per documentare le transazioni.',
                {},
                5000
            );
        });

        // RIMOSSO: ❌ Callback duplicati select_payment_ e payment_in_progress
        // Questi sono già gestiti in CallbackHandler.js
        
        // Handle unexpected messages
        this.bot.bot.on('message', async (ctx) => {
            // Solo se non siamo in una scene
            if (!ctx.scene) {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    '❌ Messaggio non riconosciuto. Usa i pulsanti del menu o i comandi disponibili.',
                    {},
                    5000
                );
            }
        });
    }
}

module.exports = MessageHandler;
