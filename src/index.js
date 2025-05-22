const { Telegraf, Scenes, session } = require('telegraf');
const { MongoClient } = require('mongodb');
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
            
            await ctx.reply(Messages.WELCOME, Keyboards.MAIN_MENU);
        });

        // Help command
        this.bot.command('help', async (ctx) => {
            await ctx.reply(Messages.HELP_TEXT);
        });

        // My announcements command
        this.bot.hears('📊 I miei annunci', async (ctx) => {
            const userId = ctx.from.id;
            const announcements = await this.announcementService.getUserAnnouncements(userId);
            
            if (announcements.length === 0) {
                await ctx.reply('📭 Non hai ancora pubblicato annunci.');
                return;
            }

            let message = '📊 **I TUOI ANNUNCI ATTIVI:**\n\n';
            for (const ann of announcements) {
                message += `🆔 ${ann.announcementId}\n`;
                message += `💰 ${ann.price}€/KWH\n`;
                message += `📅 Pubblicato: ${ann.createdAt.
