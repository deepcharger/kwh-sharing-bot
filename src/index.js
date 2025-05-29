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

// Import handlers
const CommandHandler = require('./handlers/CommandHandler');
const CallbackHandler = require('./handlers/CallbackHandler');
const MessageHandler = require('./handlers/MessageHandler');
const CronJobHandler = require('./handlers/CronJobHandler');
const WebhookHandler = require('./handlers/WebhookHandler');

// Import scenes
const { createSellAnnouncementScene } = require('./scenes/SellAnnouncementScene');
const { createContactSellerScene } = require('./scenes/ContactSellerScene');
const { createTransactionScene } = require('./scenes/TransactionScene');

// Import utilities
const Keyboards = require('./utils/Keyboards');
const Messages = require('./utils/Messages');
const { TransactionCache } = require('./utils/TransactionCache');
const ChatCleaner = require('./utils/ChatCleaner');
const MarkdownEscape = require('./utils/MarkdownEscape');

class KwhBot {
    constructor() {
        this.bot = new Telegraf(process.env.BOT_TOKEN);
        this.app = express();
        this.db = null;
        
        // Services
        this.userService = null;
        this.announcementService = null;
        this.transactionService = null;
        
        // Handlers
        this.commandHandler = null;
        this.callbackHandler = null;
        this.messageHandler = null;
        this.cronJobHandler = null;
        this.webhookHandler = null;
        
        // Bot settings
        this.groupId = process.env.GROUP_ID;
        this.topicId = process.env.TOPIC_ID;
        this.adminUserId = process.env.ADMIN_USER_ID;
        
        // Cache per ID transazioni
        this.transactionCache = new TransactionCache();
        
        // Chat cleaner per mantenere chat pulite
        this.chatCleaner = null;
        
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Inizializzazione KWH Bot...');
            
            // Initialize database
            await this.initializeDatabase();
            
            // Initialize services
            await this.initializeServices();
            
            // Initialize chat cleaner
            this.chatCleaner = new ChatCleaner(this);
            
            // Initialize handlers
            await this.initializeHandlers();
            
            // Setup bot
            await this.setupBot();
            
            // Setup webhook and server
            await this.setupWebhook();
            
            // Setup cleanup jobs
            this.setupCleanupJobs();
            
            console.log('✅ Bot KWH Sharing inizializzato con successo!');
            
        } catch (error) {
            console.error('❌ Errore durante l\'inizializzazione:', error);
            process.exit(1);
        }
    }

    async initializeDatabase() {
        this.db = new Database(process.env.MONGODB_URI);
        await this.db.connect();
    }

    async initializeServices() {
        this.userService = new UserService(this.db);
        this.announcementService = new AnnouncementService(this.db);
        this.transactionService = new TransactionService(this.db);
    }

    async initializeHandlers() {
        // Initialize handlers with bot context
        this.commandHandler = new CommandHandler(this);
        this.callbackHandler = new CallbackHandler(this);
        this.messageHandler = new MessageHandler(this);
        this.cronJobHandler = new CronJobHandler(this);
        this.webhookHandler = new WebhookHandler(this);
    }

    async setupBot() {
        // Setup middleware (ORDINE IMPORTANTE!)
        this.setupMiddleware();
        
        // Setup handlers
        this.commandHandler.setupCommands();
        this.callbackHandler.setupCallbacks();
        this.messageHandler.setupMessageHandlers();
        
        // Setup cron jobs
        this.cronJobHandler.setupCronJobs();
        
        // Setup bot commands
        await this.setupBotCommands();
        
        // Error handling
        this.bot.catch((err, ctx) => {
            console.error('Bot error:', err);
            if (ctx?.reply) {
                ctx.reply('❌ Si è verificato un errore. Riprova o contatta l\'admin.')
                    .catch(() => console.error('Could not send error message'));
            }
        });
    }

    setupMiddleware() {
        // IMPORTANTE: Session middleware DEVE venire PRIMA delle scene
        this.bot.use(session({
            defaultSession: () => ({}),
            ttl: 6 * 60 * 60 // 6 hours
        }));
        
        // Crea le scene passando 'this' (il bot completo)
        const sellAnnouncementScene = createSellAnnouncementScene(this);
        const contactSellerScene = createContactSellerScene(this);
        const transactionScene = createTransactionScene(this);
        
        // Scene middleware - Stage DOPO session
        const stage = new Scenes.Stage([
            sellAnnouncementScene,
            contactSellerScene,
            transactionScene
        ]);
        
        this.bot.use(stage.middleware());
        
        // Logging middleware
        this.bot.use(async (ctx, next) => {
            const start = Date.now();
            await next();
            const ms = Date.now() - start;
            console.log(`Response time: ${ms}ms`);
        });
        
        // User verification middleware
        this.bot.use(async (ctx, next) => {
            if (ctx.chat?.type === 'private') {
                const userId = ctx.from.id;
                
                // Per ora tutti possono usare il bot
                // In futuro si può aggiungere verifica membership gruppo
                
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
            if (ctx.chat?.id == this.groupId && ctx.message?.message_thread_id == this.topicId) {
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

    async setupBotCommands() {
        try {
            const commands = [
                { command: 'start', description: 'Avvia il bot e mostra il menu principale' },
                { command: 'menu', description: 'Mostra il menu principale' },
                { command: 'help', description: 'Mostra la guida completa del bot' },
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

    async setupWebhook() {
        await this.webhookHandler.setupWebhook();
    }

    setupCleanupJobs() {
        // Pulizia messaggi vecchi ogni ora
        cron.schedule('0 * * * *', () => {
            this.chatCleaner.cleanupOldMessages();
            console.log('🧹 Pulizia messaggi vecchi completata');
        });

        // Pulizia profonda ogni giorno alle 3:00
        cron.schedule('0 3 * * *', () => {
            this.chatCleaner.deepCleanup();
            console.log('🧹 Pulizia profonda completata');
        });

        console.log('✅ Chat cleanup jobs configurati');
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

    // Helper methods for transaction cache
    cacheTransactionId(shortId, fullId) {
        this.transactionCache.set(shortId, fullId);
    }

    getFullTransactionId(shortId) {
        return this.transactionCache.get(shortId);
    }

    async findTransactionByShortId(shortId, userId) {
        return await this.transactionCache.findTransactionByShortId(shortId, userId, this.transactionService);
    }

    async findAnnouncementByShortId(shortId, userId) {
        return await this.transactionCache.findAnnouncementByShortId(shortId, userId, this.announcementService);
    }

    // Helper methods for UI formatting
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
            'payment_declared': '💰',
            'completed': '✅',
            'cancelled': '❌',
            'disputed': '⚠️',
            'buyer_arrived': '📍'
        };
        return statusEmojis[status] || '❓';
    }

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
            'payment_declared': 'Pagamento dichiarato',
            'completed': 'Completata',
            'cancelled': 'Annullata',
            'disputed': 'In disputa',
            'buyer_arrived': 'Acquirente arrivato'
        };
        return statusTexts[status] || status;
    }

    // FIX: Metodo aggiornato per formattare dettagli transazione
    formatTransactionDetails(transaction, announcement, currentUserId) {
        const isSeller = currentUserId === transaction.sellerId;
        const role = isSeller ? 'VENDITORE' : 'ACQUIRENTE';
        
        const statusText = this.getStatusText(transaction.status);
        const statusEmoji = this.getStatusEmoji(transaction.status);
        
        // Usa MarkdownEscape per formattare correttamente
        let details = MarkdownEscape.formatTransactionDetails(transaction, role, statusText, statusEmoji);
        
        if (transaction.declaredKwh) {
            details += `⚡ KWH dichiarati: ${transaction.declaredKwh}\n`;
            if (announcement) {
                const price = announcement.price || announcement.basePrice;
                const amount = (transaction.declaredKwh * price).toFixed(2);
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
                    details += `Metodi: ${MarkdownEscape.escape(announcement?.paymentMethods || 'Come concordato')}`;
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
}

// Graceful shutdown
process.once('SIGINT', () => {
    if (global.kwhBot) {
        global.kwhBot.stop('SIGINT');
    }
});

process.once('SIGTERM', () => {
    if (global.kwhBot) {
        global.kwhBot.stop('SIGTERM');
    }
});

// Start the bot
const bot = new KwhBot();
global.kwhBot = bot;
