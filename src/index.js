const { Telegraf, Scenes, session } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
require('dotenv').config();

const Database = require('./database/Database');
const UserService = require('./services/UserService');
const AnnouncementService = require('./services/AnnouncementService');
const TransactionService = require('./services/TransactionService');
const Keyboards = require('./utils/Keyboards');
const Messages = require('./utils/Messages');
const { createSellAnnouncementScene } = require('./scenes/SellAnnouncementScene');
const { createContactSellerScene } = require('./scenes/ContactSellerScene');
const { createTransactionScene } = require('./scenes/TransactionScene');

class KwhBot {
    constructor() {
        this.bot = new Telegraf(process.env.BOT_TOKEN);
        this.app = express();
        this.db = null;
        
        // Services
        this.userService = null;
        this.announcementService = null;
        this.transactionService = null;
        
        // Bot settings
        this.groupId = process.env.GROUP_ID;
        this.topicId = process.env.TOPIC_ID;
        this.adminUserId = process.env.ADMIN_USER_ID;
        
        // Cache per mappare ID corti a ID completi - FIX BUTTON_DATA_INVALID
        this.transactionCache = new Map();
        this.announcementCache = new Map();
        
        this.init();
    }

    // Helper function per escape degli underscore nei transaction ID
    escapeMarkdown(text) {
        return text.replace(/_/g, '\\_');
    }

    // Helper methods per cache ID - FIX BUTTON_DATA_INVALID
    cacheTransactionId(shortId, fullId) {
        this.transactionCache.set(shortId, fullId);
        // Rimuovi entries vecchie per evitare memory leak
        if (this.transactionCache.size > 100) {
            const firstKey = this.transactionCache.keys().next().value;
            this.transactionCache.delete(firstKey);
        }
    }

    getFullTransactionId(shortId) {
        return this.transactionCache.get(shortId);
    }

    cacheAnnouncementId(shortId, fullId) {
        this.announcementCache.set(shortId, fullId);
        if (this.announcementCache.size > 50) {
            const firstKey = this.announcementCache.keys().next().value;
            this.announcementCache.delete(firstKey);
        }
    }

    getFullAnnouncementId(shortId) {
        return this.announcementCache.get(shortId);
    }

    // Helper method per trovare transazione da ID corto
    async findTransactionByShortId(shortId, userId) {
        // Cerca prima nella cache
        let transactionId = this.getFullTransactionId(shortId);
        
        if (transactionId) {
            return await this.transactionService.getTransaction(transactionId);
        }
        
        // Se non in cache, cerca nel database
        const allTransactions = await this.transactionService.getUserTransactions(userId, 'all');
        const transaction = allTransactions.find(t => t.transactionId.endsWith(shortId));
        
        if (transaction) {
            this.cacheTransactionId(shortId, transaction.transactionId);
            return transaction;
        }
        
        return null;
    }

    // Helper method per trovare annuncio da ID corto
    async findAnnouncementByShortId(shortId, userId) {
        let announcementId = this.getFullAnnouncementId(shortId);
        
        if (announcementId) {
            return await this.announcementService.getAnnouncement(announcementId);
        }
        
        const announcements = await this.announcementService.getUserAnnouncements(userId);
        const announcement = announcements.find(a => a.announcementId.endsWith(shortId));
        
        if (announcement) {
            this.cacheAnnouncementId(shortId, announcement.announcementId);
            return announcement;
        }
        
        return null;
    }

    // Helper method per status emoji
    getStatusEmoji(status) {
        const statusEmojis = {
            'pending_seller_confirmation': '⏳',
            'confirmed': '✅',
            'charging_started': '⚡',
            'charging_in_progress': '🔋',
            'charging_completed': '🏁',
            'photo_uploaded': '📷',
            'kwh_declared': '📊',
            'payment_requested': '💳',
            'payment_confirmed': '💰',
            'completed': '✅',
            'cancelled': '❌',
            'disputed': '⚠️'
        };
        return statusEmojis[status] || '❓';
    }

    // Helper method per status text
    getStatusText(status) {
        const statusTexts = {
            'pending_seller_confirmation': 'Attesa conferma',
            'confirmed': 'Confermata',
            'charging_started': 'Ricarica avviata',
            'charging_in_progress': 'In ricarica',
            'charging_completed': 'Ricarica completata',
            'photo_uploaded': 'Foto caricata',
            'kwh_declared': 'KWH dichiarati',
            'payment_requested': 'Pagamento richiesto',
            'payment_confirmed': 'Pagamento confermato',
            'completed': 'Completata',
            'cancelled': 'Annullata',
            'disputed': 'In disputa'
        };
        return statusTexts[status] || status;
    }

    // Helper method per processare conferma pagamento - NUOVO
    async processPaymentConfirmation(ctx, transactionId) {
        const transaction = await this.transactionService.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata con ID: ' + transactionId);
            return;
        }
        
        // Verifica che l'utente sia l'acquirente
        if (transaction.buyerId !== ctx.from.id) {
            await ctx.editMessageText('❌ Non sei autorizzato per questa transazione.');
            return;
        }
        
        // Get announcement for amount calculation
        const announcement = await this.announcementService.getAnnouncement(transaction.announcementId);
        const amount = announcement && transaction.declaredKwh ? 
            (transaction.declaredKwh * announcement.price).toFixed(2) : 'N/A';
        
        // Notify seller to confirm payment
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
            
            console.log('Payment confirmation sent to seller for transaction:', transactionId);
            
        } catch (error) {
            console.error('Error notifying seller:', error);
        }

        // Update message
        await ctx.editMessageText(
            `✅ **DICHIARAZIONE PAGAMENTO INVIATA!**\n\n` +
            `🆔 Transazione: \`${transactionId}\`\n` +
            `💰 Importo: €${amount}\n\n` +
            `Il venditore riceverà una notifica e dovrà confermare la ricezione del pagamento.\n\n` +
            `Riceverai aggiornamenti sullo stato della transazione.`,
            { 
                parse_mode: 'Markdown',
                reply_markup: undefined
            }
        );
    }
    formatTransactionDetails(transaction, announcement, currentUserId) {
        const isSeller = currentUserId === transaction.sellerId;
        const role = isSeller ? 'VENDITORE' : 'ACQUIRENTE';
        
        const statusText = this.getStatusText(transaction.status);
        const statusEmoji = this.getStatusEmoji(transaction.status);
        
        let details = `💼 **DETTAGLI TRANSAZIONE**\n\n`;
        details += `🆔 ID: \`${transaction.transactionId}\`\n`;
        details += `👤 Ruolo: **${role}**\n`;
        details += `${statusEmoji} Stato: **${statusText}**\n\n`;
        
        details += `📅 Data ricarica: ${transaction.scheduledDate}\n`;
        details += `🏢 Brand: ${transaction.brand}\n`;
        details += `📍 Posizione: ${transaction.location}\n`;
        details += `🔌 Connettore: ${transaction.connector}\n\n`;
        
        if (announcement) {
            details += `💰 Prezzo: ${announcement.price}€/KWH\n`;
        }
        
        if (transaction.declaredKwh) {
            details += `⚡ KWH dichiarati: ${transaction.declaredKwh}\n`;
            if (announcement) {
                const amount = (transaction.declaredKwh * announcement.price).toFixed(2);
                details += `💰 Importo totale: €${amount}\n`;
            }
        }
        
        if (transaction.issues && transaction.issues.length > 0) {
            details += `\n⚠️ **Problemi segnalati:** ${transaction.issues.length}\n`;
        }
        
        // Add status-specific instructions
        switch (transaction.status) {
            case 'payment_requested':
                if (!isSeller) {
                    details += `\n💳 **AZIONE RICHIESTA:** Effettua il pagamento\n`;
                    details += `Metodi: ${announcement?.paymentMethods || 'Come concordato'}`;
                } else {
                    details += `\n⏳ In attesa del pagamento dall'acquirente`;
                }
                break;
            case 'pending_seller_confirmation':
                if (isSeller) {
                    details += `\n✅ **AZIONE RICHIESTA:** Conferma o rifiuta la richiesta`;
                } else {
                    details += `\n⏳ In attesa della conferma del venditore`;
                }
                break;
        }
        
        return details;
    }

    async init() {
        try {
            // Initialize database
            this.db = new Database(process.env.MONGODB_URI);
            await this.db.connect();
            
            // Initialize services
            this.userService = new UserService(this.db);
            this.announcementService = new AnnouncementService(this.db);
            this.transactionService = new TransactionService(this.db);
            
            // Setup bot
            this.setupMiddleware();
            this.setupScenes();
            this.setupCommands();
            this.setupCallbacks();
            this.setupCronJobs();
            this.setupBotCommands();
            this.setupWebhook();
            
            console.log('🤖 Bot KWH Sharing inizializzato con successo!');
            
        } catch (error) {
            console.error('❌ Errore durante l\'inizializzazione:', error);
            process.exit(1);
        }
    }

    setupMiddleware() {
        // Session middleware with memory cleanup
        this.bot.use(session({
            defaultSession: () => ({}),
            // TTL for sessions (6 hours)
            ttl: 6 * 60 * 60
        }));
        
        // Scene middleware
        const stage = new Scenes.Stage([
            createSellAnnouncementScene(this),
            createContactSellerScene(this),
            createTransactionScene(this)
        ]);
        this.bot.use(stage.middleware());
        
        // Log middleware for debugging
        this.bot.use(async (ctx, next) => {
            const start = Date.now();
            await next();
            const ms = Date.now() - start;
            console.log(`Response time: ${ms}ms`);
        });
        
        // Group membership check middleware
        this.bot.use(async (ctx, next) => {
            if (ctx.chat.type === 'private') {
                const userId = ctx.from.id;
                const isGroupMember = await this.userService.isUserInGroup(userId, this.groupId);
                
                if (!isGroupMember && userId != this.adminUserId) {
                    await ctx.reply(Messages.NOT_GROUP_MEMBER);
                    return;
                }
                
                // Register/update user
                await this.userService.upsertUser({
                    userId: ctx.from.id,
                    username: ctx.from.username,
                    firstName: ctx.from.first_name,
                    lastName: ctx.from.last_name,
                    lastActivity: new Date()
                });
            }
            
            // Delete user messages in the topic (keep only announcements)
            if (ctx.chat.id == this.groupId && ctx.message?.message_thread_id == this.topicId) {
                if (!ctx.message.text?.startsWith('🔋 Vendita kWh sharing')) {
                    try {
                        await ctx.deleteMessage();
                    } catch (error) {
                        console.log('Non posso eliminare il messaggio:', error.description);
                    }
                    return;
                }
            }
            
            return next();
        });
    }

    setupScenes() {
        // Scenes are created in separate files and passed to stage
    }

    setupCommands() {
        // Start command
        this.bot.start(async (ctx) => {
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
        this.bot.command('help', async (ctx) => {
            await ctx.reply(Messages.HELP_TEXT, {
                parse_mode: 'Markdown'
            });
        });

        // Admin commands
        this.bot.command('admin', async (ctx) => {
            if (ctx.from.id != this.adminUserId) {
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

        this.bot.command('stats', async (ctx) => {
            if (ctx.from.id != this.adminUserId) return;
            
            const transactionStats = await this.transactionService.getTransactionStats();
            const announcementStats = await this.announcementService.getAnnouncementStats();
            
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

        // Quick transaction access by ID - NUOVO
        this.bot.command(/tx (.+)/, async (ctx) => {
            const transactionId = ctx.match[1].trim();
            const userId = ctx.from.id;
            
            const transaction = await this.transactionService.getTransaction(transactionId);
            
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

        // Quick payments access - MIGLIORATO
        this.bot.command('pagamenti', async (ctx) => {
            const userId = ctx.from.id;
            
            // Get transactions needing payment
            const transactions = await this.transactionService.getUserTransactions(userId, 'all');
            const paymentPending = transactions.filter(t => 
                t.status === 'payment_requested' && t.buyerId === userId
            );
            
            if (paymentPending.length === 0) {
                await ctx.reply('✅ Non hai pagamenti in sospeso.', Keyboards.MAIN_MENU);
                return;
            }
            
            let message = '💳 **PAGAMENTI IN SOSPESO**\n\n';
            
            for (const [index, tx] of paymentPending.entries()) {
                const announcement = await this.announcementService.getAnnouncement(tx.announcementId);
                const amount = announcement && tx.declaredKwh ? 
                    (tx.declaredKwh * announcement.price).toFixed(2) : 'N/A';
                
                message += `🆔 ${tx.transactionId}\n`;
                message += `💰 €${amount}`;
                if (announcement && tx.declaredKwh) {
                    message += ` (${tx.declaredKwh} KWH × ${announcement.price}€)`;
                }
                message += `\n📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n`;
                message += `💳 Metodi: ${announcement?.paymentMethods || 'Come concordato'}\n\n`;
            }
            
            message += 'Seleziona una transazione per gestire il pagamento:';
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getPaymentTransactionsKeyboard(paymentPending)
            });
        });

        // Sell KWH command
        this.bot.hears('🔋 Vendi KWH', async (ctx) => {
            await ctx.scene.enter('sellAnnouncementScene');
        });

        // My announcements command - FIXED VERSION
        this.bot.hears('📊 I miei annunci', async (ctx) => {
            const userId = ctx.from.id;
            const announcements = await this.announcementService.getUserAnnouncements(userId);
            
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

        // My transactions command - NUOVO
        this.bot.hears('💼 Le mie transazioni', async (ctx) => {
            const userId = ctx.from.id;
            
            // Get all user transactions
            const allTransactions = await this.transactionService.getUserTransactions(userId, 'all');
            
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
                    const statusEmoji = this.getStatusEmoji(tx.status);
                    const statusText = this.getStatusText(tx.status);
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

        // Pending requests command - VERSIONE CORRETTA
        this.bot.hears('📥 Richieste pendenti', async (ctx) => {
            // Make sure we're not in any scene
            if (ctx.scene) {
                await ctx.scene.leave();
            }
            
            const userId = ctx.from.id;
            
            // Get pending transactions where user is seller
            const pendingTransactions = await this.transactionService.getUserTransactions(userId, 'seller');
            const pendingRequests = pendingTransactions.filter(t => t.status === 'pending_seller_confirmation');
            
            if (pendingRequests.length === 0) {
                await ctx.reply('📭 Non hai richieste di acquisto in attesa.', Keyboards.MAIN_MENU);
                return;
            }

            // Process each request
            for (const transaction of pendingRequests) {
                try {
                    // Get buyer info
                    const buyer = await this.userService.getUser(transaction.buyerId);
                    const buyerUsername = buyer?.username || 'utente';
                    
                    // Get announcement info
                    const announcement = await this.announcementService.getAnnouncement(transaction.announcementId);
                    
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

        // My feedback command
        this.bot.hears('⭐ I miei feedback', async (ctx) => {
            const userId = ctx.from.id;
            const userStats = await this.userService.getUserStats(userId);
            
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

        // Help command
        this.bot.hears('❓ Aiuto', async (ctx) => {
            await ctx.reply(Messages.HELP_TEXT, {
                parse_mode: 'Markdown',
                ...Keyboards.getHelpKeyboard()
            });
        });

        // Quick access to transaction from message - NUOVO
        this.bot.hears(/T[_A]\d+-\d+/, async (ctx) => {
            const transactionId = ctx.message.text.match(/(T[_A]\d+-\d+)/)[1];
            const userId = ctx.from.id;
            
            const transaction = await this.transactionService.getTransaction(transactionId);
            
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

        // Handler per gestire il testo - MIGLIORATO CON FIX PAGAMENTI
        this.bot.on('text', async (ctx, next) => {
            const text = ctx.message.text.trim();
            
            // Check if we're waiting for transaction ID per pagamento
            if (ctx.session?.waitingForTransactionId && ctx.session?.pendingPaymentConfirmation) {
                console.log('Processing transaction ID for payment:', text);
                
                const transaction = await this.transactionService.getTransaction(text);
                
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
                
                // Check if user is buyer
                if (transaction.buyerId !== ctx.from.id) {
                    await ctx.reply('❌ Non sei autorizzato per questa transazione.');
                    return;
                }
                
                // Clear flags
                delete ctx.session.waitingForTransactionId;
                delete ctx.session.pendingPaymentConfirmation;
                
                // Process payment confirmation
                await this.processPaymentConfirmation(ctx, text);
                return;
            }
            
            // Check if we're waiting for transaction ID (generico)
            if (ctx.session?.waitingForTransactionId) {
                const transactionId = text;
                const transaction = await this.transactionService.getTransaction(transactionId);
                
                if (!transaction) {
                    await ctx.reply('❌ Transazione non trovata. Verifica l\'ID e riprova.');
                    return;
                }
                
                // Check if user is buyer
                if (transaction.buyerId !== ctx.from.id) {
                    await ctx.reply('❌ Non sei autorizzato per questa transazione.');
                    return;
                }
                
                // Clear flag and process payment
                delete ctx.session.waitingForTransactionId;
                ctx.session.currentTransactionId = transactionId;
                
                // Get announcement for amount calculation
                const announcement = await this.announcementService.getAnnouncement(transaction.announcementId);
                const amount = announcement && transaction.declaredKwh ? 
                    (transaction.declaredKwh * announcement.price).toFixed(2) : 'N/A';
                
                // Notify seller to confirm payment
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
                
                return; // Don't call next()
            }
            
            // Check if we're waiting for rejection reason
            if (ctx.session?.waitingForRejectionReason && ctx.session?.rejectingTransactionId) {
                const reason = ctx.message.text;
                const transactionId = ctx.session.rejectingTransactionId;
                
                // Clear session flags
                delete ctx.session.waitingForRejectionReason;
                delete ctx.session.rejectingTransactionId;
                
                // Get transaction
                const transaction = await this.transactionService.getTransaction(transactionId);
                if (!transaction) {
                    await ctx.reply('❌ Transazione non trovata.');
                    return;
                }
                
                // Update transaction
                await this.transactionService.updateTransactionStatus(
                    transactionId,
                    'cancelled',
                    { cancellationReason: reason }
                );

                // Notify buyer
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
                
                return; // Don't call next()
            }
            
            // Continue to next handler if not handling anything special
            return next();
        });
    }

    setupCallbacks() {
        // Admin callbacks
        this.bot.action('admin_general_stats', async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionStats = await this.transactionService.getTransactionStats();
            const announcementStats = await this.announcementService.getAnnouncementStats();
            
            let statsText = '📊 **STATISTICHE DETTAGLIATE**\n\n';
            
            if (transactionStats && transactionStats.overall) {
                statsText += `🔄 **Transazioni:**\n`;
                statsText += `• Totali: ${transactionStats.overall.totalTransactions || 0}\n`;
                statsText += `• Completate: ${transactionStats.overall.completedTransactions || 0}\n`;
                statsText += `• Tasso successo: ${transactionStats.overall.totalTransactions > 0 ? 
                    ((transactionStats.overall.completedTransactions / transactionStats.overall.totalTransactions) * 100).toFixed(1) : 0}%\n`;
                statsText += `• KWH totali: ${(transactionStats.overall.totalKwh || 0).toFixed(1)}\n\n`;
            }
            
            if (announcementStats) {
                statsText += `📋 **Annunci:**\n`;
                statsText += `• Attivi: ${announcementStats.totalActive || 0}\n`;
                statsText += `• Prezzo medio: €${(announcementStats.avgPrice || 0).toFixed(3)}/KWH\n`;
                statsText += `• Range prezzi: €${(announcementStats.minPrice || 0).toFixed(2)} - €${(announcementStats.maxPrice || 0).toFixed(2)}\n`;
            }
            
            await ctx.editMessageText(statsText, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.action('admin_pending_transactions', async (ctx) => {
            await ctx.answerCbQuery();
            const pendingTransactions = await this.transactionService.getPendingTransactions();
            
            if (pendingTransactions.length === 0) {
                await ctx.editMessageText(
                    '✅ **Nessuna transazione in sospeso**\n\nTutte le transazioni sono aggiornate!',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            let message = '⏳ **TRANSAZIONI IN SOSPESO:**\n\n';
            for (const tx of pendingTransactions.slice(0, 10)) {
                message += `🆔 ${tx.transactionId}\n`;
                message += `📊 Status: ${tx.status}\n`;
                message += `📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            if (pendingTransactions.length > 10) {
                message += `\n... e altre ${pendingTransactions.length - 10} transazioni`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        // === CALLBACKS TRANSAZIONI - FIX BUTTON_DATA_INVALID ===

        // Transaction management callbacks - AGGIORNATO
        this.bot.action(/^view_tx_(\d+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const index = parseInt(ctx.match[1]);
            const userId = ctx.from.id;
            
            // Riprendi la lista delle transazioni per ottenere l'ID corretto
            const allTransactions = await this.transactionService.getUserTransactions(userId, 'all');
            const pending = allTransactions.filter(t => !['completed', 'cancelled'].includes(t.status));
            
            if (index >= pending.length) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            const transaction = pending[index];
            const announcement = await this.announcementService.getAnnouncement(transaction.announcementId);
            const detailText = this.formatTransactionDetails(transaction, announcement, userId);
            
            // Cache l'ID per future operazioni
            const shortId = transaction.transactionId.slice(-10);
            this.cacheTransactionId(shortId, transaction.transactionId);
            
            await ctx.editMessageText(detailText, {
                parse_mode: 'Markdown',
                ...Keyboards.getTransactionActionsKeyboard(transaction.transactionId, transaction.status, userId === transaction.sellerId)
            });
        });

        this.bot.action(/^manage_tx_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const transaction = await this.findTransactionByShortId(shortId, ctx.from.id);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            ctx.session.transactionId = transaction.transactionId;
            await ctx.scene.enter('transactionScene');
        });

        this.bot.action(/^pay_tx_(\d+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const index = parseInt(ctx.match[1]);
            const userId = ctx.from.id;
            
            // Riprendi la lista dei pagamenti pendenti
            const transactions = await this.transactionService.getUserTransactions(userId, 'all');
            const paymentPending = transactions.filter(t => 
                t.status === 'payment_requested' && t.buyerId === userId
            );
            
            if (index >= paymentPending.length) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            const transaction = paymentPending[index];
            const announcement = await this.announcementService.getAnnouncement(transaction.announcementId);
            
            // Mostra schermata di pagamento CON ID SALVATO
            const amount = announcement && transaction.declaredKwh ? 
                (transaction.declaredKwh * announcement.price).toFixed(2) : 'N/A';
            
            // IMPORTANTE: Salva l'ID nella sessione E nel messaggio
            ctx.session.currentTransactionId = transaction.transactionId;
            
            await ctx.editMessageText(
                `💳 **PROCEDI CON IL PAGAMENTO**\n\n` +
                `🆔 ID: \`${transaction.transactionId}\`\n` +
                `⚡ KWH confermati: ${transaction.declaredKwh || 'N/A'}\n` +
                `💰 Importo: €${amount}\n` +
                `💳 Metodi accettati: ${announcement?.paymentMethods || 'Come concordato'}\n\n` +
                `Una volta effettuato il pagamento, premi il pulsante per confermare.\n\n` +
                `🔍 **ID per riferimento:** \`${transaction.transactionId}\``,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getPaymentConfirmationKeyboard()
                }
            );
        });

        this.bot.action('back_to_txs', async (ctx) => {
            await ctx.answerCbQuery();
            // Simulate the "Le mie transazioni" command
            const userId = ctx.from.id;
            
            const allTransactions = await this.transactionService.getUserTransactions(userId, 'all');
            const pending = allTransactions.filter(t => !['completed', 'cancelled'].includes(t.status));
            const completed = allTransactions.filter(t => t.status === 'completed');

            let message = '💼 **LE TUE TRANSAZIONI**\n\n';
            
            if (pending.length > 0) {
                message += `⏳ **IN CORSO (${pending.length}):**\n`;
                for (const tx of pending.slice(0, 5)) {
                    const statusEmoji = this.getStatusEmoji(tx.status);
                    const statusText = this.getStatusText(tx.status);
                    const displayId = tx.transactionId.length > 15 ? 
                        tx.transactionId.substring(2, 12) + '...' : 
                        tx.transactionId;
                    message += `${statusEmoji} ${displayId}\n`;
                    message += `📊 ${statusText}\n`;
                    message += `📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n\n`;
                }
            }
            
            message += `✅ **Completate:** ${completed.length}`;
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getTransactionsKeyboard(pending, completed)
            });
        });

        this.bot.action('tx_history', async (ctx) => {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const transactions = await this.transactionService.getUserTransactions(userId, 'all');
            const completed = transactions.filter(t => t.status === 'completed');
            const cancelled = transactions.filter(t => t.status === 'cancelled');
            
            let message = '📜 **CRONOLOGIA TRANSAZIONI**\n\n';
            
            if (completed.length > 0) {
                message += `✅ **COMPLETATE (${completed.length}):**\n`;
                completed.slice(-10).reverse().forEach(tx => {
                    const displayId = tx.transactionId.length > 20 ? 
                        tx.transactionId.substring(2, 17) + '...' : 
                        tx.transactionId;
                    message += `• ${displayId}\n`;
                    message += `  📅 ${tx.completedAt ? tx.completedAt.toLocaleDateString('it-IT') : tx.createdAt.toLocaleDateString('it-IT')}\n`;
                });
                message += '\n';
            }
            
            if (cancelled.length > 0) {
                message += `❌ **ANNULLATE (${cancelled.length}):**\n`;
                cancelled.slice(-5).reverse().forEach(tx => {
                    const displayId = tx.transactionId.length > 20 ? 
                        tx.transactionId.substring(2, 17) + '...' : 
                        tx.transactionId;
                    message += `• ${displayId}\n`;
                    message += `  📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n`;
                });
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        // === CALLBACKS PAGAMENTI - FIX COMPLETO ===

        // KWH validation callbacks (for seller) - AGGIORNATI
        this.bot.action(/^kwh_ok_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const transaction = await this.findTransactionByShortId(shortId, ctx.from.id);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }

            // Update status to payment requested
            await this.transactionService.updateTransactionStatus(
                transaction.transactionId,
                'payment_requested'
            );

            // Get announcement for payment details
            const announcement = await this.announcementService.getAnnouncement(transaction.announcementId);

            // Notify buyer
            try {
                const amount = announcement && transaction.declaredKwh ? 
                    (transaction.declaredKwh * announcement.price).toFixed(2) : 'N/A';
                
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `✅ *KWH CONFERMATI DAL VENDITORE*\n\n` +
                    `Il venditore ha confermato la ricezione di ${transaction.declaredKwh || 'N/A'} KWH.\n\n` +
                    `💳 *Procedi con il pagamento*\n` +
                    `💰 Importo: €${amount}\n` +
                    `💳 Metodi accettati: ${announcement?.paymentMethods || 'Come concordato'}\n\n` +
                    `Una volta effettuato il pagamento, premi il pulsante qui sotto.\n\n` +
                    `🔍 ID Transazione: \`${transaction.transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        ...Keyboards.getPaymentConfirmationKeyboard()
                    }
                );

            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.editMessageText(
                '✅ KWH confermati! L\'acquirente è stato invitato a procedere con il pagamento.',
                { reply_markup: undefined }
            );
        });

        this.bot.action(/^kwh_bad_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            await ctx.editMessageText(
                '📝 *KWH non corretti*\n\n' +
                'Specifica il problema:\n' +
                '• Quanti KWH mostra realmente la foto?\n' +
                '• Qual è il problema riscontrato?',
                { parse_mode: 'Markdown' }
            );
            
            ctx.session.disputingKwh = true;
            ctx.session.disputeTransactionId = shortId;
            ctx.session.waitingFor = 'kwh_dispute_reason';
        });

        // Payment confirmation actions - FIXED
        this.bot.action('payment_completed', async (ctx) => {
            await ctx.answerCbQuery();
            
            // PRIORITÀ: Cerca l'ID in tutti i modi possibili
            let transactionId = null;
            
            // 1. Dalla sessione (più affidabile)
            if (ctx.session.currentTransactionId) {
                transactionId = ctx.session.currentTransactionId;
                console.log('Transaction ID found in session:', transactionId);
            }
            
            // 2. Dal messaggio corrente
            if (!transactionId) {
                const messageText = ctx.callbackQuery.message.text || '';
                const transactionIdMatch = messageText.match(/ID: `?([^`\s\n]+)`?/);
                if (transactionIdMatch) {
                    transactionId = transactionIdMatch[1];
                    console.log('Transaction ID found in message:', transactionId);
                }
            }
            
            // 3. Cerca pattern più specifico nel messaggio
            if (!transactionId) {
                const messageText = ctx.callbackQuery.message.text || '';
                const patterns = [
                    /ID per riferimento: `?([^`\s\n]+)`?/,
                    /T_A\d+-\d+/,
                    /TA\d+-\d+/
                ];
                
                for (const pattern of patterns) {
                    const match = messageText.match(pattern);
                    if (match) {
                        transactionId = match[1] || match[0];
                        console.log('Transaction ID found with pattern:', transactionId);
                        break;
                    }
                }
            }
            
            if (!transactionId) {
                // ULTIMA OPZIONE: Chiedi all'utente di incollare l'ID
                await ctx.editMessageText(
                    '⚠️ **ID transazione non trovato automaticamente**\n\n' +
                    '📋 Per confermare il pagamento:\n' +
                    '1. Copia l\'ID della transazione qui sopra\n' +
                    '2. Incollalo come messaggio\n' +
                    '3. Il bot processerà automaticamente il pagamento\n\n' +
                    '💡 **Esempio di formato ID:**\n' +
                    '`TA7549558456-20250523160047`\n\n' +
                    'Incolla l\'ID ora:',
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Indietro ai pagamenti', callback_data: 'back_to_payments' }
                            ]]
                        }
                    }
                );
                
                // Imposta flag per aspettare l'ID
                ctx.session.waitingForTransactionId = true;
                ctx.session.pendingPaymentConfirmation = true;
                return;
            }
            
            // Processa il pagamento con l'ID trovato
            await this.processPaymentConfirmation(ctx, transactionId);
        });

        // Handler per problemi pagamento
        this.bot.action('payment_issues', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                '⚠️ *Problemi con il pagamento?*\n\nScegli un\'opzione:',
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getPaymentIssuesKeyboard()
                }
            );
        });

        // Seller payment confirmation - FIXED
        this.bot.action('payment_received', async (ctx) => {
            await ctx.answerCbQuery();
            
            // Get transaction ID from message
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await ctx.reply('❌ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1];
            const transaction = await this.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            await this.transactionService.updateTransactionStatus(
                transactionId,
                'completed'
            );

            // Update user stats
            await this.userService.updateUserTransactionStats(
                transaction.sellerId,
                transaction.actualKwh || transaction.declaredKwh,
                'sell'
            );
            await this.userService.updateUserTransactionStats(
                transaction.buyerId,
                transaction.actualKwh || transaction.declaredKwh,
                'buy'
            );

            // Notify buyer
            try {
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    Messages.TRANSACTION_COMPLETED + '\n\n' + Messages.FEEDBACK_REQUEST,
                    Keyboards.getFeedbackKeyboard()
                );
                
                // Send transaction ID for feedback
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `🔍 ID Transazione: \`${transactionId}\``,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            // Ask seller for feedback too
            await ctx.editMessageText(
                Messages.TRANSACTION_COMPLETED + '\n\n' + Messages.FEEDBACK_REQUEST,
                Keyboards.getFeedbackKeyboard()
            );
            
            // Store transaction for feedback
            ctx.session.completedTransactionId = transactionId;
        });

        this.bot.action('payment_not_received', async (ctx) => {
            await ctx.answerCbQuery();
            
            // Get transaction ID
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await ctx.reply('❌ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1];
            const transaction = await this.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Add issue to transaction
            await this.transactionService.addTransactionIssue(
                transactionId,
                'Pagamento non ricevuto',
                transaction.sellerId
            );
            
            // Notify buyer about payment issue
            try {
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    '⚠️ *Problema pagamento segnalato*\n\n' +
                    'Il venditore non conferma la ricezione del pagamento.\n\n' +
                    'Cosa vuoi fare?',
                    {
                        parse_mode: 'Markdown',
                        ...Keyboards.getPaymentIssuesKeyboard()
                    }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.editMessageText(
                '⚠️ Problema pagamento segnalato. L\'acquirente riceverà opzioni per risolvere.',
                { reply_markup: undefined }
            );
        });

        // Payment issue resolution
        this.bot.action('retry_payment', async (ctx) => {
            await ctx.answerCbQuery();
            
            await ctx.editMessageText(
                '💳 *Riprova il pagamento*\n\n' +
                'Effettua nuovamente il pagamento secondo gli accordi presi con il venditore.\n\n' +
                'Una volta completato, usa il pulsante per confermare.',
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getPaymentConfirmationKeyboard()
                }
            );
        });

        this.bot.action('send_payment_proof', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                '📷 *Invia screenshot del pagamento*\n\n' +
                'Scatta uno screenshot che mostri chiaramente:\n' +
                '• Importo inviato\n' +
                '• Data/ora transazione\n' +
                '• Destinatario\n\n' +
                'Invia la foto ora:',
                { parse_mode: 'Markdown', reply_markup: undefined }
            );
            ctx.session.waitingFor = 'payment_proof';
        });

        // === CALLBACKS ANNUNCI - FIX BUTTON_DATA_INVALID ===

        this.bot.action(/^view_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.', { reply_markup: undefined });
                return;
            }
            
            const userStats = await this.userService.getUserStats(announcement.userId);
            const detailText = await this.announcementService.formatAnnouncementMessage(
                { ...announcement, username: ctx.from.username },
                userStats
            );
            
            // Replace underscores in the text to avoid Markdown parsing issues
            const escapedText = detailText.replace(/_/g, '\\_');
            
            await ctx.editMessageText(
                `📋 **DETTAGLI ANNUNCIO**\n\n${escapedText}`,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getAnnouncementActionsKeyboard(announcement.announcementId)
                }
            );
        });

        this.bot.action(/^delete_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.');
                return;
            }
            
            await ctx.editMessageText(
                '⚠️ **Sei sicuro di voler eliminare questo annuncio?**\n\nQuesta azione è irreversibile.',
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getConfirmDeleteKeyboard(announcement.announcementId)
                }
            );
        });

        this.bot.action(/^confirm_del_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.');
                return;
            }
            
            // Delete from database
            const deleted = await this.announcementService.deleteAnnouncement(announcement.announcementId, ctx.from.id);
            
            if (deleted) {
                // Try to delete from group
                if (announcement.messageId) {
                    try {
                        await ctx.telegram.deleteMessage(this.groupId, announcement.messageId);
                    } catch (error) {
                        console.log('Could not delete announcement from group:', error.description);
                    }
                }
                
                await ctx.editMessageText('✅ Annuncio eliminato con successo.');
                setTimeout(() => {
                    ctx.deleteMessage().catch(() => {});
                    ctx.reply('Usa il menu per altre operazioni:', Keyboards.MAIN_MENU);
                }, 2000);
            } else {
                await ctx.editMessageText('❌ Errore durante l\'eliminazione.');
            }
        });

        this.bot.action(/^cancel_del_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            // Go back to announcement details
            const announcement = await this.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.');
                return;
            }
            
            const userStats = await this.userService.getUserStats(announcement.userId);
            const detailText = await this.announcementService.formatAnnouncementMessage(
                { ...announcement, username: ctx.from.username },
                userStats
            );
            
            // Replace underscores in the text to avoid Markdown parsing issues
            const escapedText = detailText.replace(/_/g, '\\_');
            
            await ctx.editMessageText(
                `📋 **DETTAGLI ANNUNCIO**\n\n${escapedText}`,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getAnnouncementActionsKeyboard(announcement.announcementId)
                }
            );
        });

        this.bot.action(/^stats_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.');
                return;
            }
            
            // Get announcement transactions
            const transactions = await this.transactionService.getUserTransactions(ctx.from.id, 'seller');
            const annTransactions = transactions.filter(t => t.announcementId === announcement.announcementId);
            
            let statsText = `📊 **STATISTICHE ANNUNCIO**\n\n`;
            statsText += `🆔 ID: ${announcement.announcementId}\n\n`;
            statsText += `📈 **Transazioni:**\n`;
            statsText += `• Totali: ${annTransactions.length}\n`;
            statsText += `• Completate: ${annTransactions.filter(t => t.status === 'completed').length}\n`;
            statsText += `• In corso: ${annTransactions.filter(t => !['completed', 'cancelled'].includes(t.status)).length}\n`;
            statsText += `• Annullate: ${annTransactions.filter(t => t.status === 'cancelled').length}\n\n`;
            
            const completedTx = annTransactions.filter(t => t.status === 'completed');
            if (completedTx.length > 0) {
                const totalKwh = completedTx.reduce((sum, t) => sum + (t.actualKwh || 0), 0);
                
                statsText += `⚡ **KWH venduti:** ${totalKwh.toFixed(1)}\n`;
            }
            
            await ctx.editMessageText(statsText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Indietro', callback_data: `view_ann_${shortId}` }
                    ]]
                }
            });
        });

        this.bot.action('my_announcements', async (ctx) => {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            const announcements = await this.announcementService.getUserAnnouncements(userId);
            
            if (announcements.length === 0) {
                await ctx.editMessageText('📭 Non hai ancora pubblicato annunci.');
                setTimeout(() => {
                    ctx.deleteMessage().catch(() => {});
                    ctx.reply('Usa il menu per pubblicare un annuncio:', Keyboards.MAIN_MENU);
                }, 2000);
                return;
            }

            let message = '📊 <b>I TUOI ANNUNCI ATTIVI:</b>\n\n';
            for (const ann of announcements) {
                message += `🆔 ${ann.announcementId}\n`;
                message += `💰 ${ann.price}€/KWH\n`;
                message += `📅 Pubblicato: ${ann.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                ...Keyboards.getUserAnnouncementsKeyboard(announcements)
            });
        });

        // === CALLBACKS ESISTENTI ===

        // Back to main menu - FIXED
        this.bot.action('back_to_main', async (ctx) => {
            await ctx.answerCbQuery();
            // Leave any active scene
            if (ctx.scene) {
                await ctx.scene.leave();
            }
            // Delete the inline message
            await ctx.deleteMessage();
            // Send new message with reply keyboard
            await ctx.reply(
                '🏠 **Menu Principale**\n\nSeleziona un\'opzione:',
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.MAIN_MENU
                }
            );
        });

        // Handler per accettare richiesta con ID incorporato
        this.bot.action(/^accept_request_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            const transaction = await this.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Update transaction status
            await this.transactionService.updateTransactionStatus(
                transactionId,
                'confirmed'
            );

            // Notify buyer
            try {
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `✅ *Richiesta accettata!*\n\n` +
                    `Il venditore ha confermato la tua richiesta per ${transaction.scheduledDate}.\n` +
                    `Ti avviseremo quando sarà il momento della ricarica.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.editMessageText(
                '✅ Richiesta accettata! L\'acquirente è stato notificato.\n\n' +
                'Riceverai una notifica quando sarà il momento di attivare la ricarica.',
                { parse_mode: 'Markdown' }
            );
            
            // Schedule reminder for charging time (for testing, using 30 seconds)
            setTimeout(async () => {
                try {
                    await ctx.telegram.sendMessage(
                        transaction.sellerId,
                        `⏰ È il momento di attivare la ricarica!\n\n` +
                        `ID Transazione: \`${transactionId}\`\n` +
                        `Data/ora: ${transaction.scheduledDate}\n` +
                        `Colonnina: ${transaction.brand}\n` +
                        `Posizione: ${transaction.location}`,
                        {
                            parse_mode: 'Markdown',
                            ...Keyboards.getActivateChargingKeyboard()
                        }
                    );
                } catch (error) {
                    console.error('Error sending charging reminder:', error);
                }
            }, 30000); // 30 seconds for testing
        });

        // Handler per rifiutare richiesta con ID incorporato
        this.bot.action(/^reject_request_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            
            // Store transaction ID and ask for reason
            ctx.session.rejectingTransactionId = transactionId;
            
            await ctx.editMessageText(
                '📝 *Motivo del rifiuto:*\n\n' +
                'Scrivi brevemente il motivo per cui rifiuti questa richiesta:',
                { parse_mode: 'Markdown' }
            );
            
            // Set a flag to handle the next text message
            ctx.session.waitingForRejectionReason = true;
        });

        // Handler per contattare acquirente con dati incorporati
        this.bot.action(/^contact_buyer_(\d+)_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const buyerId = ctx.match[1];
            const buyerUsername = ctx.match[2];
            
            // Create a direct Telegram link
            const telegramLink = buyerUsername !== 'user' ? 
                `https://t.me/${buyerUsername}` : 
                `tg://user?id=${buyerId}`;
            
            const message = `💬 **Contatta l'acquirente**\n\n`;
            
            if (buyerUsername !== 'user') {
                await ctx.reply(
                    message +
                    `Puoi contattare direttamente @${buyerUsername} cliccando qui:\n` +
                    `${telegramLink}\n\n` +
                    `📝 **Suggerimenti per la conversazione:**\n` +
                    `• Conferma i dettagli della ricarica\n` +
                    `• Chiarisci eventuali dubbi sulla colonnina\n` +
                    `• Coordina l'orario se necessario\n` +
                    `• Discuti il metodo di pagamento preferito\n\n` +
                    `⚠️ **Importante:** Dopo aver chiarito tutti i dettagli, torna qui per accettare o rifiutare la richiesta.`,
                    { 
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true 
                    }
                );
            } else {
                await ctx.reply(
                    message +
                    `L'utente non ha un username pubblico.\n` +
                    `ID Utente: \`${buyerId}\`\n\n` +
                    `Puoi provare a contattarlo tramite il link:\n${telegramLink}\n\n` +
                    `Oppure attendi che ti contatti lui.`,
                    { 
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true 
                    }
                );
            }
        });

        // Handler per attivare la ricarica
        this.bot.action('activate_charging', async (ctx) => {
            await ctx.answerCbQuery();
            
            // Extract transaction ID from message
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await ctx.reply('❌ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1];
            const transaction = await this.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            await this.transactionService.updateTransactionStatus(
                transactionId,
                'charging_started'
            );

            // Notify buyer to confirm charging
            try {
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `⚡ *RICARICA ATTIVATA!*\n\n` +
                    `Il venditore ha attivato la ricarica.\n` +
                    `Controlla il connettore e conferma se la ricarica è iniziata.\n\n` +
                    `💡 *Se non sta caricando:*\n` +
                    `• Verifica che il cavo sia inserito bene\n` +
                    `• Controlla che l'auto sia pronta\n` +
                    `• Riprova l'attivazione\n\n` +
                    `ID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        ...Keyboards.getBuyerChargingConfirmKeyboard()
                    }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.editMessageText(
                '⚡ Ricarica attivata!\n\n' +
                'In attesa della conferma dall\'acquirente che la ricarica sia iniziata correttamente.',
                { parse_mode: 'Markdown' }
            );
        });

        // Handler per ritardare la ricarica
        this.bot.action('delay_charging', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            const transactionId = transactionIdMatch ? transactionIdMatch[1] : null;
            
            setTimeout(async () => {
                try {
                    let message = '⏰ Promemoria: È il momento di attivare la ricarica!';
                    if (transactionId) {
                        message += `\n\nID Transazione: \`${transactionId}\``;
                    }
                    
                    await ctx.telegram.sendMessage(
                        ctx.from.id,
                        message,
                        {
                            parse_mode: 'Markdown',
                            ...Keyboards.getActivateChargingKeyboard()
                        }
                    );
                } catch (error) {
                    console.error('Error sending delayed reminder:', error);
                }
            }, 5 * 60 * 1000); // 5 minutes

            await ctx.editMessageText(
                '⏸️ Ricarica rimandata di 5 minuti.\n\n' +
                'Riceverai un promemoria quando sarà il momento di attivare.',
                { parse_mode: 'Markdown' }
            );
        });

        // Handler per problemi tecnici
        this.bot.action('technical_issues', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            const transactionId = transactionIdMatch ? transactionIdMatch[1] : null;
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🔌 Colonnina non risponde', callback_data: `issue_charger_${transactionId}` }],
                    [{ text: '❌ Errore attivazione', callback_data: `issue_activation_${transactionId}` }],
                    [{ text: '📱 Problema app', callback_data: `issue_app_${transactionId}` }],
                    [{ text: '📞 Contatta admin', callback_data: `call_admin_${transactionId}` }]
                ]
            };
            
            await ctx.editMessageText(
                '⚠️ *Problemi tecnici rilevati*\n\n' +
                'Seleziona il tipo di problema:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        });

        // Handler per tipi di problemi tecnici
        this.bot.action(/^issue_(charger|activation|app)_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const issueType = ctx.match[1];
            const transactionId = ctx.match[2];
            
            if (!transactionId || transactionId === 'null') {
                await ctx.reply('❌ ID transazione non trovato.');
                return;
            }
            
            const transaction = await this.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Add issue to transaction
            await this.transactionService.addTransactionIssue(
                transactionId,
                `Problema: ${issueType}`,
                ctx.from.id
            );
            
            // Notify buyer about the issue
            try {
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `⚠️ *Problema tecnico segnalato*\n\n` +
                    `Il venditore sta riscontrando problemi con: ${issueType}\n` +
                    `Sta lavorando per risolverlo.\n\n` +
                    `Ti terremo aggiornato.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }
            
            await ctx.editMessageText(
                '📝 Problema registrato.\n\n' +
                'L\'acquirente è stato informato. Riprova l\'attivazione quando possibile.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔄 Riprova attivazione', callback_data: `retry_activation_${transactionId}` }
                        ]]
                    }
                }
            );
        });

        // Handler per riprovare attivazione
        this.bot.action(/^retry_activation_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            
            await ctx.editMessageText(
                '🔄 Riprova ad attivare la ricarica quando sei pronto.\n\n' +
                `ID Transazione: \`${transactionId}\``,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getActivateChargingKeyboard()
                }
            );
        });

        // Handler per chiamare admin con transazione specifica
        this.bot.action(/^call_admin_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            
            if (!transactionId || transactionId === 'null') {
                await ctx.reply('❌ ID transazione non trovato.');
                return;
            }
            
            // Notify admin
            const adminMessage = Messages.formatAdminAlert(
                transactionId,
                'Richiesta aiuto per problemi tecnici',
                ctx.from.username || ctx.from.first_name
            );

            try {
                await ctx.telegram.sendMessage(
                    this.adminUserId,
                    adminMessage,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying admin:', error);
            }

            await ctx.editMessageText(
                '📞 Admin contattato!\n\n' +
                'Un amministratore ti aiuterà il prima possibile.',
                { parse_mode: 'Markdown' }
            );
        });

        // Buyer charging confirmation callbacks
        this.bot.action('charging_confirmed', async (ctx) => {
            await ctx.answerCbQuery();
            
            // Need to get transaction from message context
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                // Try to get from previous message in conversation
                await ctx.reply('⚠️ Per continuare, inserisci l\'ID della transazione.');
                return;
            }
            
            const transactionId = transactionIdMatch[1];
            ctx.session.transactionId = transactionId;
            ctx.session.chargingConfirmed = true;
            await ctx.scene.enter('transactionScene');
        });

        this.bot.action('charging_failed', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await ctx.reply('⚠️ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1];
            const transaction = await this.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            const retryCount = await this.transactionService.incrementRetryCount(transactionId);
            
            // Notify seller
            try {
                await ctx.telegram.sendMessage(
                    transaction.sellerId,
                    Messages.CHARGING_FAILED_RETRY + `\n\nID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        ...Keyboards.getRetryActivationKeyboard(retryCount)
                    }
                );
            } catch (error) {
                console.error('Error notifying seller:', error);
            }

            await ctx.editMessageText(
                '❌ Segnalazione ricevuta. Il venditore proverà a risolvere il problema.',
                { reply_markup: undefined }
            );
        });

        // Help callbacks
        this.bot.action('help_selling', async (ctx) => {
            await ctx.answerCbQuery();
            const helpText = `📋 **COME VENDERE KWH**\n\n` +
                `1️⃣ **Crea annuncio:** Clicca "🔋 Vendi KWH"\n` +
                `2️⃣ **Inserisci dati:** Prezzo, tipo corrente, zone, reti\n` +
                `3️⃣ **Pubblico automatico:** L'annuncio appare nel topic\n` +
                `4️⃣ **Ricevi richieste:** Ti notifichiamo ogni interesse\n` +
                `5️⃣ **Gestisci transazione:** Attivi ricarica e confermi pagamento\n\n` +
                `💡 **Suggerimenti:**\n` +
                `• Prezzo competitivo: 0,30-0,40€/KWH\n` +
                `• Rispondi velocemente alle richieste\n` +
                `• Mantieni alta la qualità del servizio`;
            
            await ctx.editMessageText(helpText, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.action('help_buying', async (ctx) => {
            await ctx.answerCbQuery();
            const helpText = `🛒 **COME COMPRARE KWH**\n\n` +
                `1️⃣ **Trova annuncio:** Vai nel topic annunci\n` +
                `2️⃣ **Contatta venditore:** Clicca "Contatta venditore"\n` +
                `3️⃣ **Fornisci dettagli:** Data, colonnina, connettore\n` +
                `4️⃣ **Attendi conferma:** Il venditore deve accettare\n` +
                `5️⃣ **Ricarica:** Segui le istruzioni per l'attivazione\n` +
                `6️⃣ **Foto display:** Scatta foto dei KWH ricevuti\n` +
                `7️⃣ **Pagamento:** Paga come concordato\n` +
                `8️⃣ **Feedback:** Lascia una valutazione\n\n` +
                `💡 **Suggerimenti:**\n` +
                `• Verifica sempre i dettagli prima di confermare\n` +
                `• Scatta foto nitide del display\n` +
                `• Paga solo dopo conferma del venditore`;
            
            await ctx.editMessageText(helpText, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.action('help_feedback', async (ctx) => {
            await ctx.answerCbQuery();
            const helpText = `⭐ **SISTEMA FEEDBACK**\n\n` +
                `🌟 **Come funziona:**\n` +
                `• Ogni transazione richiede feedback reciproco\n` +
                `• Scala 1-5 stelle (1=pessimo, 5=ottimo)\n` +
                `• Feedback <3 stelle richiedono motivazione\n\n` +
                `🏆 **Badge Venditore:**\n` +
                `• >90% positivi = VENDITORE AFFIDABILE ✅\n` +
                `• >95% positivi = VENDITORE TOP 🌟\n\n` +
                `📊 **Vantaggi feedback alto:**\n` +
                `• Maggiore visibilità negli annunci\n` +
                `• Più richieste di acquisto\n` +
                `• Maggiore fiducia degli acquirenti\n\n` +
                `⚖️ **Feedback equo:**\n` +
                `Lascia feedback onesto e costruttivo per aiutare la community.`;
            
            await ctx.editMessageText(helpText, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.action('help_faq', async (ctx) => {
            await ctx.answerCbQuery();
            const faqText = `❓ **DOMANDE FREQUENTI**\n\n` +
                `❓ **Come funziona il sistema di pagamento?**\n` +
                `Il pagamento avviene direttamente tra venditore e acquirente tramite i metodi indicati nell'annuncio.\n\n` +
                `❓ **Cosa succede se la ricarica non funziona?**\n` +
                `Il bot offre diverse opzioni: riprovare, cambiare connettore, trovare colonnina alternativa o contattare l'admin.\n\n` +
                `❓ **Come ottengo i badge venditore?**\n` +
                `• >90% feedback positivi = VENDITORE AFFIDABILE\n` +
                `• >95% feedback positivi = VENDITORE TOP\n\n` +
                `❓ **Posso modificare un annuncio pubblicato?**\n` +
                `No, ma puoi crearne uno nuovo che sostituirà automaticamente il precedente.\n\n` +
                `❓ **Il bot supporta tutte le reti di ricarica?**\n` +
                `Dipende dall'accesso del venditore. Ogni annuncio specifica le reti disponibili.`;
            
            await ctx.editMessageText(faqText, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.action('contact_admin', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `📞 **CONTATTA ADMIN**\n\n` +
                `Per supporto diretto contatta:\n` +
                `👤 @${process.env.ADMIN_USERNAME || 'amministratore'}\n\n` +
                `🚨 **Per emergenze:**\n` +
                `Usa il pulsante "Chiama admin" durante le transazioni.`,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getBackToMainMenuKeyboard()
                }
            );
        });

        // Admin additional callbacks
        this.bot.action('admin_open_disputes', async (ctx) => {
            await ctx.answerCbQuery();
            // Get disputed transactions
            const disputedTransactions = await this.transactionService.getUserTransactions(null, 'all');
            const disputes = disputedTransactions.filter(tx => tx.status === 'disputed' || tx.issues?.length > 0);
            
            if (disputes.length === 0) {
                await ctx.editMessageText(
                    '✅ **Nessuna disputa aperta**\n\nTutte le transazioni procedono regolarmente!',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            let message = '⚠️ **DISPUTE APERTE:**\n\n';
            for (const dispute of disputes.slice(0, 5)) {
                message += `🆔 ${dispute.transactionId}\n`;
                message += `⚠️ Issues: ${dispute.issues?.length || 0}\n`;
                message += `📅 ${dispute.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.action('admin_manage_users', async (ctx) => {
            await ctx.answerCbQuery();
            const allUsers = await this.userService.getAllUsersWithStats();
            
            let message = '👥 **GESTIONE UTENTI**\n\n';
            message += `📊 **Statistiche generali:**\n`;
            message += `• Utenti totali: ${allUsers.length}\n`;
            message += `• Venditori TOP: ${allUsers.filter(u => u.sellerBadge === 'TOP').length}\n`;
            message += `• Venditori AFFIDABILI: ${allUsers.filter(u => u.sellerBadge === 'AFFIDABILE').length}\n\n`;
            
            const topUsers = allUsers
                .filter(u => u.totalFeedback > 0)
                .sort((a, b) => b.positivePercentage - a.positivePercentage)
                .slice(0, 5);
                
            if (topUsers.length > 0) {
                message += `🏆 **Top 5 venditori:**\n`;
                topUsers.forEach((user, index) => {
                    message += `${index + 1}. @${user.username || 'utente'} (${user.positivePercentage}%)\n`;
                });
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.action('admin_active_announcements', async (ctx) => {
            await ctx.answerCbQuery();
            const activeAnnouncements = await this.announcementService.getActiveAnnouncements(20);
            
            if (activeAnnouncements.length === 0) {
                await ctx.editMessageText(
                    '📭 **Nessun annuncio attivo**\n\nIl marketplace è vuoto al momento.',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            let message = '📋 **ANNUNCI ATTIVI:**\n\n';
            for (const ann of activeAnnouncements.slice(0, 10)) {
                message += `💰 ${ann.price}€/KWH - ${ann.zones}\n`;
                message += `📅 ${ann.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            if (activeAnnouncements.length > 10) {
                message += `\n... e altri ${activeAnnouncements.length - 10} annunci`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        // Nuovo callback per tornare ai pagamenti - NUOVO
        this.bot.action('back_to_payments', async (ctx) => {
            await ctx.answerCbQuery();
            
            // Clear any pending flags
            delete ctx.session.waitingForTransactionId;
            delete ctx.session.pendingPaymentConfirmation;
            
            // Simulate /pagamenti command
            const userId = ctx.from.id;
            
            const transactions = await this.transactionService.getUserTransactions(userId, 'all');
            const paymentPending = transactions.filter(t => 
                t.status === 'payment_requested' && t.buyerId === userId
            );
            
            if (paymentPending.length === 0) {
                await ctx.editMessageText('✅ Non hai pagamenti in sospeso.');
                setTimeout(() => {
                    ctx.reply('Usa il menu principale:', Keyboards.MAIN_MENU);
                }, 1000);
                return;
            }
            
            let message = '💳 **PAGAMENTI IN SOSPESO**\n\n';
            
            for (const [index, tx] of paymentPending.entries()) {
                const announcement = await this.announcementService.getAnnouncement(tx.announcementId);
                const amount = announcement && tx.declaredKwh ? 
                    (tx.declaredKwh * announcement.price).toFixed(2) : 'N/A';
                
                message += `🆔 ${tx.transactionId}\n`;
                message += `💰 €${amount}`;
                if (announcement && tx.declaredKwh) {
                    message += ` (${tx.declaredKwh} KWH × ${announcement.price}€)`;
                }
                message += `\n📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n`;
                message += `💳 Metodi: ${announcement?.paymentMethods || 'Come concordato'}\n\n`;
            }
            
            message += 'Seleziona una transazione per gestire il pagamento:';
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getPaymentTransactionsKeyboard(paymentPending)
            });
        });

        // Feedback actions
        this.bot.action(/^feedback_([1-5])$/, async (ctx) => {
            const rating = parseInt(ctx.match[1]);
            await ctx.answerCbQuery();
            
            // Get transaction ID
            let transactionId;
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (transactionIdMatch) {
                transactionId = transactionIdMatch[1];
            } else if (ctx.session.completedTransactionId) {
                transactionId = ctx.session.completedTransactionId;
            } else {
                await ctx.reply('❌ ID transazione non trovato.');
                return;
            }
            
            const transaction = await this.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            const isSellerGivingFeedback = ctx.from.id === transaction.sellerId;
            const targetUserId = isSellerGivingFeedback ? transaction.buyerId : transaction.sellerId;

            if (rating <= 2) {
                // Ask for reason if negative feedback
                await ctx.editMessageText(Messages.NEGATIVE_FEEDBACK_REASON, { reply_markup: undefined });
                ctx.session.waitingFor = 'feedback_reason';
                ctx.session.feedbackRating = rating;
                ctx.session.feedbackTargetUserId = targetUserId;
                ctx.session.transaction = transaction;
            } else {
                // Positive feedback, no reason needed
                await this.transactionService.createFeedback(
                    transactionId,
                    ctx.from.id,
                    targetUserId,
                    rating,
                    ''
                );

                await ctx.editMessageText(
                    '⭐ Grazie per il feedback!\n\n' +
                    'La transazione è stata completata con successo.',
                    { reply_markup: undefined }
                );

                // Clear session
                delete ctx.session.completedTransactionId;
                
                setTimeout(() => {
                    ctx.reply('Usa il menu per altre operazioni:', Keyboards.MAIN_MENU);
                }, 1000);
            }
        });
    }

    setupCronJobs() {
        // Check pending transactions every 30 minutes
        cron.schedule('*/30 * * * *', async () => {
            try {
                const pendingTransactions = await this.transactionService.getPendingTransactions();
                
                // Remind users about pending actions
                for (const transaction of pendingTransactions) {
                    const hoursSinceCreated = (new Date() - transaction.createdAt) / (1000 * 60 * 60);
                    
                    if (hoursSinceCreated > 2) { // 2 hours without action
                        let reminderText = '';
                        let targetUserId = null;
                        
                        switch (transaction.status) {
                            case 'pending_seller_confirmation':
                                reminderText = `⏰ **Promemoria:** Hai una richiesta di acquisto in sospeso da ${hoursSinceCreated.toFixed(0)} ore.\n\nID: ${transaction.transactionId}`;
                                targetUserId = transaction.sellerId;
                                break;
                                
                            case 'charging_completed':
                                reminderText = `⏰ **Promemoria:** Devi caricare la foto del display per completare la transazione.\n\nID: ${transaction.transactionId}`;
                                targetUserId = transaction.buyerId;
                                break;
                                
                            case 'payment_requested':
                                reminderText = `⏰ **Promemoria:** Pagamento in sospeso da ${hoursSinceCreated.toFixed(0)} ore.\n\nID: ${transaction.transactionId}`;
                                targetUserId = transaction.buyerId;
                                break;
                        }
                        
                        if (reminderText && targetUserId) {
                            try {
                                await this.bot.telegram.sendMessage(targetUserId, reminderText, {
                                    parse_mode: 'Markdown'
                                });
                            } catch (error) {
                                console.log(`Could not send reminder to user ${targetUserId}:`, error.description);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error in cron job:', error);
            }
        });

        // Daily statistics to admin
        cron.schedule('0 9 * * *', async () => {
            try {
                const stats = await this.transactionService.getTransactionStats();
                const announcementStats = await this.announcementService.getAnnouncementStats();
                
                let dailyReport = '📊 **REPORT GIORNALIERO**\n\n';
                
                if (stats && stats.overall) {
                    dailyReport += `🔄 Transazioni totali: ${stats.overall.totalTransactions || 0}\n`;
                    dailyReport += `✅ Completate: ${stats.overall.completedTransactions || 0}\n`;
                }
                
                if (announcementStats) {
                    dailyReport += `📋 Annunci attivi: ${announcementStats.totalActive || 0}\n`;
                }
                
                await this.bot.telegram.sendMessage(this.adminUserId, dailyReport, {
                    parse_mode: 'Markdown'
                });
                
            } catch (error) {
                console.error('Error sending daily report:', error);
            }
        });

        // Weekly cleanup of old data (every Sunday at 2 AM)
        cron.schedule('0 2 * * 0', async () => {
            try {
                const oneMonthAgo = new Date();
                oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                
                // Archive completed transactions older than 1 month
                await this.db.getCollection('transactions').updateMany(
                    { 
                        status: 'completed',
                        completedAt: { $lt: oneMonthAgo }
                    },
                    { 
                        $set: { archived: true }
                    }
                );
                
                console.log('🧹 Weekly cleanup completed');
                
            } catch (error) {
                console.error('Error in weekly cleanup:', error);
            }
        });

        // Keep-alive ping (for free tier services)
        if (process.env.NODE_ENV === 'production' && process.env.KEEP_ALIVE_URL) {
            cron.schedule('*/14 * * * *', async () => {
                try {
                    await axios.get(process.env.KEEP_ALIVE_URL);
                    console.log('Keep-alive ping sent');
                } catch (error) {
                    console.error('Keep-alive ping failed:', error.message);
                }
            });
        }
    }

    async setupBotCommands() {
        try {
            const commands = [
                { command: 'start', description: 'Avvia il bot e mostra il menu principale' },
                { command: 'help', description: 'Mostra la guida completa del bot' },
                { command: 'tx', description: 'Accedi a una transazione specifica (es: /tx ID)' },
                { command: 'pagamenti', description: 'Visualizza pagamenti in sospeso' },
                { command: 'admin', description: 'Dashboard amministratore (solo admin)' },
                { command: 'stats', description: 'Mostra statistiche generali (solo admin)' }
            ];
            
            await this.bot.telegram.setMyCommands(commands);
            console.log('✅ Comandi bot impostati con successo');
            
        } catch (error) {
            console.error('Errore impostazione comandi:', error);
        }
    }

    setupWebhook() {
        // Setup Express server for webhook
        this.app.use(express.json());
        
        // Trust proxy for Render.com - specific configuration
        this.app.set('trust proxy', 1); // Trust first proxy
        
        // Rate limiting with proper configuration for proxied requests
        const limiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 30, // limit each IP to 30 requests per windowMs
            message: 'Too many requests from this IP',
            standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
            legacyHeaders: false, // Disable the `X-RateLimit-*` headers
            // Skip rate limiting for health checks
            skip: (req) => req.path === '/',
            // Use custom key generator that handles proxied IPs properly
            keyGenerator: (req) => {
                // For Render.com, use the X-Forwarded-For header
                return req.ip || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
            }
        });
        
        // Apply rate limiting to webhook endpoint
        this.app.use('/webhook', limiter);
        
        // Health check endpoint with database status
        this.app.get('/', async (req, res) => {
            try {
                const dbConnected = await this.db.isConnected().catch(() => false);
                res.json({ 
                    status: 'OK', 
                    bot: 'KWH Sharing Bot',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    database: dbConnected ? 'connected' : 'disconnected',
                    environment: process.env.NODE_ENV
                });
            } catch (error) {
                // Use 200 to avoid Render marking as unhealthy
                res.status(200).json({ 
                    status: 'DEGRADED', 
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        // Webhook endpoint per Telegram with security
        this.app.post('/webhook', (req, res) => {
            // Verify webhook secret if configured
            if (process.env.WEBHOOK_SECRET) {
                const secret = req.headers['x-telegram-bot-api-secret-token'];
                if (secret !== process.env.WEBHOOK_SECRET) {
                    console.warn('Webhook request with invalid secret');
                    return res.status(401).send('Unauthorized');
                }
            }
            
            try {
                this.bot.handleUpdate(req.body);
                res.sendStatus(200);
            } catch (error) {
                console.error('Error handling webhook:', error);
                res.sendStatus(500);
            }
        });
        
        // Error handler
        this.bot.catch((err, ctx) => {
            console.error('Bot error:', err);
            if (ctx?.reply) {
                ctx.reply('❌ Si è verificato un errore. Riprova o contatta l\'admin.')
                    .catch(() => console.error('Could not send error message'));
            }
        });
        
        // Graceful shutdown
        process.once('SIGINT', () => this.stop('SIGINT'));
        process.once('SIGTERM', () => this.stop('SIGTERM'));
        
        // Start server
        const PORT = process.env.PORT || 3000;
        this.app.listen(PORT, async () => {
            console.log(`🚀 Server avviato sulla porta ${PORT}`);
            
            // Set webhook URL
            if (process.env.NODE_ENV === 'production') {
                const webhookUrl = process.env.WEBHOOK_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook`;
                const webhookOptions = {
                    drop_pending_updates: true
                };
                
                // Add webhook secret if configured
                if (process.env.WEBHOOK_SECRET) {
                    webhookOptions.secret_token = process.env.WEBHOOK_SECRET;
                }
                
                try {
                    await this.bot.telegram.setWebhook(webhookUrl, webhookOptions);
                    const webhookInfo = await this.bot.telegram.getWebhookInfo();
                    console.log(`✅ Webhook configurato: ${webhookUrl}`);
                    console.log(`Webhook info:`, {
                        url: webhookInfo.url,
                        has_custom_certificate: webhookInfo.has_custom_certificate,
                        pending_update_count: webhookInfo.pending_update_count
                    });
                } catch (error) {
                    console.error('❌ Errore configurazione webhook:', error);
                }
            } else {
                // In sviluppo usa polling
                this.bot.launch();
                console.log('🔄 Bot avviato in modalità polling (sviluppo)');
            }
        });
    }

    async stop(signal) {
        console.log(`Received ${signal}, shutting down gracefully...`);
        
        try {
            await this.bot.stop(signal);
            if (this.db) {
                await this.db.disconnect();
            }
            console.log('✅ Bot fermato correttamente');
            process.exit(0);
        } catch (error) {
            console.error('❌ Errore durante lo shutdown:', error);
            process.exit(1);
        }
    }
}

// Start the bot
const bot = new KwhBot();
