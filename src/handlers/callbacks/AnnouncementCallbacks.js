// src/handlers/callbacks/AnnouncementCallbacks.js - NUOVO FILE
const BaseHandler = require('../base/BaseHandler');
const Keyboards = require('../../utils/keyboards/Keyboards');
const Messages = require('../../utils/messages/Messages');

class AnnouncementCallbacks extends BaseHandler {
    constructor(bot) {
        super(bot);
    }

    /**
     * Main handler method
     */
    async handle(ctx, callbackData) {
        await this.answerCallback(ctx);
        
        // Route to specific handler
        if (callbackData.startsWith('view_ann_')) {
            await this.handleViewAnnouncement(ctx, callbackData);
        } else if (callbackData.startsWith('delete_ann_')) {
            await this.handleDeleteAnnouncement(ctx, callbackData);
        } else if (callbackData.startsWith('extend_ann_')) {
            await this.handleExtendAnnouncement(ctx, callbackData);
        } else if (callbackData.startsWith('refresh_ann_')) {
            await this.handleRefreshAnnouncement(ctx, callbackData);
        } else if (callbackData.startsWith('stats_ann_')) {
            await this.handleAnnouncementStats(ctx, callbackData);
        } else if (callbackData.startsWith('confirm_del_')) {
            await this.handleConfirmDelete(ctx, callbackData);
        } else if (callbackData.startsWith('cancel_del_')) {
            await this.handleCancelDelete(ctx, callbackData);
        }
    }

    /**
     * Handle view announcement
     */
    async handleViewAnnouncement(ctx, callbackData) {
        const shortId = callbackData.replace('view_ann_', '');
        
        const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
        if (!announcement) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Annuncio non trovato.');
            return;
        }
        
        const userStats = await this.services.user.getUserStats(announcement.userId);
        const detailText = await this.services.announcement.formatAnnouncementMessage(
            announcement,
            userStats
        );
        
        // Add expiry info
        let expiryInfo = '';
        if (announcement.expiresAt) {
            const timeRemaining = this.services.announcement.formatTimeRemaining(announcement.expiresAt);
            expiryInfo = `\n\n⏰ **Scade tra:** ${timeRemaining}`;
        }
        
        await this.utils.chatCleaner.editOrReplace(ctx,
            `📋 **DETTAGLI ANNUNCIO**\n\n${detailText}${expiryInfo}`,
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.announcement.getActionsKeyboard(announcement).reply_markup,
                messageType: 'announcement_details'
            }
        );
    }

    /**
     * Handle delete announcement
     */
    async handleDeleteAnnouncement(ctx, callbackData) {
        const shortId = callbackData.replace('delete_ann_', '');
        
        const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
        if (!announcement) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Annuncio non trovato.');
            return;
        }
        
        await ctx.editMessageText(
            '⚠️ **Sei sicuro di voler eliminare questo annuncio?**\n\nQuesta azione è irreversibile.',
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.announcement.getConfirmDeleteKeyboard(announcement.announcementId).reply_markup
            }
        );
    }

    /**
     * Handle extend announcement
     */
    async handleExtendAnnouncement(ctx, callbackData) {
        const match = callbackData.match(/extend_ann_(notify_)?(.+)/);
        const isFromNotification = match[1] === 'notify_';
        const announcementId = match[2];
        
        let announcement;
        if (isFromNotification) {
            announcement = await this.services.announcement.getAnnouncement(announcementId);
        } else {
            const shortId = announcementId;
            announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
        }
        
        if (!announcement) {
            await ctx.reply('❌ Annuncio non trovato.');
            return;
        }
        
        if (announcement.userId !== ctx.from.id) {
            await ctx.reply('❌ Non sei autorizzato.');
            return;
        }
        
        const extended = await this.services.announcement.extendAnnouncement(
            announcement.announcementId,
            ctx.from.id
        );
        
        if (extended) {
            await this.handleExtensionSuccess(ctx, announcement, isFromNotification);
        } else {
            await ctx.editMessageText('❌ Errore nell\'estensione.');
        }
    }

    /**
     * Handle refresh announcement
     */
    async handleRefreshAnnouncement(ctx, callbackData) {
        const shortId = callbackData.replace('refresh_ann_', '');
        
        const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
        if (!announcement) {
            await ctx.editMessageText('❌ Annuncio non trovato.');
            return;
        }
        
        if (!announcement.messageId) {
            await ctx.editMessageText('❌ Questo annuncio non ha un messaggio nel gruppo.');
            return;
        }
        
        // Show loading
        await ctx.editMessageText('🔄 **Aggiornamento timer in corso...**', { parse_mode: 'Markdown' });
        
        const userStats = await this.services.user.getUserStats(announcement.userId);
        const updatedMessage = this.services.announcement.formatAnnouncementForGroup(
            announcement,
            userStats
        );
        
        try {
            await ctx.telegram.editMessageText(
                this.bot.groupId,
                announcement.messageId,
                null,
                updatedMessage,
                {
                    parse_mode: 'Markdown',
                    message_thread_id: parseInt(this.bot.topicId),
                    reply_markup: {
                        inline_keyboard: [[
                            { 
                                text: '🛒 Contatta venditore', 
                                url: `t.me/${process.env.BOT_USERNAME}?start=contact_${announcement.announcementId}` 
                            }
                        ]]
                    }
                }
            );
            
            // Update lastRefreshedAt
            await this.services.announcement.updateAnnouncement(
                announcement.announcementId,
                { lastRefreshedAt: new Date() }
            );
            
            await this.showRefreshSuccess(ctx, announcement, userStats);
            
        } catch (error) {
            console.error('Refresh error:', error);
            await this.showRefreshError(ctx, error, shortId);
        }
    }

    /**
     * Handle announcement stats
     */
    async handleAnnouncementStats(ctx, callbackData) {
        const shortId = callbackData.replace('stats_ann_', '');
        
        const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
        if (!announcement) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Annuncio non trovato.');
            return;
        }
        
        const transactions = await this.services.transaction.getUserTransactions(ctx.from.id, 'seller');
        const annTransactions = transactions.filter(t => t.announcementId === announcement.announcementId);
        
        const statsText = Messages.formatters.announcement.statistics(announcement, annTransactions);
        
        await ctx.editMessageText(statsText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Indietro', callback_data: `view_ann_${shortId}` }
                ]]
            }
        });
    }

    /**
     * Handle confirm delete
     */
    async handleConfirmDelete(ctx, callbackData) {
        const shortId = callbackData.replace('confirm_del_', '');
        
        const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
        if (!announcement) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Annuncio non trovato.');
            return;
        }
        
        const deleted = await this.services.announcement.deleteAnnouncement(announcement.announcementId, ctx.from.id);
        
        if (deleted) {
            if (announcement.messageId) {
                try {
                    await ctx.telegram.deleteMessage(this.bot.groupId, announcement.messageId);
                } catch (error) {
                    console.log('Could not delete announcement from group:', error.description);
                }
            }
            
            await this.utils.chatCleaner.sendConfirmationMessage(ctx, '✅ Annuncio eliminato con successo.');
            
            setTimeout(async () => {
                await this.utils.chatCleaner.resetUserChat(ctx);
            }, 3000);
        } else {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Errore durante l\'eliminazione.');
        }
    }

    /**
     * Handle cancel delete
     */
    async handleCancelDelete(ctx, callbackData) {
        const shortId = callbackData.replace('cancel_del_', '');
        
        const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
        if (!announcement) {
            await this.utils.chatCleaner.sendErrorMessage(ctx, '❌ Annuncio non trovato.');
            return;
        }
        
        const userStats = await this.services.user.getUserStats(announcement.userId);
        const detailText = await this.services.announcement.formatAnnouncementMessage(
            announcement,
            userStats
        );
        
        await ctx.editMessageText(
            `📋 **DETTAGLI ANNUNCIO**\n\n${detailText}`,
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.announcement.getActionsKeyboard(announcement).reply_markup
            }
        );
    }

    // Helper methods

    async handleExtensionSuccess(ctx, announcement, isFromNotification) {
        if (isFromNotification) {
            // Try to auto-update
            let updateSuccess = false;
            
            if (announcement.messageId) {
                try {
                    const userStats = await this.services.user.getUserStats(announcement.userId);
                    const updatedMessage = this.services.announcement.formatAnnouncementForGroup(
                        announcement,
                        userStats
                    );
                    
                    await ctx.telegram.editMessageText(
                        this.bot.groupId,
                        announcement.messageId,
                        null,
                        updatedMessage,
                        {
                            parse_mode: 'Markdown',
                            message_thread_id: parseInt(this.bot.topicId),
                            reply_markup: {
                                inline_keyboard: [[
                                    { 
                                        text: '🛒 Contatta venditore', 
                                        url: `t.me/${process.env.BOT_USERNAME}?start=contact_${announcement.announcementId}` 
                                    }
                                ]]
                            }
                        }
                    );
                    
                    await this.services.announcement.updateAnnouncement(
                        announcement.announcementId,
                        { lastRefreshedAt: new Date() }
                    );
                    
                    updateSuccess = true;
                    
                } catch (error) {
                    console.error('Auto-update failed:', error);
                }
            }
            
            // Show appropriate message
            if (updateSuccess) {
                await ctx.editMessageText(
                    '✅ **ANNUNCIO ESTESO E AGGIORNATO!**\n\n' +
                    'Il tuo annuncio è stato esteso per altre 24 ore e il timer nel gruppo è stato aggiornato.',
                    { parse_mode: 'Markdown' }
                );
            } else {
                await ctx.editMessageText(
                    Messages.templates.announcement.extensionSuccessWithInstructions(),
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📊 Vai ai miei annunci', callback_data: 'my_announcements' }
                            ]]
                        }
                    }
                );
            }
        } else {
            await ctx.reply(
                Messages.templates.announcement.extensionSuccess(announcement),
                { parse_mode: 'Markdown' }
            );
            
            // Update group message if exists
            if (announcement.messageId) {
                await this.updateGroupMessage(ctx, announcement);
            }
        }
    }

    async updateGroupMessage(ctx, announcement) {
        const userStats = await this.services.user.getUserStats(announcement.userId);
        const updatedAnnouncement = await this.services.announcement.getAnnouncement(announcement.announcementId);
        const updatedMessage = this.services.announcement.formatAnnouncementForGroup(
            updatedAnnouncement,
            userStats
        );
        
        try {
            await ctx.telegram.editMessageText(
                this.bot.groupId,
                announcement.messageId,
                null,
                updatedMessage,
                {
                    parse_mode: 'Markdown',
                    message_thread_id: parseInt(this.bot.topicId),
                    reply_markup: {
                        inline_keyboard: [[
                            { 
                                text: '🛒 Contatta venditore', 
                                url: `t.me/${process.env.BOT_USERNAME}?start=contact_${announcement.announcementId}` 
                            }
                        ]]
                    }
                }
            );
        } catch (error) {
            console.error('Error updating extended announcement:', error);
        }
    }

    async showRefreshSuccess(ctx, announcement, userStats) {
        await ctx.editMessageText(
            '✅ **Timer aggiornati!**\n\nIl tuo annuncio nel gruppo ora mostra i timer corretti.',
            { parse_mode: 'Markdown' }
        );
        
        // After 2 seconds, return to announcement details
        setTimeout(async () => {
            const updatedAnn = await this.services.announcement.getAnnouncement(announcement.announcementId);
            const detailText = await this.services.announcement.formatAnnouncementMessage(
                updatedAnn,
                userStats
            );
            
            await ctx.editMessageText(
                `📋 **DETTAGLI ANNUNCIO**\n\n${detailText}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.announcement.getActionsKeyboard(updatedAnn).reply_markup
                }
            );
        }, 2000);
    }

    async showRefreshError(ctx, error, shortId) {
        let errorMsg = '❌ **Impossibile aggiornare**\n\n';
        if (error.description?.includes('message is not modified')) {
            errorMsg = '✅ Il messaggio nel gruppo è già aggiornato!';
        } else {
            errorMsg += 'Il timer verrà aggiornato automaticamente entro 15 minuti.';
        }
        
        await ctx.editMessageText(errorMsg, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Torna ai dettagli', callback_data: `view_ann_${shortId}` }
                ]]
            }
        });
    }
}

module.exports = AnnouncementCallbacks;
