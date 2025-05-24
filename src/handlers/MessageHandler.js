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
            
            // FIX: Rimosso il sistema di inserimento manuale ID transazione
            // Non è più necessario perché ora l'ID viene rilevato automaticamente
            
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
                const shortId = ctx.session.disputeTransactionId;
                
                // Trova la transazione usando il short ID
                const transaction = await this.bot.findTransactionByShortId(shortId, ctx.from.id);
                if (!transaction) {
                    await ctx.reply('❌ Transazione non trovata.');
                    return;
                }
                
                await this.bot.transactionService.addTransactionIssue(
                    transaction.transactionId,
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
                        await ctx.reply('❌ Non riesco a identificare la transazione. Riprova dal menu pagamenti.');
                        delete ctx.session.waitingFor;
                        return;
                    }
                }
                
                const transaction = await this.bot.transactionService.getTransaction(transactionId);
                if (!transaction) {
                    await ctx.reply('❌ Transazione non trovata.');
                    delete ctx.session.waitingFor;
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

        // FIX: Aggiunti callback per gestione pagamenti specifici
        this.bot.bot.action(/^select_payment_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            if (transaction.buyerId !== ctx.from.id) {
                await ctx.editMessageText('❌ Non sei autorizzato per questa transazione.');
                return;
            }
            
            const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);
            const amount = announcement && transaction.declaredKwh ? 
                (transaction.declaredKwh * announcement.price).toFixed(2) : 'N/A';
            
            // Salva l'ID nella sessione
            ctx.session.currentTransactionId = transactionId;
            
            await ctx.editMessageText(
                `💳 **PROCEDI CON IL PAGAMENTO**\n\n` +
                `🆔 Transazione: \`${transactionId}\`\n` +
                `⚡ KWH confermati: ${transaction.declaredKwh || 'N/A'}\n` +
                `💰 Importo: €${amount}\n` +
                `💳 Metodi accettati: ${announcement?.paymentMethods || 'Come concordato'}\n\n` +
                `Effettua il pagamento secondo i metodi concordati, poi conferma.`,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getPaymentConfirmationKeyboard()
                }
            );
        });

        // FIX: Nuovo callback per gestire lo stato "sto ancora pagando"
        this.bot.bot.action('payment_in_progress', async (ctx) => {
            await ctx.answerCbQuery();
            
            await ctx.editMessageText(
                '⏰ **PAGAMENTO IN CORSO**\n\n' +
                'Hai indicato che stai ancora effettuando il pagamento.\n\n' +
                'Una volta completato, torna qui e premi "Ho effettuato il pagamento".',
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
        });
    }
}

module.exports = MessageHandler;
