const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

class CommandHandler {
    constructor(bot) {
        this.bot = bot;
    }

    setupCommands() {
        // Start command
        this.bot.bot.start(async (ctx) => {
            const userId = ctx.from.id;
            
            // Handle deep links for contacting sellers
            if (ctx.message.text.includes('contact_')) {
                const announcementId = ctx.message.text.split('contact_')[1];
                ctx.session.announcementId = announcementId;
                return await this.bot.chatCleaner.enterScene(ctx, 'contactSellerScene');
            }
            
            // Pulisci la chat e mostra il menu
            await this.bot.chatCleaner.resetUserChat(ctx);
        });

        // Help command
        this.bot.bot.command('help', async (ctx) => {
            await this.bot.chatCleaner.replaceMessage(ctx, Messages.HELP_TEXT, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getHelpKeyboard().reply_markup,
                messageType: 'help'
            });
        });

        // Admin commands
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

        this.bot.bot.command('stats', async (ctx) => {
            if (ctx.from.id != this.bot.adminUserId) return;
            
            const transactionStats = await this.bot.transactionService.getTransactionStats();
            const announcementStats = await this.bot.announcementService.getAnnouncementStats();
            
            let statsText = '📊 **STATISTICHE GENERALI**\n\n';
            
            if (transactionStats) {
                statsText += `🔄 **Transazioni:**\n`;
                statsText += `• Totali: ${transactionStats.overall.totalTransactions || 0}\n`;
                statsText += `• Completate: ${transactionStats.overall.completedTransactions || 0}\n`;
                statsText += `• KWH totali: ${transactionStats.overall.totalKwh || 0}\n\n`;
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

        // Quick transaction access by ID
        this.bot.bot.command(/tx (.+)/, async (ctx) => {
            const transactionId = ctx.match[1].trim();
            const userId = ctx.from.id;
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
                return;
            }
            
            // Check if user is involved in this transaction
            if (transaction.sellerId !== userId && transaction.buyerId !== userId) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Non sei autorizzato a visualizzare questa transazione.');
                return;
            }
            
            // Enter transaction scene with this specific transaction
            ctx.session.transactionId = transactionId;
            await this.bot.chatCleaner.enterScene(ctx, 'transactionScene');
        });

        // FIX: Comando pagamenti migliorato con pulizia
        this.bot.bot.command('pagamenti', async (ctx) => {
            const userId = ctx.from.id;
            
            // Get transactions needing payment
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
                
                // Torna al menu dopo 3 secondi
                setTimeout(async () => {
                    await this.bot.chatCleaner.resetUserChat(ctx);
                }, 3000);
                return;
            }
            
            let message = '💳 **PAGAMENTI IN SOSPESO**\n\n';
            
            for (const [index, tx] of paymentPending.entries()) {
                const announcement = await this.bot.announcementService.getAnnouncement(tx.announcementId);
                const amount = announcement && tx.declaredKwh ? 
                    (tx.declaredKwh * announcement.price).toFixed(2) : 'N/A';
                
                message += `💰 €${amount} (${tx.declaredKwh || 'N/A'} KWH × ${announcement?.price || '?'}€)\n`;
                message += `🆔 \`${tx.transactionId}\`\n`;
                message += `📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n`;
                message += `💳 Metodi: ${announcement?.paymentMethods || 'Come concordato'}\n\n`;
            }
            
            // FIX: Se c'è solo un pagamento, vai direttamente alla gestione
            if (paymentPending.length === 1) {
                const tx = paymentPending[0];
                const announcement = await this.bot.announcementService.getAnnouncement(tx.announcementId);
                const amount = announcement && tx.declaredKwh ? 
                    (tx.declaredKwh * announcement.price).toFixed(2) : 'N/A';
                
                message += `\n💳 **PROCEDI CON IL PAGAMENTO:**\n`;
                message += `Effettua il pagamento di €${amount} secondo i metodi concordati, poi conferma.`;
                
                // Salva l'ID nella sessione
                ctx.session.currentTransactionId = tx.transactionId;
                
                await this.bot.chatCleaner.replaceMessage(ctx, message, {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getPaymentConfirmationKeyboard().reply_markup,
                    messageType: 'payment'
                });
            } else {
                // Se ci sono più pagamenti, mostra la lista
                message += 'Seleziona una transazione per gestire il pagamento:';
                
                await this.bot.chatCleaner.replaceMessage(ctx, message, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: paymentPending.map((tx, index) => {
                            const announcement = await this.bot.announcementService.getAnnouncement(tx.announcementId);
                            const amount = announcement && tx.declaredKwh ? 
                                (tx.declaredKwh * announcement.price).toFixed(2) : 'N/A';
                            return [{
                                text: `💳 ${tx.transactionId.slice(-10)} - €${amount}`,
                                callback_data: `select_payment_${tx.transactionId}`
                            }];
                        })
                    },
                    messageType: 'payment'
                });
            }
        });

        // Menu button handlers con pulizia
        this.bot.bot.hears('🔋 Vendi KWH', async (ctx) => {
            await this.bot.chatCleaner.enterScene(ctx, 'sellAnnouncementScene');
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
                    await this.bot.chatCleaner.resetUserChat(ctx);
                }, 3000);
                return;
            }

            let message = '📊 **I TUOI ANNUNCI ATTIVI:**\n\n';
            for (const ann of announcements) {
                message += `🆔 ${ann.announcementId}\n`;
                message += `💰 ${ann.price}€/KWH\n`;
                message += `📅 Pubblicato: ${ann.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            await this.bot.chatCleaner.replaceMessage(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getUserAnnouncementsKeyboard(announcements).reply_markup,
                messageType: 'navigation'
            });
        });

        this.bot.bot.hears('💼 Le mie transazioni', async (ctx) => {
            const userId = ctx.from.id;
            
            // Get all user transactions
            const allTransactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
            
            if (allTransactions.length === 0) {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    '📭 Non hai ancora transazioni.',
                    {},
                    3000
                );
                
                setTimeout(async () => {
                    await this.bot.chatCleaner.resetUserChat(ctx);
                }, 3000);
                return;
            }

            // Separate by status
            const pending = allTransactions.filter(t => !['completed', 'cancelled'].includes(t.status));
            const completed = allTransactions.filter(t => t.status === 'completed');
            const cancelled = allTransactions.filter(t => t.status === 'cancelled');

            let message = '💼 **LE TUE TRANSAZIONI**\n\n';
            
            if (pending.length > 0) {
                message += `⏳ **IN CORSO (${pending.length}):**\n`;
                for (const tx of pending.slice(0, 5)) {
                    const statusEmoji = this.bot.getStatusEmoji(tx.status);
                    const statusText = this.bot.getStatusText(tx.status);
                    const displayId = tx.transactionId.length > 15 ? 
                        tx.transactionId.substring(2, 12) + '...' : 
                        tx.transactionId;
                    message += `${statusEmoji} ${displayId}\n`;
                    message += `📊 ${statusText}\n`;
                    message += `📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n\n`;
                }
                if (pending.length > 5) {
                    message += `... e altre ${pending.length - 5} transazioni\n\n`;
                }
            }
            
            message += `✅ **Completate:** ${completed.length}\n`;
            message += `❌ **Annullate:** ${cancelled.length}\n\n`;
            message += `Seleziona una transazione per gestirla:`;
            
            await this.bot.chatCleaner.replaceMessage(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getTransactionsKeyboard(pending, completed).reply_markup,
                messageType: 'navigation'
            });
        });

        this.bot.bot.hears('📥 Richieste pendenti', async (ctx) => {
            // Make sure we're not in any scene
            if (ctx.scene) {
                await ctx.scene.leave();
            }
            
            const userId = ctx.from.id;
            
            // Get pending transactions where user is seller
            const pendingTransactions = await this.bot.transactionService.getUserTransactions(userId, 'seller');
            const pendingRequests = pendingTransactions.filter(t => t.status === 'pending_seller_confirmation');
            
            if (pendingRequests.length === 0) {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    '📭 Non hai richieste di acquisto in attesa.',
                    {},
                    3000
                );
                
                setTimeout(async () => {
                    await this.bot.chatCleaner.resetUserChat(ctx);
                }, 3000);
                return;
            }

            // Pulisci messaggi precedenti prima di mostrare le richieste
            await this.bot.chatCleaner.cleanupUserMessages(ctx, ['temporary', 'navigation']);

            // Process each request
            for (const transaction of pendingRequests) {
                try {
                    // Get buyer info
                    const buyer = await this.bot.userService.getUser(transaction.buyerId);
                    const buyerUsername = buyer?.username || 'utente';
                    
                    // Get announcement info
                    const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);
                    
                    if (!announcement) {
                        console.error(`Announcement not found for transaction ${transaction.transactionId}`);
                        continue;
                    }
                    
                    const requestText = Messages.formatPurchaseRequest(
                        {
                            ...transaction,
                            buyerUsername
                        },
                        announcement
                    ) + `\n\n🔍 ID Transazione: \`${transaction.transactionId}\``;
                    
                    // Create inline keyboard with transaction ID embedded
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '✅ Accetto la richiesta', callback_data: `accept_request_${transaction.transactionId}` },
                                { text: '❌ Rifiuto', callback_data: `reject_request_${transaction.transactionId}` }
                            ],
                            [
                                { text: '💬 Contatta acquirente', callback_data: `contact_buyer_${transaction.buyerId}_${buyer.username || 'user'}` }
                            ]
                        ]
                    };
                    
                    // Invia come messaggio persistente
                    await this.bot.chatCleaner.sendPersistentMessage(ctx, requestText, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                    
                    // Add small delay between messages to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                } catch (error) {
                    console.error(`Error processing transaction ${transaction.transactionId}:`, error);
                }
            }
            
            await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                `📥 Hai ${pendingRequests.length} richieste in attesa.\n\n` +
                `Gestiscile una alla volta usando i pulsanti sopra.`,
                {},
                10000 // Auto-elimina dopo 10 secondi
            );
        });

        this.bot.bot.hears('⭐ I miei feedback', async (ctx) => {
            const userId = ctx.from.id;
            const userStats = await this.bot.userService.getUserStats(userId);
            
            if (!userStats) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Errore nel recupero delle statistiche.');
                return;
            }
            
            const statsText = Messages.formatUserStats(userStats);
            await this.bot.chatCleaner.replaceMessage(ctx, statsText, {
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
        this.bot.bot.hears(/T[_A]\d+-\d+/, async (ctx) => {
            const transactionId = ctx.message.text.match(/(T[_A]\d+-\d+)/)[1];
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
    }
}

module.exports = CommandHandler;