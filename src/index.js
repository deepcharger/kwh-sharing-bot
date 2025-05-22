const { Telegraf, Scenes, session } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
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
            this.setupWebhook();
            
            console.log('🤖 Bot KWH Sharing inizializzato con successo!');
            
        } catch (error) {
            console.error('❌ Errore durante l\'inizializzazione:', error);
            process.exit(1);
        }
    }

    setupMiddleware() {
        // Session middleware
        this.bot.use(session());
        
        // Scene middleware
        const stage = new Scenes.Stage([
            createSellAnnouncementScene(this),
            createContactSellerScene(this),
            createTransactionScene(this)
        ]);
        this.bot.use(stage.middleware());
        
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

        // My announcements command
        this.bot.hears('📊 I miei annunci', async (ctx) => {
            const userId = ctx.from.id;
            const announcements = await this.announcementService.getUserAnnouncements(userId);
            
            if (announcements.length === 0) {
                await ctx.reply('📭 Non hai ancora pubblicato annunci.', Keyboards.MAIN_MENU);
                return;
            }

            let message = '📊 **I TUOI ANNUNCI ATTIVI:**\n\n';
            for (const ann of announcements) {
                message += `🆔 ${ann.announcementId}\n`;
                message += `💰 ${ann.price}€/KWH\n`;
                message += `📅 Pubblicato: ${ann.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getUserAnnouncementsKeyboard(announcements)
            });
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

        // Back to main menu
        this.bot.action('back_to_main', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                '🏠 **Menu Principale**\n\nSeleziona un\'opzione:',
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.MAIN_MENU
                }
            );
        });

        // Transaction-related callbacks that trigger scenes
        this.bot.action(/^seller_(accept|reject)$/, async (ctx) => {
            // These actions need transaction context, so we need to extract it
            // For now, we'll handle basic responses
            await ctx.answerCbQuery();
            await ctx.reply('⚠️ Per gestire questa azione, usa il comando dedicato con l\'ID transazione.');
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
    }

    setupWebhook() {
        // Setup Express server for webhook
        this.app.use(express.json());
        
        // Health check endpoint
        this.app.get('/', (req, res) => {
            res.json({ 
                status: 'OK', 
                bot: 'KWH Sharing Bot',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });
        
        // Webhook endpoint per Telegram
        this.app.post('/webhook', (req, res) => {
            this.bot.handleUpdate(req.body);
            res.sendStatus(200);
        });
        
        // Error handler
        this.bot.catch((err, ctx) => {
            console.error('Bot error:', err);
            try {
                ctx.reply('❌ Si è verificato un errore. Riprova o contatta l\'admin.');
            } catch (replyError) {
                console.error('Could not send error message:', replyError);
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
                const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook`;
                try {
                    await this.bot.telegram.setWebhook(webhookUrl);
                    console.log(`✅ Webhook configurato: ${webhookUrl}`);
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
