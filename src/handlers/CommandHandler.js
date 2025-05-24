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
                return ctx.scene.enter('contactSellerScene');
            }
            
            await ctx.reply(Messages.WELCOME, {
                parse_mode: 'Markdown',
                ...Keyboards.MAIN_MENU
            });
        });

        // Help command
        this.bot.bot.command('help', async (ctx) => {
            await ctx.reply(Messages.HELP_TEXT, {
                parse_mode: 'Markdown'
            });
        });

        // Admin commands
        this.bot.bot.command('admin', async (ctx) => {
            if (ctx.from.id != this.bot.adminUserId) {
                await ctx.reply('❌ Non autorizzato.');
                return;
            }
            
            await ctx.reply(
                '👨‍⚖️ **DASHBOARD ADMIN**\n\nSeleziona un\'opzione:',
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getAdminDashboardKeyboard()
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
            
            await ctx.reply(statsText, { parse_mode: 'Markdown' });
        });

        // Quick transaction access by ID
        this.bot.bot.command(/tx (.+)/, async (ctx) => {
            const transactionId = ctx.match[1].trim();
            const userId = ctx.from.id;
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.reply('❌ Transazione non trovata.', Keyboards.MAIN_MENU);
                return;
            }
            
            // Check if user is involved in this transaction
            if (transaction.sellerId !== userId && transaction.buyerId !== userId) {
                await ctx.reply('❌ Non sei autorizzato a visualizzare questa transazione.', Keyboards.MAIN_MENU);
                return;
            }
            
            // Enter transaction scene with this specific transaction
            ctx.session.transactionId = transactionId;
            await ctx.scene.enter('transactionScene');
        });

        // Quick payments access
        this.bot.bot.command('pagamenti', async (ctx) => {
            const userId = ctx.from.id;
            
            // Get transactions needing payment
            const transactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
            const paymentPending = transactions.filter(t => 
                t.status === 'payment_requested' && t.buyerId === userId
            );
            
            if (paymentPending.length === 0) {
                await ctx.reply('✅ Non hai pagamenti in sospeso.', Keyboards.MAIN_MENU);
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
            
            message += 'Seleziona una transazione per gestire il pagamento:';
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getPaymentTransactionsKeyboard(paymentPending)
            });
        });

        // Menu button handlers
        this.bot.bot.hears('🔋 Vendi KWH', async (ctx) => {
            await ctx.scene.enter('sellAnnouncementScene');
        });

        this.bot.bot.hears('📊 I miei annunci', async (ctx) => {
            const userId = ctx.from.id;
            const announcements = await this.bot.announcementService.getUserAnnouncements(userId);
            
            if (announcements.length === 0) {
                await ctx.reply('📭 Non hai ancora pubblicato annunci.', Keyboards.MAIN_MENU);
                return;
            }

            let message = '📊 <b>I TUOI ANNUNCI ATTIVI:</b>\n\n';
            for (const ann of announcements) {
                message += `🆔 ${ann.announcementId}\n`;
                message += `💰 ${ann.price}€/KWH\n`;
                message += `📅 Pubblicato: ${ann.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            await ctx.reply(message, {
                parse_mode: 'HTML',
                ...Keyboards.getUserAnnouncementsKeyboard(announcements)
            });
        });

        this.bot.bot.hears('💼 Le mie transazioni', async (ctx) => {
            const userId = ctx.from.id;
            
            // Get all user transactions
            const allTransactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
            
            if (allTransactions.length === 0) {
                await ctx.reply('📭 Non hai ancora transazioni.', Keyboards.MAIN_MENU);
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
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getTransactionsKeyboard(pending, completed)
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
                await ctx.reply('📭 Non hai richieste di acquisto in attesa.', Keyboards.MAIN_MENU);
                return;
            }

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
                    
                    await ctx.reply(requestText, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                    
                    // Add small delay between messages to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                } catch (error) {
                    console.error(`Error processing transaction ${transaction.transactionId}:`, error);
                }
            }
            
            await ctx.reply(
                `📥 Hai ${pendingRequests.length} richieste in attesa.\n\n` +
                `Gestiscile una alla volta usando i pulsanti sopra.`,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.MAIN_MENU
                }
            );
        });

        this.bot.bot.hears('⭐ I miei feedback', async (ctx) => {
            const userId = ctx.from.id;
            const userStats = await this.bot.userService.getUserStats(userId);
            
            if (!userStats) {
                await ctx.reply('❌ Errore nel recupero delle statistiche.', Keyboards.MAIN_MENU);
                return;
            }
            
            const statsText = Messages.formatUserStats(userStats);
            await ctx.reply(statsText, {
                parse_mode: 'Markdown',
                ...Keyboards.MAIN_MENU
            });
        });

        this.bot.bot.hears('❓ Aiuto', async (ctx) => {
            await ctx.reply(Messages.HELP_TEXT, {
                parse_mode: 'Markdown',
                ...Keyboards.getHelpKeyboard()
            });
        });

        // Quick access to transaction from message
        this.bot.bot.hears(/T[_A]\d+-\d+/, async (ctx) => {
            const transactionId = ctx.message.text.match(/(T[_A]\d+-\d+)/)[1];
            const userId = ctx.from.id;
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.reply('❌ Transazione non trovata.');
                return;
            }
            
            if (transaction.sellerId !== userId && transaction.buyerId !== userId) {
                await ctx.reply('❌ Non autorizzato.');
                return;
            }
            
            ctx.session.transactionId = transactionId;
            await ctx.scene.enter('transactionScene');
        });
    }
}

module.exports = CommandHandler;
