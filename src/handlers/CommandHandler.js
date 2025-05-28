const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

class CommandHandler {
    constructor(bot) {
        this.bot = bot;
    }

    setupCommands() {
        // Start command con gestione deep link per contatto venditore
        this.bot.bot.start(async (ctx) => {
            const userId = ctx.from.id;
            
            // Registra/aggiorna utente
            await this.bot.userService.upsertUser({
                userId: ctx.from.id,
                username: ctx.from.username,
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name
            });
            
            // Controlla se c'è un parametro di deep link
            const startPayload = ctx.message.text.split(' ')[1];
            
            if (startPayload && startPayload.startsWith('contact_')) {
                // Estrai l'ID dell'annuncio
                const announcementId = startPayload.replace('contact_', '');
                
                // Recupera l'annuncio
                const announcement = await this.bot.announcementService.getAnnouncement(announcementId);
                
                if (!announcement || !announcement.active) {
                    await ctx.reply('❌ Annuncio non trovato o non più disponibile.', Keyboards.MAIN_MENU);
                    return;
                }
                
                // Verifica che non sia il proprio annuncio
                if (announcement.userId === userId) {
                    await ctx.reply('❌ Non puoi acquistare dal tuo stesso annuncio!', Keyboards.MAIN_MENU);
                    return;
                }
                
                // Salva l'annuncio nella sessione e entra nella scene di contatto
                ctx.session.announcementId = announcementId;
                await ctx.scene.enter('contactSellerScene');
                return;
            }
            
            // Comportamento normale se non c'è deep link
            // Pulisci eventuali messaggi precedenti
            await this.bot.chatCleaner.cleanupUserMessages(ctx, ['temporary', 'navigation']);
            
            // Mostra welcome message con tastiera persistente
            await ctx.reply(Messages.WELCOME, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.MAIN_MENU.reply_markup
            });
        });

        // Menu command
        this.bot.bot.command('menu', async (ctx) => {
            await ctx.reply(
                '🏠 **Menu Principale**\n\nSeleziona un\'opzione:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.MAIN_MENU.reply_markup
                }
            );
        });

        // Help command
        this.bot.bot.command('help', async (ctx) => {
            await this.bot.chatCleaner.replaceMessage(ctx, Messages.HELP_TEXT, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getHelpKeyboard().reply_markup,
                messageType: 'help'
            });
        });

        // Admin command
        this.bot.bot.command('admin', async (ctx) => {
            if (ctx.from.id != this.bot.adminUserId) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Non autorizzato.');
                return;
            }
            
            await this.bot.chatCleaner.replaceMessage(ctx,
                '👨‍⚖️ **DASHBOARD ADMIN**\n\nSeleziona un\'opzione:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getAdminDashboardKeyboard().reply_markup,
                    messageType: 'admin'
                }
            );
        });

        // Stats command
        this.bot.bot.command('stats', async (ctx) => {
            if (ctx.from.id != this.bot.adminUserId) return;
            
            const stats = await this.bot.transactionService.getTransactionStats();
            const announcementStats = await this.bot.announcementService.getAnnouncementStats();
            
            let statsText = '📊 **STATISTICHE GENERALI**\n\n';
            
            if (stats && stats.overall) {
                statsText += `🔄 **Transazioni:**\n`;
                statsText += `• Totali: ${stats.overall.totalTransactions || 0}\n`;
                statsText += `• Completate: ${stats.overall.completedTransactions || 0}\n`;
                statsText += `• KWH totali: ${stats.overall.totalKwh || 0}\n\n`;
            }
            
            if (announcementStats) {
                statsText += `📋 **Annunci:**\n`;
                statsText += `• Attivi: ${announcementStats.totalActive || 0}\n`;
                statsText += `• Prezzo medio: €${(announcementStats.avgPrice || 0).toFixed(2)}/KWH\n`;
            }
            
            await this.bot.chatCleaner.replaceMessage(ctx, statsText, { 
                parse_mode: 'Markdown',
                messageType: 'admin'
            });
        });

        // Menu button handlers
        this.bot.bot.hears('🔋 Vendi KWH', async (ctx) => {
            // IMPORTANTE: entra nella scene con il nome corretto
            await ctx.scene.enter('sellAnnouncementScene');
        });

        this.bot.bot.hears('🛒 Compra KWH', async (ctx) => {
            await ctx.reply(
                '🛒 **COMPRA ENERGIA**\n\n' +
                'Per comprare energia:\n' +
                '1. Vai nel gruppo principale\n' +
                '2. Cerca gli annunci nel topic dedicato\n' +
                '3. Clicca su "Contatta venditore"\n\n' +
                '💡 **Suggerimento:** Gli annunci mostrano la posizione copiabile tra \`backtick\` per facilitare la ricerca!\n\n' +
                'Oppure clicca qui sotto per vedere le offerte disponibili:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🛒 Vedi offerte disponibili', callback_data: 'buy_energy' }],
                            [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );
        });

        this.bot.bot.hears('📊 I miei annunci', async (ctx) => {
            const userId = ctx.from.id;
            const announcements = await this.bot.announcementService.getUserAnnouncements(userId);
            
            if (announcements.length === 0) {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    '📭 Non hai ancora pubblicato annunci.',
                    {},
                    3000
                );
                
                setTimeout(async () => {
                    await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
                }, 3000);
                return;
            }

            let message = '📊 **I TUOI ANNUNCI ATTIVI:**\n\n';
            for (const ann of announcements) {
                message += `🆔 \`${ann.announcementId}\`\n`;
                message += `📍 Posizione: \`${ann.location}\`\n`;
                message += `💰 Prezzo: `;
                
                if (ann.pricingType === 'fixed') {
                    message += `${ann.basePrice || ann.price}€/KWH`;
                } else {
                    message += `da ${ann.pricingTiers[0].price}€/KWH`;
                }
                
                message += `\n📅 Pubblicato: ${ann.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            await this.bot.chatCleaner.replaceMessage(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getUserAnnouncementsKeyboard(announcements).reply_markup,
                messageType: 'navigation'
            });
        });

        this.bot.bot.hears('💼 Le mie transazioni', async (ctx) => {
            const userId = ctx.from.id;
            const transactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
            
            if (transactions.length === 0) {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    '📭 Non hai ancora transazioni.',
                    {},
                    3000
                );
                
                setTimeout(async () => {
                    await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
                }, 3000);
                return;
            }

            const pending = transactions.filter(t => !['completed', 'cancelled'].includes(t.status));
            const completed = transactions.filter(t => t.status === 'completed');

            let message = '💼 **LE TUE TRANSAZIONI**\n\n';
            
            if (pending.length > 0) {
                message += `⏳ **IN CORSO (${pending.length}):**\n`;
                for (const tx of pending.slice(0, 5)) {
                    const statusEmoji = this.bot.getStatusEmoji(tx.status);
                    const statusText = this.bot.getStatusText(tx.status).replace(/_/g, '\\_');
                    // Escape underscore nell'ID
                    const displayId = tx.transactionId.slice(-10).replace(/_/g, '\\_');
                    message += `${statusEmoji} \`${displayId}\`\n`;
                    message += `📊 ${statusText}\n`;
                    message += `📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n\n`;
                }
            }
            
            message += `✅ **Completate:** ${completed.length}\n`;
            
            await this.bot.chatCleaner.replaceMessage(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getTransactionsKeyboard(pending, completed).reply_markup,
                messageType: 'navigation'
            });
        });

        this.bot.bot.hears('📥 Richieste pendenti', async (ctx) => {
            const userId = ctx.from.id;
            const pendingTransactions = await this.bot.transactionService.getUserTransactions(userId, 'seller');
            const pendingRequests = pendingTransactions.filter(t => t.status === 'pending_seller_confirmation');
            
            if (pendingRequests.length === 0) {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    '📭 Non hai richieste di acquisto in attesa.',
                    {},
                    3000
                );
                
                setTimeout(async () => {
                    await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
                }, 3000);
                return;
            }

            await this.bot.chatCleaner.cleanupUserMessages(ctx, ['temporary', 'navigation']);

            for (const transaction of pendingRequests) {
                const buyer = await this.bot.userService.getUser(transaction.buyerId);
                const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);
                
                let requestText = `📥 **NUOVA RICHIESTA DI ACQUISTO**\n\n`;
                requestText += `👤 Acquirente: @${buyer?.username || buyer?.firstName || 'utente'}\n`;
                requestText += `📅 Data/ora: ${transaction.scheduledDate}\n`;
                requestText += `🏢 Brand: ${transaction.brand}\n`;
                requestText += `📍 Posizione: \`${transaction.location}\`\n`;
                requestText += `🔌 Connettore: ${transaction.connector}\n\n`;
                requestText += `🆔 ID Transazione: \`${transaction.transactionId}\``;
                
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '✅ Accetto', callback_data: `accept_request_${transaction.transactionId}` },
                            { text: '❌ Rifiuto', callback_data: `reject_request_${transaction.transactionId}` }
                        ]
                    ]
                };
                
                await this.bot.chatCleaner.sendPersistentMessage(ctx, requestText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        });

        this.bot.bot.hears('⭐ I miei feedback', async (ctx) => {
            const userId = ctx.from.id;
            const userStats = await this.bot.userService.getUserStats(userId);
            
            let message = '⭐ **I TUOI FEEDBACK**\n\n';
            
            if (userStats.totalFeedback > 0) {
                message += `📊 **Statistiche:**\n`;
                message += `• Valutazione media: ${userStats.avgRating.toFixed(1)}/5\n`;
                message += `• Totale recensioni: ${userStats.totalFeedback}\n`;
                message += `• Feedback positivi: ${userStats.positivePercentage}%\n\n`;
                
                if (userStats.sellerBadge) {
                    message += `🏆 **Badge:** ${userStats.sellerBadge === 'TOP' ? '🌟 VENDITORE TOP' : '✅ VENDITORE AFFIDABILE'}\n`;
                }
            } else {
                message += 'Non hai ancora ricevuto feedback.\n\nCompleta le tue prime transazioni per ricevere valutazioni!';
            }
            
            await this.bot.chatCleaner.replaceMessage(ctx, message, {
                parse_mode: 'Markdown',
                messageType: 'stats'
            });
        });

        this.bot.bot.hears('❓ Aiuto', async (ctx) => {
            await this.bot.chatCleaner.replaceMessage(ctx, Messages.HELP_TEXT, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getHelpKeyboard().reply_markup,
                messageType: 'help'
            });
        });

        // Quick access to transaction from message
        this.bot.bot.hears(/[TA][\d\w_-]+/, async (ctx) => {
            const transactionId = ctx.message.text.match(/([TA][\d\w_-]+)/)[1];
            const userId = ctx.from.id;
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
                return;
            }
            
            if (transaction.sellerId !== userId && transaction.buyerId !== userId) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Non autorizzato.');
                return;
            }
            
            ctx.session.transactionId = transactionId;
            await this.bot.chatCleaner.enterScene(ctx, 'transactionScene');
        });

        // Command per pagamenti
        this.bot.bot.command('pagamenti', async (ctx) => {
            const userId = ctx.from.id;
            
            const transactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
            const paymentPending = transactions.filter(t => 
                t.status === 'payment_requested' && t.buyerId === userId
            );
            
            if (paymentPending.length === 0) {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    '✅ Non hai pagamenti in sospeso.',
                    {},
                    3000
                );
                
                setTimeout(async () => {
                    await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
                }, 3000);
                return;
            }
            
            const announcements = await Promise.all(
                paymentPending.map(tx => 
                    this.bot.announcementService.getAnnouncement(tx.announcementId)
                )
            );
            
            let message = '💳 **PAGAMENTI IN SOSPESO**\n\n';
            
            paymentPending.forEach((tx, index) => {
                const announcement = announcements[index];
                const amount = announcement && tx.declaredKwh ? 
                    (tx.declaredKwh * (announcement.price || announcement.basePrice)).toFixed(2) : 'N/A';
                
                message += `💰 €${amount} (${tx.declaredKwh || 'N/A'} KWH × ${announcement?.price || announcement?.basePrice || '?'}€)\n`;
                message += `🆔 \`${tx.transactionId}\`\n`;
                message += `📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n`;
                message += `💳 Metodi: ${announcement?.paymentMethods || 'Come concordato'}\n\n`;
            });
            
            if (paymentPending.length === 1) {
                const tx = paymentPending[0];
                const announcement = announcements[0];
                const amount = announcement && tx.declaredKwh ? 
                    (tx.declaredKwh * (announcement.price || announcement.basePrice)).toFixed(2) : 'N/A';
                
                message += `\n💳 **PROCEDI CON IL PAGAMENTO:**\n`;
                message += `Effettua il pagamento di €${amount} secondo i metodi concordati, poi conferma.`;
                
                ctx.session.currentTransactionId = tx.transactionId;
                
                await this.bot.chatCleaner.replaceMessage(ctx, message, {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getPaymentConfirmationKeyboard().reply_markup,
                    messageType: 'payment'
                });
            } else {
                const keyboardButtons = paymentPending.map((tx, index) => {
                    const announcement = announcements[index];
                    const amount = announcement && tx.declaredKwh ? 
                        (tx.declaredKwh * (announcement.price || announcement.basePrice)).toFixed(2) : 'N/A';
                    
                    return [{
                        text: `💳 ${tx.transactionId.slice(-10)} - €${amount}`,
                        callback_data: `select_payment_${tx.transactionId}`
                    }];
                });
                
                message += 'Seleziona una transazione per gestire il pagamento:';
                
                await this.bot.chatCleaner.replaceMessage(ctx, message, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboardButtons
                    },
                    messageType: 'payment'
                });
            }
        });
    }
}

module.exports = CommandHandler;
