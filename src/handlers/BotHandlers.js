const { Markup } = require('telegraf');
const AnnouncementService = require('../services/AnnouncementService');
const TransactionService = require('../services/TransactionService');
const UserService = require('../services/UserService');
const Messages = require('../utils/Messages');
const logger = require('../utils/logger');

class BotHandlers {
    constructor(bot) {
        this.bot = bot;
    }

    setupHandlers() {
        // Command handlers
        this.bot.command('start', this.handleStart.bind(this));
        this.bot.command('help', this.handleHelp.bind(this));
        this.bot.command('profile', this.handleProfile.bind(this));
        this.bot.command('stats', this.handleStats.bind(this));

        // Callback query handlers
        this.bot.action('sell_energy', this.handleSellEnergy.bind(this));
        this.bot.action('buy_energy', this.handleBuyEnergy.bind(this));
        this.bot.action('my_transactions', this.handleMyTransactions.bind(this));
        this.bot.action('my_announcements', this.handleMyAnnouncements.bind(this));
        
        // Callback per acquisto specifico
        this.bot.action(/^buy_announcement_(.+)$/, this.handleBuyAnnouncement.bind(this));
        this.bot.action(/^confirm_buy_(.+)_(.+)$/, this.handleConfirmBuy.bind(this));
        
        // Callback per gestione transazioni
        this.bot.action(/^confirm_transaction_(.+)$/, this.handleConfirmTransaction.bind(this));
        this.bot.action(/^reject_transaction_(.+)$/, this.handleRejectTransaction.bind(this));
        this.bot.action(/^complete_transaction_(.+)$/, this.handleCompleteTransaction.bind(this));
        this.bot.action(/^cancel_transaction_(.+)$/, this.handleCancelTransaction.bind(this));
        
        // Callback per recensioni
        this.bot.action(/^rate_(\d)_(.+)$/, this.handleRating.bind(this));
        
        // Navigation callbacks
        this.bot.action('back_to_main', this.handleBackToMain.bind(this));
        this.bot.action('back_to_announcements', this.handleBackToAnnouncements.bind(this));
        
        // Text message handlers (per quantità KWH)
        this.bot.on('text', this.handleTextMessage.bind(this));
    }

    async handleStart(ctx) {
        try {
            // Registra o aggiorna l'utente
            await UserService.createUser({
                userId: ctx.from.id,
                username: ctx.from.username,
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name
            });

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔋 Vendi Energia', 'sell_energy')],
                [Markup.button.callback('🛒 Compra Energia', 'buy_energy')],
                [Markup.button.callback('💼 Le Mie Transazioni', 'my_transactions')],
                [Markup.button.callback('📋 I Miei Annunci', 'my_announcements')],
                [Markup.button.callback('👤 Profilo', 'profile')],
                [Markup.button.callback('❓ Aiuto', 'help')]
            ]);

            await ctx.reply(Messages.WELCOME, { 
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            logger.error('Errore in handleStart:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    async handleHelp(ctx) {
        try {
            const helpKeyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📋 Come funziona', 'help_process')],
                [Markup.button.callback('💰 Prezzi e tariffe', 'help_pricing')],
                [Markup.button.callback('🛡️ Sicurezza', 'help_safety')],
                [Markup.button.callback('🏠 Menu Principale', 'back_to_main')]
            ]);

            await ctx.reply(Messages.INFO_MESSAGES.PROCESS_HELP, {
                parse_mode: 'Markdown',
                ...helpKeyboard
            });
        } catch (error) {
            logger.error('Errore in handleHelp:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    async handleProfile(ctx) {
        try {
            const userStats = await TransactionService.getUserStats(ctx.from.id);
            
            let profileMessage = `👤 **IL TUO PROFILO**\n\n`;
            profileMessage += `📱 **Nome:** ${ctx.from.first_name}`;
            if (ctx.from.username) {
                profileMessage += ` (@${ctx.from.username})`;
            }
            profileMessage += `\n\n`;

            // Statistiche acquisti
            profileMessage += `🛒 **COME ACQUIRENTE:**\n`;
            profileMessage += `• Transazioni: ${userStats.buying.totalBought}\n`;
            profileMessage += `• KWH acquistati: ${userStats.buying.totalKwhBought.toFixed(1)}\n`;
            profileMessage += `• Spesa totale: €${userStats.buying.totalSpent.toFixed(2)}\n`;
            if (userStats.buying.totalBought > 0) {
                profileMessage += `• Prezzo medio: €${userStats.buying.avgPricePaid.toFixed(3)}/KWH\n`;
            }

            profileMessage += `\n🔋 **COME VENDITORE:**\n`;
            profileMessage += `• Transazioni: ${userStats.selling.totalSold}\n`;
            profileMessage += `• KWH venduti: ${userStats.selling.totalKwhSold.toFixed(1)}\n`;
            profileMessage += `• Guadagno totale: €${userStats.selling.totalEarned.toFixed(2)}\n`;
            if (userStats.selling.totalSold > 0) {
                profileMessage += `• Prezzo medio: €${userStats.selling.avgPriceReceived.toFixed(3)}/KWH\n`;
            }

            // Rating
            if (userStats.rating.totalRatings > 0) {
                profileMessage += `\n⭐ **VALUTAZIONI RICEVUTE:**\n`;
                profileMessage += `• Rating medio: ${userStats.rating.avgRating.toFixed(1)}/5\n`;
                profileMessage += `• Totale recensioni: ${userStats.rating.totalRatings}\n`;
            } else {
                profileMessage += `\n⭐ **VALUTAZIONI:** Nessuna ancora`;
            }

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📊 Statistiche dettagliate', 'detailed_stats')],
                [Markup.button.callback('🏠 Menu Principale', 'back_to_main')]
            ]);

            await ctx.reply(profileMessage, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            logger.error('Errore in handleProfile:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    async handleSellEnergy(ctx) {
        try {
            await ctx.answerCbQuery();
            await ctx.scene.enter('sell_announcement');
        } catch (error) {
            logger.error('Errore in handleSellEnergy:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    async handleBuyEnergy(ctx) {
        try {
            await ctx.answerCbQuery();
            
            // Mostra annunci disponibili
            const announcements = await AnnouncementService.getActiveAnnouncements(10);
            
            if (announcements.length === 0) {
                await ctx.editMessageText(
                    '📭 **NESSUNA OFFERTA DISPONIBILE**\n\nAl momento non ci sono offerte di energia.\n\nTorna più tardi o crea tu un annuncio di vendita!',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔋 Vendi Energia', callback_data: 'sell_energy' }],
                                [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                            ]
                        }
                    }
                );
                return;
            }

            let message = `🛒 **OFFERTE DISPONIBILI**\n\nScegli un'offerta per vedere i dettagli e acquistare:\n\n`;

            const keyboard = [];
            for (let i = 0; i < Math.min(announcements.length, 8); i++) {
                const ann = announcements[i];
                let buttonText = '';
                
                if (ann.pricingType === 'fixed') {
                    buttonText = `💰 ${ann.basePrice}€/KWH - ${ann.location}`;
                } else {
                    const firstTier = ann.pricingTiers[0];
                    buttonText = `📊 da ${firstTier.price}€/KWH - ${ann.location}`;
                }
                
                // Tronca se troppo lungo
                if (buttonText.length > 60) {
                    buttonText = buttonText.substring(0, 57) + '...';
                }
                
                keyboard.push([{
                    text: buttonText,
                    callback_data: `view_announcement_${ann._id}`
                }]);
            }

            keyboard.push([{ text: '🔄 Aggiorna Lista', callback_data: 'buy_energy' }]);
            keyboard.push([{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]);

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Errore in handleBuyEnergy:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    // Gestisci visualizzazione dettaglio annuncio
    async handleViewAnnouncement(ctx) {
        try {
            const announcementId = ctx.match[1];
            const announcement = await AnnouncementService.getAnnouncementById(announcementId);
            
            if (!announcement || !announcement.isActive) {
                await ctx.editMessageText(Messages.ERROR_MESSAGES.ANNOUNCEMENT_NOT_FOUND, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Torna alle offerte', callback_data: 'buy_energy' }
                        ]]
                    }
                });
                return;
            }

            // Verifica che non sia il proprio annuncio
            if (announcement.userId._id.toString() === ctx.from.id.toString()) {
                await ctx.editMessageText(Messages.ERROR_MESSAGES.CANNOT_BUY_OWN, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📋 I Miei Annunci', callback_data: 'my_announcements' }],
                            [{ text: '🔙 Torna alle offerte', callback_data: 'buy_energy' }]
                        ]
                    }
                });
                return;
            }

            // Ottieni stats del venditore
            const sellerStats = await TransactionService.getUserStats(announcement.userId._id);
            
            // Formatta messaggio dettagliato
            let detailMessage = Messages.formatAnnouncementDisplay(announcement, sellerStats);
            
            // Aggiungi esempi di prezzo
            detailMessage += `\n\n${Messages.formatPriceExamples(announcement)}`;

            const keyboard = [
                [{ text: '🛒 Acquista Energia', callback_data: `buy_announcement_${announcement._id}` }],
                [{ text: '📞 Contatta Venditore', callback_data: `contact_seller_${announcement._id}` }],
                [{ text: '🔙 Torna alle offerte', callback_data: 'buy_energy' }]
            ];

            await ctx.editMessageText(detailMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Errore in handleViewAnnouncement:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    async handleBuyAnnouncement(ctx) {
        try {
            await ctx.answerCbQuery();
            const announcementId = ctx.match[1];
            
            // Salva l'ID dell'annuncio nella sessione
            ctx.session.buyingAnnouncementId = announcementId;
            
            await ctx.editMessageText(
                Messages.BUY_PROCESS_START,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '❌ Annulla', callback_data: 'buy_energy' }]
                        ]
                    }
                }
            );
            
            // Imposta che stiamo aspettando la quantità
            ctx.session.waitingForKwhAmount = true;

        } catch (error) {
            logger.error('Errore in handleBuyAnnouncement:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    async handleTextMessage(ctx) {
        try {
            // Gestisci input quantità KWH
            if (ctx.session.waitingForKwhAmount && ctx.session.buyingAnnouncementId) {
                await this.processKwhAmount(ctx);
                return;
            }

            // Gestisci altri input testuali se necessario
            // (commenti per recensioni, etc.)
            
        } catch (error) {
            logger.error('Errore in handleTextMessage:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    async processKwhAmount(ctx) {
        try {
            const text = ctx.message.text.trim();
            const kwhAmount = parseFloat(text.replace(',', '.'));
            
            if (isNaN(kwhAmount) || kwhAmount <= 0 || kwhAmount > 1000) {
                await ctx.reply(Messages.ERROR_MESSAGES.INVALID_AMOUNT);
                return;
            }

            const announcementId = ctx.session.buyingAnnouncementId;
            const announcement = await AnnouncementService.getAnnouncementById(announcementId);
            
            if (!announcement || !announcement.isActive) {
                await ctx.reply(Messages.ERROR_MESSAGES.ANNOUNCEMENT_NOT_FOUND);
                ctx.session.waitingForKwhAmount = false;
                ctx.session.buyingAnnouncementId = null;
                return;
            }

            // Calcola il prezzo
            const calculation = Messages.calculateExamplePrice(announcement, kwhAmount);
            
            // Salva i dati nella sessione
            ctx.session.buyingKwhAmount = kwhAmount;
            ctx.session.buyingCalculation = calculation;
            ctx.session.waitingForKwhAmount = false;

            // Mostra conferma
            const confirmMessage = Messages.formatBuyConfirmation(announcement, kwhAmount);
            
            const keyboard = [
                [{ text: '✅ Confermo l\'acquisto', callback_data: `confirm_buy_${announcementId}_${kwhAmount}` }],
                [{ text: '✏️ Cambia quantità', callback_data: `buy_announcement_${announcementId}` }],
                [{ text: '❌ Annulla', callback_data: 'buy_energy' }]
            ];

            await ctx.reply(confirmMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Errore in processKwhAmount:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    async handleConfirmBuy(ctx) {
        try {
            await ctx.answerCbQuery();
            const announcementId = ctx.match[1];
            const kwhAmount = parseFloat(ctx.match[2]);
            
            // Crea la transazione
            const transactionData = {
                buyerId: ctx.from.id,
                sellerId: null, // Verrà impostato dal service
                announcementId: announcementId,
                kwhAmount: kwhAmount
            };

            const transaction = await TransactionService.createTransaction(transactionData);
            
            // Pulisci sessione
            delete ctx.session.buyingAnnouncementId;
            delete ctx.session.buyingKwhAmount;
            delete ctx.session.buyingCalculation;

            await ctx.editMessageText(
                `✅ **RICHIESTA INVIATA!**\n\n` +
                `La tua richiesta di acquisto è stata inviata al venditore.\n\n` +
                `🆔 **ID Transazione:** \`${transaction._id.toString().slice(-8)}\`\n` +
                `⚡ **KWH:** ${transaction.kwhAmount}\n` +
                `💰 **Totale:** €${transaction.totalAmount.toFixed(2)}\n\n` +
                `Riceverai una notifica quando il venditore confermerà o rifiuterà la richiesta.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }],
                            [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );

            // Notifica al venditore
            try {
                const announcement = await AnnouncementService.getAnnouncementById(announcementId);
                const notificationMessage = Messages.formatTransactionRequest(transaction, announcement);
                
                await ctx.telegram.sendMessage(
                    announcement.userId._id,
                    notificationMessage,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ Conferma', callback_data: `confirm_transaction_${transaction._id}` },
                                    { text: '❌ Rifiuta', callback_data: `reject_transaction_${transaction._id}` }
                                ],
                                [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }]
                            ]
                        }
                    }
                );
            } catch (notificationError) {
                logger.error('Errore nell\'invio della notifica al venditore:', notificationError);
                // La transazione è comunque creata, solo la notifica fallisce
            }

        } catch (error) {
            logger.error('Errore in handleConfirmBuy:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    // Aggiungi il setup del nuovo handler
    setupAdditionalHandlers() {
        this.bot.action(/^view_announcement_(.+)$/, this.handleViewAnnouncement.bind(this));
    }

    // Gestisci transazioni
    async handleMyTransactions(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const transactions = await TransactionService.getUserTransactions(ctx.from.id);
            
            if (transactions.length === 0) {
                await ctx.editMessageText(
                    '📭 **NESSUNA TRANSAZIONE**\n\nNon hai ancora transazioni.\n\nInizia comprando o vendendo energia!',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🛒 Compra Energia', callback_data: 'buy_energy' }],
                                [{ text: '🔋 Vendi Energia', callback_data: 'sell_energy' }],
                                [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                            ]
                        }
                    }
                );
                return;
            }

            // Raggruppa per stato
            const pending = transactions.filter(t => t.status === 'pending');
            const confirmed = transactions.filter(t => t.status === 'confirmed');
            const completed = transactions.filter(t => t.status === 'completed');
            const cancelled = transactions.filter(t => t.status === 'cancelled');

            let message = `💼 **LE TUE TRANSAZIONI**\n\n`;
            
            if (pending.length > 0) {
                message += `⏳ **IN ATTESA (${pending.length}):**\n`;
                pending.slice(0, 3).forEach(t => {
                    const role = t.buyerId._id.toString() === ctx.from.id.toString() ? 'Acquisto' : 'Vendita';
                    message += `• ${role} - €${t.totalAmount.toFixed(2)} - ${t.kwhAmount} KWH\n`;
                });
                if (pending.length > 3) message += `... e altre ${pending.length - 3}\n`;
                message += '\n';
            }

            if (confirmed.length > 0) {
                message += `✅ **CONFERMATE (${confirmed.length}):**\n`;
                confirmed.slice(0, 3).forEach(t => {
                    const role = t.buyerId._id.toString() === ctx.from.id.toString() ? 'Acquisto' : 'Vendita';
                    message += `• ${role} - €${t.totalAmount.toFixed(2)} - ${t.kwhAmount} KWH\n`;
                });
                if (confirmed.length > 3) message += `... e altre ${confirmed.length - 3}\n`;
                message += '\n';
            }

            if (completed.length > 0) {
                message += `🎉 **COMPLETATE (${completed.length}):**\n`;
                completed.slice(0, 2).forEach(t => {
                    const role = t.buyerId._id.toString() === ctx.from.id.toString() ? 'Acquisto' : 'Vendita';
                    message += `• ${role} - €${t.totalAmount.toFixed(2)} - ${t.kwhAmount} KWH\n`;
                });
                if (completed.length > 2) message += `... e altre ${completed.length - 2}\n`;
            }

            const keyboard = [
                [{ text: '⏳ In Attesa', callback_data: 'transactions_pending' }],
                [{ text: '✅ Confermate', callback_data: 'transactions_confirmed' }],
                [{ text: '🎉 Completate', callback_data: 'transactions_completed' }],
                [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
            ];

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Errore in handleMyTransactions:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    async handleMyAnnouncements(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const announcements = await AnnouncementService.getUserAnnouncements(ctx.from.id);
            const activeAnnouncements = announcements.filter(a => a.isActive);
            
            if (activeAnnouncements.length === 0) {
                await ctx.editMessageText(
                    '📭 **NESSUN ANNUNCIO ATTIVO**\n\nNon hai ancora creato annunci di vendita.\n\nCrea il tuo primo annuncio per iniziare a guadagnare!',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔋 Crea Annuncio', callback_data: 'sell_energy' }],
                                [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                            ]
                        }
                    }
                );
                return;
            }

            let message = `📋 **I TUOI ANNUNCI ATTIVI**\n\n`;
            
            const keyboard = [];
            activeAnnouncements.slice(0, 8).forEach((ann, index) => {
                let pricingText = '';
                if (ann.pricingType === 'fixed') {
                    pricingText = `${ann.basePrice}€/KWH`;
                } else {
                    pricingText = `da ${ann.pricingTiers[0].price}€/KWH`;
                }
                
                message += `${index + 1}. 📍 ${ann.location}\n`;
                message += `   💰 ${pricingText}`;
                if (ann.minimumKwh) {
                    message += ` (min. ${ann.minimumKwh} KWH)`;
                }
                message += `\n   📅 ${ann.createdAt.toLocaleDateString('it-IT')}\n\n`;
                
                let buttonText = `📋 ${ann.location}`;
                if (buttonText.length > 30) {
                    buttonText = buttonText.substring(0, 27) + '...';
                }
                
                keyboard.push([{
                    text: buttonText,
                    callback_data: `view_my_announcement_${ann._id}`
                }]);
            });

            keyboard.push([{ text: '🔋 Nuovo Annuncio', callback_data: 'sell_energy' }]);
            keyboard.push([{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]);

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Errore in handleMyAnnouncements:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    async handleConfirmTransaction(ctx) {
        try {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await TransactionService.confirmTransaction(transactionId, ctx.from.id);
            
            await ctx.editMessageText(
                `✅ **TRANSAZIONE CONFERMATA**\n\n` +
                `Hai confermato la richiesta di acquisto.\n\n` +
                `🆔 **ID:** \`${transaction._id.toString().slice(-8)}\`\n` +
                `⚡ **KWH:** ${transaction.kwhAmount}\n` +
                `💰 **Guadagno:** €${transaction.totalAmount.toFixed(2)}\n\n` +
                `L'acquirente riceverà una notifica. Organizzatevi per la ricarica!`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }],
                            [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );

            // Notifica all'acquirente
            try {
                const buyerMessage = Messages.formatNotification('request_confirmed', transaction);
                await ctx.telegram.sendMessage(
                    transaction.buyerId._id,
                    buyerMessage,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Segna come completata', callback_data: `complete_transaction_${transaction._id}` }],
                                [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }]
                            ]
                        }
                    }
                );
            } catch (notificationError) {
                logger.error('Errore nella notifica all\'acquirente:', notificationError);
            }

        } catch (error) {
            logger.error('Errore in handleConfirmTransaction:', error);
            await ctx.answerCbQuery('❌ Errore nella conferma');
        }
    }

    async handleRejectTransaction(ctx) {
        try {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await TransactionService.cancelTransaction(transactionId, ctx.from.id);
            
            await ctx.editMessageText(
                `❌ **RICHIESTA RIFIUTATA**\n\n` +
                `Hai rifiutato la richiesta di acquisto.\n\n` +
                `🆔 **ID:** \`${transaction._id.toString().slice(-8)}\`\n` +
                `⚡ **KWH:** ${transaction.kwhAmount}\n` +
                `💰 **Importo:** €${transaction.totalAmount.toFixed(2)}\n\n` +
                `L'acquirente riceverà una notifica.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }],
                            [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );

            // Notifica all'acquirente
            try {
                await ctx.telegram.sendMessage(
                    transaction.buyerId._id,
                    `❌ **RICHIESTA RIFIUTATA**\n\n` +
                    `Il venditore ha rifiutato la tua richiesta di acquisto.\n\n` +
                    `🆔 **ID:** \`${transaction._id.toString().slice(-8)}\`\n` +
                    `⚡ **KWH:** ${transaction.kwhAmount}\n` +
                    `💰 **Importo:** €${transaction.totalAmount.toFixed(2)}\n\n` +
                    `Prova con altre offerte disponibili!`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🛒 Cerca altre offerte', callback_data: 'buy_energy' }],
                                [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }]
                            ]
                        }
                    }
                );
            } catch (notificationError) {
                logger.error('Errore nella notifica all\'acquirente:', notificationError);
            }

        } catch (error) {
            logger.error('Errore in handleRejectTransaction:', error);
            await ctx.answerCbQuery('❌ Errore nel rifiuto');
        }
    }

    async handleCompleteTransaction(ctx) {
        try {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await TransactionService.completeTransaction(transactionId, ctx.from.id);
            
            await ctx.editMessageText(
                `🎉 **TRANSAZIONE COMPLETATA!**\n\n` +
                `Hai confermato che la ricarica è stata effettuata con successo.\n\n` +
                `🆔 **ID:** \`${transaction._id.toString().slice(-8)}\`\n` +
                `⚡ **KWH:** ${transaction.kwhAmount}\n` +
                `💰 **Pagato:** €${transaction.totalAmount.toFixed(2)}\n\n` +
                `Ora puoi lasciare una recensione al venditore!`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⭐ Lascia recensione', callback_data: `rate_transaction_${transaction._id}` }],
                            [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }],
                            [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );

            // Notifica al venditore
            try {
                const sellerMessage = Messages.formatNotification('transaction_completed', transaction);
                await ctx.telegram.sendMessage(
                    transaction.sellerId._id,
                    sellerMessage,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⭐ Lascia recensione', callback_data: `rate_transaction_${transaction._id}` }],
                                [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }]
                            ]
                        }
                    }
                );
            } catch (notificationError) {
                logger.error('Errore nella notifica al venditore:', notificationError);
            }

        } catch (error) {
            logger.error('Errore in handleCompleteTransaction:', error);
            await ctx.answerCbQuery('❌ Errore nel completamento');
        }
    }

    async handleCancelTransaction(ctx) {
        try {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await TransactionService.cancelTransaction(transactionId, ctx.from.id);
            
            const userRole = transaction.buyerId._id.toString() === ctx.from.id.toString() ? 'buyer' : 'seller';
            const otherUserId = userRole === 'buyer' ? transaction.sellerId._id : transaction.buyerId._id;
            
            await ctx.editMessageText(
                `❌ **TRANSAZIONE ANNULLATA**\n\n` +
                `La transazione è stata annullata.\n\n` +
                `🆔 **ID:** \`${transaction._id.toString().slice(-8)}\`\n` +
                `⚡ **KWH:** ${transaction.kwhAmount}\n` +
                `💰 **Importo:** €${transaction.totalAmount.toFixed(2)}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }],
                            [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );

            // Notifica all'altra parte
            try {
                await ctx.telegram.sendMessage(
                    otherUserId,
                    `❌ **TRANSAZIONE ANNULLATA**\n\n` +
                    `L'altra parte ha annullato la transazione.\n\n` +
                    `🆔 **ID:** \`${transaction._id.toString().slice(-8)}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }
                            ]]
                        }
                    }
                );
            } catch (notificationError) {
                logger.error('Errore nella notifica di cancellazione:', notificationError);
            }

        } catch (error) {
            logger.error('Errore in handleCancelTransaction:', error);
            await ctx.answerCbQuery('❌ Errore nell\'annullamento');
        }
    }

    async handleRating(ctx) {
        try {
            await ctx.answerCbQuery();
            const rating = parseInt(ctx.match[1]);
            const transactionId = ctx.match[2];
            
            // Implementa il sistema di rating
            // (richiede aggiornamento del TransactionModel e Service per gestire i rating)
            
            await ctx.editMessageText(
                `⭐ **RECENSIONE INVIATA**\n\n` +
                `Grazie per aver lasciato una recensione di ${rating} stelle!\n\n` +
                `Le recensioni aiutano la comunità a scegliere in sicurezza.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }],
                            [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );

        } catch (error) {
            logger.error('Errore in handleRating:', error);
            await ctx.answerCbQuery('❌ Errore nell\'invio della recensione');
        }
    }

    // Navigation handlers
    async handleBackToMain(ctx) {
        try {
            await ctx.answerCbQuery();
            
            // Pulisci sessione
            delete ctx.session.waitingForKwhAmount;
            delete ctx.session.buyingAnnouncementId;
            delete ctx.session.buyingKwhAmount;
            delete ctx.session.buyingCalculation;
            
            await this.handleStart(ctx);
        } catch (error) {
            logger.error('Errore in handleBackToMain:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    async handleBackToAnnouncements(ctx) {
        try {
            await ctx.answerCbQuery();
            await this.handleBuyEnergy(ctx);
        } catch (error) {
            logger.error('Errore in handleBackToAnnouncements:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
        }
    }

    // Handler per i messaggi di aiuto
    async handleHelpCallbacks() {
        this.bot.action('help_process', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(Messages.INFO_MESSAGES.PROCESS_HELP, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Torna all\'aiuto', callback_data: 'help' }],
                        [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                    ]
                }
            });
        });

        this.bot.action('help_pricing', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(Messages.INFO_MESSAGES.PRICING_EXPLANATION, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Torna all\'aiuto', callback_data: 'help' }],
                        [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                    ]
                }
            });
        });

        this.bot.action('help_safety', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(Messages.INFO_MESSAGES.SAFETY_TIPS, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Torna all\'aiuto', callback_data: 'help' }],
                        [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                    ]
                }
            });
        });
    }

    // Inizializza tutti i handler
    init() {
        this.setupHandlers();
        this.setupAdditionalHandlers();
        this.handleHelpCallbacks();
        
        // Handler per rating transazioni
        this.bot.action(/^rate_transaction_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const ratingKeyboard = [
                [
                    { text: '⭐', callback_data: `rate_1_${transactionId}` },
                    { text: '⭐⭐', callback_data: `rate_2_${transactionId}` },
                    { text: '⭐⭐⭐', callback_data: `rate_3_${transactionId}` }
                ],
                [
                    { text: '⭐⭐⭐⭐', callback_data: `rate_4_${transactionId}` },
                    { text: '⭐⭐⭐⭐⭐', callback_data: `rate_5_${transactionId}` }
                ],
                [{ text: '❌ Annulla', callback_data: 'my_transactions' }]
            ];
            
            await ctx.editMessageText(
                Messages.formatFeedbackRequest({ _id: transactionId }, 'buyer'),
                {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: ratingKeyboard }
                }
            );
        });

        logger.info('Bot handlers inizializzati correttamente');
    }
}

module.exports = BotHandlers;
