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
            
            // Check if we're waiting for transaction ID for payment
            if (ctx.session?.waitingForTransactionId && ctx.session?.pendingPaymentConfirmation) {
                console.log('Processing transaction ID for payment:', text);
                
                const transaction = await this.bot.transactionService.getTransaction(text);
                
                if (!transaction) {
                    await ctx.reply(
                        '❌ **Transazione non trovata**\n\n' +
                        `ID inserito: \`${text}\`\n\n` +
                        '📋 Verifica che l\'ID sia corretto e riprova.\n' +
                        'L\'ID deve essere nel formato: `TA1234567890-20250524123456`',
                        { parse_mode: 'Markdown' }
                    );
                    return;
                }
                
                if (transaction.buyerId !== ctx.from.id) {
                    await ctx.reply('❌ Non sei autorizzato per questa transazione.');
                    return;
                }
                
                delete ctx.session.waitingForTransactionId;
                delete ctx.session.pendingPaymentConfirmation;
                
                await this.processPaymentConfirmation(ctx, text);
                return;
            }
            
            // Check if we're waiting for transaction ID (generic)
            if (ctx.session?.waitingForTransactionId) {
                const transactionId = text;
                const transaction = await this.bot.transactionService.getTransaction(transactionId);
                
                if (!transaction) {
                    await ctx.reply('❌ Transazione non trovata. Verifica l\'ID e riprova.');
                    return;
                }
                
                if (transaction.buyerId !== ctx.from.id) {
                    await ctx.reply('❌ Non sei autorizzato per questa transazione.');
                    return;
                }
                
                delete ctx.session.waitingForTransactionId;
                ctx.session.currentTransactionId = transactionId;
                
                const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);
                const amount = announcement && transaction.declaredKwh ? 
                    (transaction.declaredKwh * announcement.price).toFixed(2) : 'N/A';
                
                try {
                    await ctx.telegram.sendMessage(
                        transaction.sellerId,
                        `💳 **DICHIARAZIONE PAGAMENTO**\n\n` +
                        `L'acquirente @${ctx.from.username || ctx.from.first_name} dichiara di aver pagato.\n\n` +
                        `💰 Importo dichiarato: €${amount}\n` +
                        `⚡ KWH forniti: ${transaction.declaredKwh || 'N/A'}\n` +
                        `🔍 ID Transazione: \`${transactionId}\`\n\n` +
                        `Hai ricevuto il pagamento?`,
                        {
                            parse_mode: 'Markdown',
                            ...Keyboards.getSellerPaymentConfirmKeyboard()
                        }
                    );
                    
                } catch (error) {
                    console.error('Error notifying seller:', error);
                }

                await ctx.reply(
                    '✅ **Dichiarazione di pagamento inviata!**\n\n' +
                    'Il venditore riceverà una notifica e dovrà confermare la ricezione del pagamento.',
                    { parse_mode: 'Markdown' }
                );
                
                return;
            }
            
            // Check if we're waiting for rejection reason
            if (ctx.session?.waitingForRejectionReason && ctx.session?.rejectingTransactionId) {
                const reason = ctx.message.text;
                const transactionId = ctx.session.rejectingTransactionId;
                
                delete ctx.session.waitingForRejectionReason;
                delete ctx.session.rejectingTransactionId;
                
                const transaction = await this.bot.transactionService.getTransaction(transactionId);
                if (!transaction) {
                    await ctx.reply('❌ Transazione non trovata.');
                    return;
                }
                
                await this.bot.transactionService.updateTransactionStatus(
                    transactionId,
                    'cancelled',
                    { cancellationReason: reason }
                );

                try {
                    await ctx.telegram.sendMessage(
                        transaction.buyerId,
                        `❌ *Richiesta rifiutata*\n\n` +
                        `Il venditore ha rifiutato la tua richiesta.\n` +
                        `Motivo: ${reason}\n\n` +
                        `Puoi provare con un altro venditore.`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (error) {
                    console.error('Error notifying buyer:', error);
                }

                await ctx.reply(
                    '❌ Richiesta rifiutata. L\'acquirente è stato notificato.',
                    Keyboards.MAIN_MENU
                );
                
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

                await ctx.reply(
                    '⭐ Grazie per il feedback!\n\n' +
                    'Il tuo commento aiuterà a migliorare il servizio.',
                    Keyboards.MAIN_MENU
                );

                // Clear session
                delete ctx.session.waitingFor;
                delete ctx.session.feedbackRating;
                delete ctx.session.feedbackTargetUserId;
                delete ctx.session.transaction;
                
                return;
            }

            // Handle KWH dispute reason
            if (ctx.session?.waitingFor === 'kwh_dispute_reason' && ctx.session?.disputingKwh) {
                const reason = ctx.message.text;
                const transactionId = ctx.session.disputeTransactionId;
                
                const transaction = await this.bot.transactionService.getTransaction(transactionId);
                if (!transaction) {
                    await ctx.reply('❌ Transazione non trovata.');
                    return;
                }
                
                await this.bot.transactionService.addTransactionIssue(
                    transactionId,
                    `Discrepanza KWH: ${reason}`,
                    ctx.from.id
                );
                
                try {
                    await ctx.telegram.sendMessage(
                        transaction.buyerId,
                        `⚠️ *Problema con i KWH dichiarati*\n\n` +
                        `Il venditore segnala: ${reason}\n\n` +
                        `Controlla nuovamente la foto e rispondi al venditore.`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (error) {
                    console.error('Error notifying buyer:', error);
                }
                
                await ctx.reply(
                    '⚠️ Problema segnalato all\'acquirente.\n\n' +
                    'Potete chiarire privatamente la questione.',
                    Keyboards.MAIN_MENU
                );
                
                // Clear session
                delete ctx.session.disputingKwh;
                delete ctx.session.disputeTransactionId;
                delete ctx.session.waitingFor;
                
                return;
            }
            
            // Continue to next handler if not handling anything special
            return next();
        });

        // Handle photo uploads
        this.bot.bot.on('photo', async (ctx) => {
            if (ctx.session?.waitingFor === 'payment_proof') {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const transactionId = ctx.session.currentTransactionId;
                
                if (!transactionId) {
                    await ctx.reply('❌ ID transazione non trovato.');
                    return;
                }
                
                const transaction = await this.bot.transactionService.getTransaction(transactionId);
                if (!transaction) {
                    await ctx.reply('❌ Transazione non trovata.');
                    return;
                }
                
                try {
                    await ctx.telegram.sendPhoto(transaction.sellerId, photo.file_id, {
                        caption: `📷 Prova di pagamento dall'acquirente @${ctx.from.username || ctx.from.first_name}\n\nTransazione: ${transactionId}`
                    });
                    
                    await ctx.reply(
                        '✅ Prova di pagamento inviata al venditore.\n\n' +
                        'Attendi la conferma.',
                        Keyboards.MAIN_MENU
                    );
                } catch (error) {
                    console.error('Error forwarding payment proof:', error);
                    await ctx.reply('❌ Errore nell\'invio. Riprova.');
                }
                
                delete ctx.session.waitingFor;
                return;
            }
            
            // Handle photos in scenes or other contexts
            if (!ctx.scene) {
                await ctx.reply('❌ Non aspettavo una foto in questo momento.');
            }
        });

        // Handle documents
        this.bot.bot.on('document', async (ctx) => {
            if (!ctx.scene) {
                await ctx.reply('❌ Non accetto documenti in questo momento.');
            }
        });

        // Handle locations
        this.bot.bot.on('location', async (ctx) => {
            if (!ctx.scene) {
                await ctx.reply('❌ Non aspettavo una posizione in questo momento.');
            }
        });

        // Handle voice messages
        this.bot.bot.on('voice', async (ctx) => {
            await ctx.reply('❌ I messaggi vocali non sono supportati. Scrivi il testo.');
        });

        // Handle stickers
        this.bot.bot.on('sticker', async (ctx) => {
            await ctx.reply('❌ Gli sticker non sono supportati in questo bot.');
        });

        // Handle video
        this.bot.bot.on('video', async (ctx) => {
            await ctx.reply('❌ I video non sono supportati. Invia foto per documentare le transazioni.');
        });
    }

    // Helper method for payment confirmation processing
    async processPaymentConfirmation(ctx, transactionId) {
        const transaction = await this.bot.transactionService.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.reply('❌ Transazione non trovata con ID: ' + transactionId);
            return;
        }
        
        if (transaction.buyerId !== ctx.from.id) {
            await ctx.reply('❌ Non sei autorizzato per questa transazione.');
            return;
        }
        
        const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);
        const amount = announcement && transaction.declaredKwh ? 
            (transaction.declaredKwh * announcement.price).toFixed(2) : 'N/A';
        
        try {
            await ctx.telegram.sendMessage(
                transaction.sellerId,
                `💳 **DICHIARAZIONE PAGAMENTO**\n\n` +
                `L'acquirente @${ctx.from.username || ctx.from.first_name} dichiara di aver pagato.\n\n` +
                `💰 Importo dichiarato: €${amount}\n` +
                `⚡ KWH forniti: ${transaction.declaredKwh || 'N/A'}\n` +
                `🔍 ID Transazione: \`${transactionId}\`\n\n` +
                `Hai ricevuto il pagamento?`,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getSellerPaymentConfirmKeyboard()
                }
            );
            
        } catch (error) {
            console.error('Error notifying seller:', error);
        }

        await ctx.reply(
            `✅ **DICHIARAZIONE PAGAMENTO INVIATA!**\n\n` +
            `🆔 Transazione: \`${transactionId}\`\n` +
            `💰 Importo: €${amount}\n\n` +
            `Il venditore riceverà una notifica e dovrà confermare la ricezione del pagamento.\n\n` +
            `Riceverai aggiornamenti sullo stato della transazione.`,
            { 
                parse_mode: 'Markdown'
            }
        );
    }
}

module.exports = MessageHandler;
