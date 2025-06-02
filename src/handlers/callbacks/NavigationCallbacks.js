// src/handlers/callbacks/NavigationCallbacks.js - NUOVO FILE
const BaseHandler = require('../base/BaseHandler');
const Keyboards = require('../../utils/keyboards/Keyboards');
const Messages = require('../../utils/messages/Messages');
const MarkdownEscape = require('../../utils/MarkdownEscape');
const { TRANSACTION_STATUS } = require('../../config/constants');

class NavigationCallbacks extends BaseHandler {
    constructor(bot) {
        super(bot);
        this.callbackCount = 0;
    }

    /**
     * Main handler method
     */
    async handle(ctx, callbackData) {
        this.callbackCount++;
        
        // Answer callback immediately
        await this.answerCallback(ctx);
        
        // Route to specific handler
        if (callbackData === 'back_to_main') {
            await this.handleBackToMain(ctx);
        } else if (callbackData === 'back_to_txs') {
            await this.handleBackToTransactions(ctx);
        } else if (callbackData === 'my_announcements') {
            await this.handleMyAnnouncements(ctx);
        } else if (callbackData === 'tx_history') {
            await this.handleTransactionHistory(ctx);
        } else if (callbackData.startsWith('view_tx_detail_')) {
            await this.handleViewTransactionDetail(ctx, callbackData);
        } else if (callbackData === 'buy_energy') {
            await this.handleBuyEnergy(ctx);
        } else if (callbackData.startsWith('view_offer_')) {
            await this.handleViewOffer(ctx, callbackData);
        } else if (callbackData.startsWith('buy_from_')) {
            await this.handleBuyFrom(ctx, callbackData);
        } else if (callbackData === 'sell_energy') {
            await this.handleSellEnergy(ctx);
        } else if (callbackData === 'dismiss_notification') {
            await this.handleDismissNotification(ctx);
        }
    }

    /**
     * Handle back to main menu
     */
    async handleBackToMain(ctx) {
        // Leave any active scene
        if (ctx.scene) {
            await ctx.scene.leave();
        }
        
        // Clean up and show main menu
        await this.utils.chatCleaner.resetUserChat(ctx);
    }

    /**
     * Handle back to transactions
     */
    async handleBackToTransactions(ctx) {
        const userId = ctx.from.id;
        
        const allTransactions = await this.services.transaction.getUserTransactions(userId, 'all');
        const pending = allTransactions.filter(t => 
            ![TRANSACTION_STATUS.COMPLETED, TRANSACTION_STATUS.CANCELLED].includes(t.status)
        );
        const completed = allTransactions.filter(t => t.status === TRANSACTION_STATUS.COMPLETED);

        let message = Messages.formatters.transaction.listHeader(pending.length, completed.length);
        
        if (pending.length > 0) {
            message += Messages.formatters.transaction.pendingList(
                pending.slice(0, 5),
                this.bot.getStatusEmoji.bind(this.bot),
                this.bot.getStatusText.bind(this.bot)
            );
        }
        
        await this.utils.chatCleaner.editOrReplace(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.transaction.getListKeyboard(pending, completed).reply_markup,
            messageType: 'navigation'
        });
    }

    /**
     * Handle my announcements
     */
    async handleMyAnnouncements(ctx) {
        const userId = ctx.from.id;
        const announcements = await this.services.announcement.getUserAnnouncements(userId);
        
        if (announcements.length === 0) {
            await this.utils.chatCleaner.sendTemporaryMessage(
                ctx, 
                '📭 Non hai ancora pubblicato annunci.',
                {},
                3000
            );
            
            setTimeout(async () => {
                await this.utils.chatCleaner.resetUserChat(ctx);
            }, 3000);
            return;
        }

        const message = Messages.formatters.announcement.userList(announcements, this.services.announcement);
        
        await this.utils.chatCleaner.editOrReplace(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.announcement.getUserListKeyboard(announcements).reply_markup,
            messageType: 'navigation'
        });
    }

    /**
     * Handle transaction history
     */
    async handleTransactionHistory(ctx) {
        const userId = ctx.from.id;
        
        const transactions = await this.services.transaction.getUserTransactions(userId, 'all');
        const completed = transactions.filter(t => t.status === TRANSACTION_STATUS.COMPLETED);
        const cancelled = transactions.filter(t => t.status === TRANSACTION_STATUS.CANCELLED);
        
        let message = '📜 **CRONOLOGIA TRANSAZIONI**\n\n';
        const keyboard = [];
        
        // Add completed transactions
        if (completed.length > 0) {
            message += Messages.formatters.transaction.historySection(
                'COMPLETATE',
                completed.slice(-10).reverse(),
                userId,
                (shortId, transactionId) => this.utils.transactionCache.set(shortId, transactionId)
            );
            
            // Add buttons for completed transactions
            completed.slice(-10).reverse().forEach(tx => {
                const shortId = tx.transactionId.slice(-10);
                const date = tx.completedAt || tx.createdAt;
                const kwh = tx.declaredKwh || tx.actualKwh || '?';
                const role = tx.sellerId === userId ? '📤' : '📥';
                
                keyboard.push([{
                    text: `${role} ${date.toLocaleDateString('it-IT')} - ${kwh} KWH`,
                    callback_data: `view_tx_detail_${shortId}`
                }]);
            });
        }
        
        // Add cancelled transactions
        if (cancelled.length > 0) {
            message += Messages.formatters.transaction.cancelledSection(
                cancelled.slice(-5).reverse(),
                (shortId, transactionId) => this.utils.transactionCache.set(shortId, transactionId)
            );
            
            // Add buttons for cancelled transactions
            cancelled.slice(-5).reverse().forEach(tx => {
                const shortId = tx.transactionId.slice(-10);
                const date = tx.createdAt;
                const reason = tx.cancellationReason ? ' - ' + tx.cancellationReason.substring(0, 20) : '';
                
                keyboard.push([{
                    text: `❌ ${date.toLocaleDateString('it-IT')}${reason}`,
                    callback_data: `view_tx_detail_${shortId}`
                }]);
            });
        }
        
        if (completed.length === 0 && cancelled.length === 0) {
            message += '_Nessuna transazione nella cronologia_';
        }
        
        keyboard.push([{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]);
        
        await this.utils.chatCleaner.editOrReplace(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard },
            messageType: 'navigation'
        });
    }

    /**
     * Handle view transaction detail
     */
    async handleViewTransactionDetail(ctx, callbackData) {
        const shortId = callbackData.replace('view_tx_detail_', '');
        
        const transaction = await this.bot.findTransactionByShortId(shortId, ctx.from.id);
        if (!transaction) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
            return;
        }
        
        const announcement = await this.services.announcement.getAnnouncement(transaction.announcementId);
        const userId = ctx.from.id;
        const isSeller = userId === transaction.sellerId;
        
        const detailText = await Messages.formatters.transaction.fullDetails(
            transaction,
            announcement,
            isSeller,
            this.bot.getStatusText.bind(this.bot)
        );
        
        // Check for missing feedback
        const feedbacks = await this.db.getCollection('feedback')
            .find({ 
                transactionId: transaction.transactionId,
                fromUserId: userId
            }).toArray();
        
        const keyboard = [];
        
        if (feedbacks.length === 0 && transaction.status === TRANSACTION_STATUS.COMPLETED) {
            keyboard.push([{ 
                text: '⭐ Lascia feedback', 
                callback_data: `feedback_tx_${transaction.transactionId}` 
            }]);
        }
        
        keyboard.push([{ text: '🔙 Torna alla cronologia', callback_data: 'tx_history' }]);
        keyboard.push([{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]);
        
        await ctx.editMessageText(detailText, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    /**
     * Handle buy energy
     */
    async handleBuyEnergy(ctx) {
        const announcements = await this.services.announcement.getActiveAnnouncements(20);
        
        if (announcements.length === 0) {
            await ctx.editMessageText(
                '📭 **NESSUNA OFFERTA DISPONIBILE**\n\nNon ci sono offerte al momento.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔋 Vendi tu energia', callback_data: 'sell_energy' }],
                            [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );
            return;
        }

        const keyboard = [];
        
        for (const ann of announcements) {
            // Skip own announcements
            if (ann.userId === ctx.from.id || (ann.userId.userId && ann.userId.userId === ctx.from.id)) continue;

            const buttonText = Messages.formatters.announcement.buttonText(ann);
            const shortId = this.utils.transactionCache.TransactionCache.generateShortId(ann.announcementId);
            this.utils.transactionCache.setAnnouncement(shortId, ann.announcementId);

            keyboard.push([{
                text: buttonText,
                callback_data: `view_offer_${shortId}`
            }]);
        }

        if (keyboard.length === 0) {
            await ctx.editMessageText(
                '📭 **Nessuna offerta disponibile per te**\n\nTutti gli annunci sono tuoi.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );
            return;
        }

        keyboard.push([{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]);

        await ctx.editMessageText(
            '🛒 **OFFERTE DISPONIBILI**\n\nSeleziona un\'offerta per i dettagli:',
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            }
        );
    }

    /**
     * Handle view offer
     */
    async handleViewOffer(ctx, callbackData) {
        const shortId = callbackData.replace('view_offer_', '');
        const announcementId = this.utils.transactionCache.getAnnouncement(shortId);
        
        const announcement = await this.services.announcement.getAnnouncement(announcementId);
        if (!announcement) {
            await ctx.editMessageText('❌ Offerta non trovata.');
            return;
        }

        const userStats = await this.services.user.getUserStats(announcement.userId);
        
        let message = await this.services.announcement.formatAnnouncementMessage(
            announcement,
            userStats
        );

        // Add price examples
        message += '\n\n' + Messages.formatPriceExamples(announcement);

        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🛒 Procedi con l\'acquisto', callback_data: `buy_from_${shortId}` }],
                    [{ text: '🔙 Torna alle offerte', callback_data: 'buy_energy' }]
                ]
            }
        });
    }

    /**
     * Handle buy from announcement
     */
    async handleBuyFrom(ctx, callbackData) {
        const shortId = callbackData.replace('buy_from_', '');
        const announcementId = this.utils.transactionCache.getAnnouncement(shortId);
        
        ctx.session.announcementId = announcementId;
        await ctx.scene.enter('contactSellerScene');
    }

    /**
     * Handle sell energy
     */
    async handleSellEnergy(ctx) {
        await ctx.scene.enter('sellAnnouncementScene');
    }

    /**
     * Handle dismiss notification
     */
    async handleDismissNotification(ctx) {
        await ctx.deleteMessage();
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            callbackCount: this.callbackCount
        };
    }
}

module.exports = NavigationCallbacks;
