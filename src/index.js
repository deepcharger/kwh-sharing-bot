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
const ImageProcessor = require('./services/ImageProcessor');
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
        this.imageProcessor = new ImageProcessor();
        
        // Bot settings
        this.groupId = process.env.GROUP_ID;
        this.topicId = process.env.TOPIC_ID;
        this.adminUserId = process.env.ADMIN_USER_ID;
        
        this.init();
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
                statsText += `• KWH totali: ${transactionStats.overall.totalKwh || 0}\n`;
                statsText += `• Fatturato: €${(transactionStats.overall.totalRevenue || 0).toFixed(2)}\n\n`;
            }
            
            if (announcementStats) {
                statsText += `📋 **Annunci:**\n`;
                statsText += `• Attivi: ${announcementStats.totalActive || 0}\n`;
                statsText += `• Prezzo medio: €${(announcementStats.avgPrice || 0).toFixed(2)}/KWH\n`;
            }
            
            await ctx.reply(statsText, { parse_mode: 'Markdown' });
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

        // Pending requests command
        this.bot.hears('📥 Richieste pendenti', async (ctx) => {
            const userId = ctx.from.id;
            
            // Get pending transactions where user is seller
            const pendingTransactions = await this.transactionService.getUserTransactions(userId, 'seller');
            const pendingRequests = pendingTransactions.filter(t => t.status === 'pending_seller_confirmation');
            
            if (pendingRequests.length === 0) {
                await ctx.reply('📭 Non hai richieste di acquisto in attesa.', Keyboards.MAIN_MENU);
                return;
            }

            for (const transaction of pendingRequests) {
                // Get buyer info
                const buyer = await this.userService.getUser(transaction.buyerId);
                const buyerUsername = buyer?.username || 'utente';
                
                // Get announcement info
                const announcement = await this.announcementService.getAnnouncement(transaction.announcementId);
                
                const requestText = Messages.formatPurchaseRequest(
                    {
                        ...transaction,
                        buyerUsername
                    },
                    announcement
                ) + `\n\n🔍 ID Transazione: \`${transaction.transactionId}\``;
                
                await ctx.reply(requestText, {
                    parse_mode: 'Markdown',
                    ...Keyboards.getSellerConfirmationKeyboard()
                });
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
                statsText += `• KWH totali: ${(transactionStats.overall.totalKwh || 0).toFixed(1)}\n`;
                statsText += `• Fatturato: €${(transactionStats.overall.totalRevenue || 0).toFixed(2)}\n`;
                statsText += `• KWH medio/transazione: ${(transactionStats.overall.avgKwhPerTransaction || 0).toFixed(1)}\n\n`;
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

        // Back to main menu - FIXED
        this.bot.action('back_to_main', async (ctx) => {
            await ctx.answerCbQuery();
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

        // Transaction-related callbacks
        this.bot.action(/^seller_(accept|reject)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            // Extract transaction ID from previous message if available
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?(T_[^`\s]+)`?/);
            
            if (transactionIdMatch) {
                const transactionId = transactionIdMatch[1];
                ctx.session.transactionId = transactionId;
                return ctx.scene.enter('transactionScene');
            }
            
            await ctx.reply('⚠️ Per gestire questa azione, usa il comando dedicato con l\'ID transazione.');
        });

        // Contact buyer action
        this.bot.action('contact_buyer', async (ctx) => {
            await ctx.answerCbQuery();
            
            // Extract buyer username from the message
            const messageText = ctx.callbackQuery.message.text;
            const buyerMatch = messageText.match(/Acquirente: @(\w+)/);
            
            if (!buyerMatch) {
                await ctx.reply('❌ Non riesco a trovare le informazioni dell\'acquirente.');
                return;
            }
            
            const buyerUsername = buyerMatch[1];
            
            await ctx.reply(
                `💬 **Per contattare l'acquirente:**\n\n` +
                `Puoi scrivere direttamente a @${buyerUsername} su Telegram.\n\n` +
                `📝 **Suggerimenti:**\n` +
                `• Conferma i dettagli della ricarica\n` +
                `• Chiarisci eventuali dubbi\n` +
                `• Coordina l'orario se necessario\n\n` +
                `⚠️ **Ricorda:** Dopo aver chiarito, torna qui per accettare o rifiutare la richiesta.`,
                { parse_mode: 'Markdown' }
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

        // Announcement management callbacks
        this.bot.action(/^view_announcement_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const announcementId = ctx.match[1];
            
            const announcement = await this.announcementService.getAnnouncement(announcementId);
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
                    ...Keyboards.getAnnouncementActionsKeyboard(announcementId)
                }
            );
        });

        this.bot.action(/^delete_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const announcementId = ctx.match[1];
            
            await ctx.editMessageText(
                '⚠️ **Sei sicuro di voler eliminare questo annuncio?**\n\nQuesta azione è irreversibile.',
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getConfirmDeleteKeyboard(announcementId)
                }
            );
        });

        this.bot.action(/^confirm_delete_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const announcementId = ctx.match[1];
            
            const announcement = await this.announcementService.getAnnouncement(announcementId);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.');
                return;
            }
            
            // Delete from database
            const deleted = await this.announcementService.deleteAnnouncement(announcementId, ctx.from.id);
            
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

        this.bot.action(/^cancel_delete_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const announcementId = ctx.match[1];
            
            // Go back to announcement details
            const announcement = await this.announcementService.getAnnouncement(announcementId);
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
                    ...Keyboards.getAnnouncementActionsKeyboard(announcementId)
                }
            );
        });

        this.bot.action(/^stats_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const announcementId = ctx.match[1];
            
            // Get announcement transactions
            const transactions = await this.transactionService.getUserTransactions(ctx.from.id, 'seller');
            const annTransactions = transactions.filter(t => t.announcementId === announcementId);
            
            let statsText = `📊 **STATISTICHE ANNUNCIO**\n\n`;
            statsText += `🆔 ID: ${announcementId}\n\n`;
            statsText += `📈 **Transazioni:**\n`;
            statsText += `• Totali: ${annTransactions.length}\n`;
            statsText += `• Completate: ${annTransactions.filter(t => t.status === 'completed').length}\n`;
            statsText += `• In corso: ${annTransactions.filter(t => !['completed', 'cancelled'].includes(t.status)).length}\n`;
            statsText += `• Annullate: ${annTransactions.filter(t => t.status === 'cancelled').length}\n\n`;
            
            const completedTx = annTransactions.filter(t => t.status === 'completed');
            if (completedTx.length > 0) {
                const totalKwh = completedTx.reduce((sum, t) => sum + (t.actualKwh || 0), 0);
                const totalRevenue = completedTx.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
                
                statsText += `⚡ **KWH venduti:** ${totalKwh.toFixed(1)}\n`;
                statsText += `💰 **Ricavi totali:** €${totalRevenue.toFixed(2)}\n`;
            }
            
            await ctx.editMessageText(statsText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Indietro', callback_data: `view_announcement_${announcementId}` }
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
                    dailyReport += `💰 Fatturato: €${(stats.overall.totalRevenue || 0).toFixed(2)}\n\n`;
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
