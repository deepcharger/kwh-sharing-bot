const { Telegraf, Scenes, session } = require('telegraf');
const mongoose = require('mongoose');
require('dotenv').config();

// Import dei servizi e utils
const BotHandlers = require('./handlers/BotHandlers');
const logger = require('./utils/logger');

// Import delle scene
const sellAnnouncementScene = require('./scenes/SellAnnouncementScene');
const buyEnergyScene = require('./scenes/BuyScene');

// Configurazione
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

if (!BOT_TOKEN) {
    logger.error('BOT_TOKEN non trovato nelle variabili d\'ambiente');
    process.exit(1);
}

if (!MONGODB_URI) {
    logger.error('MONGODB_URI non trovato nelle variabili d\'ambiente');
    process.exit(1);
}

// Inizializza il bot
const bot = new Telegraf(BOT_TOKEN);

// Configura session middleware
bot.use(session({
    defaultSession: () => ({
        announcementData: {},
        buyData: {},
        step: null,
        waitingForKwhAmount: false,
        buyingAnnouncementId: null,
        buyingKwhAmount: null,
        buyingCalculation: null
    })
}));

// Configura stage per le scene
const stage = new Scenes.Stage([
    sellAnnouncementScene,
    buyEnergyScene
]);

bot.use(stage.middleware());

// Middleware per logging
bot.use(async (ctx, next) => {
    const start = Date.now();
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    const messageType = ctx.updateType;
    
    logger.info(`[${userId}:${username}] ${messageType} - START`);
    
    try {
        await next();
        const ms = Date.now() - start;
        logger.info(`[${userId}:${username}] ${messageType} - COMPLETED in ${ms}ms`);
    } catch (error) {
        const ms = Date.now() - start;
        logger.error(`[${userId}:${username}] ${messageType} - ERROR in ${ms}ms:`, error);
        
        // Gestione errori globale
        try {
            if (ctx.updateType === 'callback_query') {
                await ctx.answerCbQuery('❌ Si è verificato un errore');
            }
            await ctx.reply('❌ Si è verificato un errore. Riprova tra qualche minuto.');
        } catch (replyError) {
            logger.error('Errore nell\'invio del messaggio di errore:', replyError);
        }
    }
});

// Middleware per gestire utenti non registrati
bot.use(async (ctx, next) => {
    if (ctx.updateType === 'message' && ctx.message.text === '/start') {
        // Permetti /start sempre
        return next();
    }
    
    // Per tutti gli altri comandi, verifica che l'utente esista
    try {
        const UserService = require('./services/UserService');
        const user = await UserService.getUserById(ctx.from.id);
        
        if (!user) {
            await ctx.reply(
                '👋 **Benvenuto!**\n\nPer usare questo bot devi prima registrarti.\n\nUsa /start per iniziare!',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        return next();
    } catch (error) {
        logger.error('Errore nel middleware utente:', error);
        return next(); // Continua comunque
    }
});

// Inizializza gli handler del bot
const botHandlers = new BotHandlers(bot);
botHandlers.init();

// Handler per errori non gestiti
bot.catch((err, ctx) => {
    logger.error('Errore non gestito nel bot:', err);
    
    try {
        if (ctx.updateType === 'callback_query') {
            ctx.answerCbQuery('❌ Errore imprevisto');
        }
        ctx.reply('❌ Si è verificato un errore imprevisto. Il team è stato notificato.');
    } catch (replyError) {
        logger.error('Errore nell\'invio del messaggio di errore globale:', replyError);
    }
});

// Connessione al database
async function connectToDatabase() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        logger.info('✅ Connesso a MongoDB');
    } catch (error) {
        logger.error('❌ Errore connessione MongoDB:', error);
        process.exit(1);
    }
}

// Gestione eventi MongoDB
mongoose.connection.on('connected', () => {
    logger.info('MongoDB: Connessione stabilita');
});

mongoose.connection.on('error', (err) => {
    logger.error('MongoDB: Errore di connessione:', err);
});

mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB: Connessione persa');
});

// Gestione graceful shutdown
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

async function gracefulShutdown(signal) {
    logger.info(`${signal} ricevuto, iniziando graceful shutdown...`);
    
    try {
        // Ferma il bot
        bot.stop(signal);
        logger.info('Bot fermato');
        
        // Chiudi connessione MongoDB
        await mongoose.connection.close();
        logger.info('Connessione MongoDB chiusa');
        
        process.exit(0);
    } catch (error) {
        logger.error('Errore durante shutdown:', error);
        process.exit(1);
    }
}

// Gestione errori non catturati
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Non uscire per rejection, solo logga
});

// Avvio dell'applicazione
async function startBot() {
    try {
        // Connetti al database
        await connectToDatabase();
        
        // Avvia il bot
        await bot.launch({
            allowedUpdates: ['message', 'callback_query', 'inline_query'],
            dropPendingUpdates: true
        });
        
        logger.info(`🚀 Bot avviato con successo!`);
        logger.info(`📱 Username: @${bot.botInfo.username}`);
        logger.info(`🆔 Bot ID: ${bot.botInfo.id}`);
        
        // Test connessione database
        const stats = await mongoose.connection.db.stats();
        logger.info(`📊 Database stats: ${stats.collections} collections, ${stats.objects} documents`);
        
    } catch (error) {
        logger.error('❌ Errore nell\'avvio del bot:', error);
        process.exit(1);
    }
}

// Avvia il bot
startBot();

// Export per testing
module.exports = { bot, connectToDatabase };
