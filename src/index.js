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
        
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Inizializzazione KWH Bot...');
            
            // Initialize database
            await this.initializeDatabase();
            
            // Initialize services
            await this.initializeServices();
            
            // Initialize handlers
            await this.initializeHandlers();
            
            // Setup bot
            await this.setupBot();
            
            // Setup webhook and server
            await this.setupWebhook();
            
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
        // Setup middleware
        this.setupMiddleware();
        
        // Setup scenes
        this.setupScenes();
        
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
        // Session middleware
        this.bot.use(session({
            defaultSession: () => ({}),
            ttl: 6 * 60 * 60 // 6 hours
        }));
        
        // Scene middleware
        const stage = new Scenes.Stage([
            createSellAnnouncementScene(this),
            createContactSellerScene(this),
            createTransactionScene(this)
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
        // Scenes are created in separate files and passed to stage in setupMiddleware
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

    async setupWebhook() {
        await this.webhookHandler.setupWebhook();
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
            'completed': '✅',
            'cancelled': '❌',
            'disputed': '⚠️'
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
            'completed': 'Completata',
            'cancelled': 'Annullata',
            'disputed': 'In disputa'
        };
        return statusTexts[status] || status;
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
