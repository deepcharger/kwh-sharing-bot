// src/handlers/commands/CommandHandler.js - NUOVO FILE (sostituisce il vecchio)
const BaseHandler = require('../base/BaseHandler');
const Messages = require('../../utils/messages/Messages');
const Keyboards = require('../../utils/keyboards/Keyboards');
const MarkdownEscape = require('../../utils/MarkdownEscape');
const { TRANSACTION_STATUS } = require('../../config/constants');

class CommandHandler extends BaseHandler {
    constructor(bot) {
        super(bot);
    }

    /**
     * Setup all command handlers
     */
    async setup() {
        console.log('🔧 Setting up command handlers...');
        
        // Start command
        this.bot.bot.start(async (ctx) => await this.handleStart(ctx));
        
        // Menu command
        this.bot.bot.command('menu', async (ctx) => await this.handleMenu(ctx));
        
        // Help command
        this.bot.bot.command('help', async (ctx) => await this.handleHelp(ctx));
        
        // Admin command
        this.bot.bot.command('admin', async (ctx) => await this.handleAdmin(ctx));
        
        // Stats command
        this.bot.bot.command('stats', async (ctx) => await this.handleStats(ctx));
        
        // Feedback mancanti command
        this.bot.bot.command('feedback_mancanti', async (ctx) => await this.handleMissingFeedback(ctx));
        
        // Pagamenti command
        this.bot.bot.command('pagamenti', async (ctx) => await this.handlePayments(ctx));
        
        // Text menu handlers
        this.setupTextHandlers();
        
        // Transaction ID quick access
        this.setupTransactionIdHandler();
        
        console.log('✅ Command handlers setup completed');
    }

    /**
     * Handle /start command
     */
    async handleStart(ctx) {
        const userId = ctx.from.id;
        
        // Register/update user
        await this.services.user.upsertUser({
            userId: ctx.from.id,
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name
        });
        
        // Check for deep link
        const startPayload = ctx.message.text.split(' ')[1];
        
        if (startPayload && startPayload.startsWith('contact_')) {
            await this.handleContactDeepLink(ctx, startPayload);
            return;
        }
        
        // Normal start
        await this.utils.chatCleaner.cleanupUserMessages(ctx, ['temporary', 'navigation']);
        
        await ctx.reply(Messages.WELCOME, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.MAIN_MENU.reply_markup
        });
    }

    /**
     * Handle contact deep link
     */
    async handleContactDeepLink(ctx, payload) {
        const announcementId = payload.replace('contact_', '');
        
        const announcement = await this.services.announcement.getAnnouncement(announcementId);
        
        if (!announcement || !announcement.active) {
            await ctx.reply('❌ Annuncio non trovato o non più disponibile.', Keyboards.MAIN_MENU);
            return;
        }
        
        if (announcement.userId === ctx.from.id) {
            await ctx.reply('❌ Non puoi acquistare dal tuo stesso annuncio!', Keyboards.MAIN_MENU);
            return;
        }
        
        ctx.session.announcementId = announcementId;
        await ctx.scene.enter('contactSellerScene');
    }

    /**
     * Handle /menu command
     */
    async handleMenu(ctx) {
        await ctx.reply(
            '🏠 **Menu Principale**\n\nSeleziona un\'opzione:',
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.MAIN_MENU.reply_markup
            }
        );
    }

    /**
     * Handle /help command
     */
    async handleHelp(ctx) {
        await this.utils.chatCleaner.replaceMessage(ctx, Messages.HELP_TEXT, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.help.getHelpKeyboard().reply_markup,
            messageType: 'help'
        });
    }

    /**
     * Handle /admin command
     */
    async handleAdmin(ctx) {
        if (ctx.from.id != this.bot.adminUserId) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Non autorizzato.');
            return;
        }
        
        await this.utils.chatCleaner.replaceMessage(ctx,
            '👨‍⚖️ **DASHBOARD ADMIN**\n\nSeleziona un\'opzione:',
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.admin.getDashboardKeyboard().reply_markup,
                messageType: 'admin'
            }
        );
    }

    /**
     * Handle /stats command
     */
    async handleStats(ctx) {
        if (ctx.from.id != this.bot.adminUserId) return;
        
        const stats = await this.services.transaction.getTransactionStats();
        const announcementStats = await this.services.announcement.getAnnouncementStats();
        
        const statsText = Messages.formatters.admin.generalStats(stats, announcementStats);
        
        await this.utils.chatCleaner.replaceMessage(ctx, statsText, { 
            parse_mode: 'Markdown',
            messageType: 'admin'
        });
    }

    /**
     * Handle /feedback_mancanti command
     */
    async handleMissingFeedback(ctx) {
        const userId = ctx.from.id;
        
        const transactions = await this.services.transaction.getUserTransactions(userId, 'all');
        const completedTransactions = transactions.filter(t => t.status === TRANSACTION_STATUS.COMPLETED);
        
        const missingFeedback = [];
        for (const tx of completedTransactions) {
            const feedbacks = await this.db.getCollection('feedback')
                .find({ 
                    transactionId: tx.transactionId,
                    fromUserId: userId
                }).toArray();
                
            if (feedbacks.length === 0) {
                missingFeedback.push(tx);
            }
        }
        
        if (missingFeedback.length === 0) {
            await ctx.reply(
                Messages.templates.feedback.noMissingFeedback(),
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.MAIN_MENU.reply_markup
                }
            );
            return;
        }
        
        const message = Messages.formatters.feedback.missingList(missingFeedback, userId);
        const keyboard = Keyboards.feedback.getMissingListKeyboard(missingFeedback, userId);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Handle /pagamenti command
     */
    async handlePayments(ctx) {
        const userId = ctx.from.id;
        
        const transactions = await this.services.transaction.getUserTransactions(userId, 'all');
        const paymentPending = transactions.filter(t => 
            t.status === TRANSACTION_STATUS.PAYMENT_REQUESTED && t.buyerId === userId
        );
        
        if (paymentPending.length === 0) {
            await this.utils.chatCleaner.sendTemporaryMessage(ctx,
                '✅ Non hai pagamenti in sospeso.',
                {},
                3000
            );
            
            setTimeout(async () => {
                await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
            }, 3000);
            return;
        }
        
        const announcements = await Promise.all(
            paymentPending.map(tx => 
                this.services.announcement.getAnnouncement(tx.announcementId)
            )
        );
        
        const { message, keyboard } = await Messages.formatters.payment.pendingList(
            paymentPending,
            announcements,
            ctx.session
        );
        
        await this.utils.chatCleaner.replaceMessage(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
            messageType: 'payment'
        });
    }

    /**
     * Setup text handlers for menu buttons
     */
    setupTextHandlers() {
        // Vendi KWH
        this.bot.bot.hears('🔋 Vendi KWH', async (ctx) => {
            await ctx.scene.enter('sellAnnouncementScene');
        });

        // Compra KWH
        this.bot.bot.hears('🛒 Compra KWH', async (ctx) => {
            await ctx.reply(
                Messages.templates.navigation.buyEnergyInfo(),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🛒 Vedi offerte disponibili', callback_data: 'buy_energy' }],
                            [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );
        });

        // I miei annunci
        this.bot.bot.hears('📊 I miei annunci', async (ctx) => {
            await this.handleMyAnnouncements(ctx);
        });

        // Le mie transazioni
        this.bot.bot.hears('💼 Le mie transazioni', async (ctx) => {
            await this.handleMyTransactions(ctx);
        });

        // Richieste pendenti
        this.bot.bot.hears('📥 Richieste pendenti', async (ctx) => {
            await this.handlePendingRequests(ctx);
        });

        // I miei feedback
        this.bot.bot.hears('⭐ I miei feedback', async (ctx) => {
            await this.handleMyFeedback(ctx);
        });

        // Aiuto
        this.bot.bot.hears('❓ Aiuto', async (ctx) => {
            await this.handleHelp(ctx);
        });
    }

    /**
     * Setup transaction ID quick access handler
     */
    setupTransactionIdHandler() {
        this.bot.bot.hears(/[TA][\d\w_-]+/, async (ctx) => {
            const transactionId = ctx.message.text.match(/([TA][\d\w_-]+)/)[1];
            const userId = ctx.from.id;
            
            const transaction = await this.services.transaction.getTransaction(transactionId);
            
            if (!transaction) {
                await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
                return;
            }
            
            if (transaction.sellerId !== userId && transaction.buyerId !== userId) {
                await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Non autorizzato.');
                return;
            }
            
            ctx.session.transactionId = transactionId;
            await this.utils.chatCleaner.enterScene(ctx, 'transactionScene');
        });
    }

    // Handler methods for text menu

    async handleMyAnnouncements(ctx) {
        const userId = ctx.from.id;
        const announcements = await this.services.announcement.getUserAnnouncements(userId);
        
        if (announcements.length === 0) {
            await this.utils.chatCleaner.sendTemporaryMessage(ctx,
                '📭 Non hai ancora pubblicato annunci.',
                {},
                3000
            );
            
            setTimeout(async () => {
                await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
            }, 3000);
            return;
        }

        const message = Messages.formatters.announcement.userList(announcements, this.services.announcement);
        
        await this.utils.chatCleaner.replaceMessage(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.announcement.getUserListKeyboard(announcements).reply_markup,
            messageType: 'navigation'
        });
    }

    async handleMyTransactions(ctx) {
        const userId = ctx.from.id;
        const transactions = await this.services.transaction.getUserTransactions(userId, 'all');
        
        if (transactions.length === 0) {
            await this.utils.chatCleaner.sendTemporaryMessage(ctx,
                '📭 Non hai ancora transazioni.',
                {},
                3000
            );
            
            setTimeout(async () => {
                await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
            }, 3000);
            return;
        }

        const pending = transactions.filter(t => 
            ![TRANSACTION_STATUS.COMPLETED, TRANSACTION_STATUS.CANCELLED].includes(t.status)
        );
        const completed = transactions.filter(t => t.status === TRANSACTION_STATUS.COMPLETED);

        const message = Messages.formatters.transaction.listHeader(pending.length, completed.length);
        
        await this.utils.chatCleaner.replaceMessage(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.transaction.getListKeyboard(pending, completed).reply_markup,
            messageType: 'navigation'
        });
    }

    async handlePendingRequests(ctx) {
        const userId = ctx.from.id;
        const pendingTransactions = await this.services.transaction.getUserTransactions(userId, 'seller');
        const pendingRequests = pendingTransactions.filter(t => t.status === TRANSACTION_STATUS.PENDING_SELLER);
        
        if (pendingRequests.length === 0) {
            await this.utils.chatCleaner.sendTemporaryMessage(ctx,
                '📭 Non hai richieste di acquisto in attesa.',
                {},
                3000
            );
            
            setTimeout(async () => {
                await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
            }, 3000);
            return;
        }

        await this.utils.chatCleaner.cleanupUserMessages(ctx, ['temporary', 'navigation']);

        for (const transaction of pendingRequests) {
            const buyer = await this.services.user.getUser(transaction.buyerId);
            const announcement = await this.services.announcement.getAnnouncement(transaction.announcementId);
            
            const requestText = MarkdownEscape.formatPurchaseRequest({
                username: buyer?.username,
                firstName: buyer?.firstName,
                scheduledDate: transaction.scheduledDate,
                brand: transaction.brand,
                currentType: transaction.currentType,
                location: transaction.location,
                connector: transaction.connector,
                transactionId: transaction.transactionId
            });
            
            const keyboard = Keyboards.transaction.getRequestKeyboard(transaction, buyer);
            
            await this.utils.chatCleaner.sendPersistentMessage(ctx, requestText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async handleMyFeedback(ctx) {
        const userId = ctx.from.id;
        const userStats = await this.services.user.getUserStats(userId);
        
        const message = Messages.formatUserStats(userStats);
        
        await this.utils.chatCleaner.replaceMessage(ctx, message, {
            parse_mode: 'Markdown',
            messageType: 'stats'
        });
    }
}

module.exports = CommandHandler;
