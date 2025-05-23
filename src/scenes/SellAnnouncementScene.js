const { Scenes } = require('telegraf');
const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

function createSellAnnouncementScene(bot) {
    const scene = new Scenes.BaseScene('sellAnnouncementScene');

    // Enter scene
    scene.enter(async (ctx) => {
        ctx.session.announcementData = {};
        await ctx.reply(Messages.SELL_START, Keyboards.CANCEL_ONLY);
    });

    // Step 1: Price input
    scene.on('text', async (ctx) => {
        const text = ctx.message.text;
        
        if (text === '❌ Annulla') {
            await ctx.reply('❌ Creazione annuncio annullata.', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        if (!ctx.session.announcementData.price) {
            const price = parseFloat(text.replace(',', '.'));
            
            if (isNaN(price) || price <= 0 || price > 2) {
                await ctx.reply(Messages.ERROR_MESSAGES.INVALID_PRICE);
                return;
            }

            ctx.session.announcementData.price = price;
            await ctx.reply(Messages.SELL_CURRENT_TYPE, Keyboards.getCurrentTypeKeyboard());
            return;
        }

        if (!ctx.session.announcementData.zones) {
            ctx.session.announcementData.zones = text.trim();
            await ctx.reply(Messages.SELL_NETWORKS, Keyboards.getNetworksKeyboard());
            return;
        }

        if (ctx.session.announcementData.networks === 'specific' && !ctx.session.announcementData.networksList) {
            const networks = text.split('\n').map(n => n.trim()).filter(n => n.length > 0);
            ctx.session.announcementData.networksList = networks;
            await ctx.reply(Messages.SELL_AVAILABILITY, Keyboards.CANCEL_ONLY);
            return;
        }

        if (!ctx.session.announcementData.availability) {
            ctx.session.announcementData.availability = text.trim();
            await ctx.reply(Messages.SELL_PAYMENT, Keyboards.CANCEL_ONLY);
            return;
        }

        if (!ctx.session.announcementData.paymentMethods) {
            ctx.session.announcementData.paymentMethods = text.trim();
            await ctx.reply(Messages.SELL_CONDITIONS, Keyboards.CANCEL_ONLY);
            return;
        }

        if (!ctx.session.announcementData.conditions) {
            if (text === '/skip') {
                ctx.session.announcementData.conditions = '';
            } else {
                ctx.session.announcementData.conditions = text.trim();
            }
            
            // Show preview
            await showAnnouncementPreview(ctx);
            return;
        }
    });

    // Current type selection
    scene.action(/^current_(.+)$/, async (ctx) => {
        const currentType = ctx.match[1];
        
        if (currentType === 'cancel') {
            await ctx.answerCbQuery();
            await ctx.editMessageText('❌ Creazione annuncio annullata.', { reply_markup: undefined });
            await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        ctx.session.announcementData.currentType = currentType;
        await ctx.answerCbQuery();
        await ctx.editMessageText(Messages.SELL_ZONES, { reply_markup: undefined });
    });

    // Networks selection
    scene.action(/^networks_(.+)$/, async (ctx) => {
        const networksType = ctx.match[1];
        
        ctx.session.announcementData.networks = networksType;
        await ctx.answerCbQuery();

        if (networksType === 'all') {
            ctx.session.announcementData.networksList = ['TUTTE LE COLONNINE'];
            await ctx.editMessageText(Messages.SELL_AVAILABILITY, { reply_markup: undefined });
        } else {
            await ctx.editMessageText(Messages.SELL_NETWORKS_SPECIFIC, { reply_markup: undefined });
        }
    });

    // Preview actions
    scene.action('publish_announcement', async (ctx) => {
        await ctx.answerCbQuery();
        
        try {
            // Create announcement in database
            const announcement = await bot.announcementService.createAnnouncement(
                ctx.from.id, 
                ctx.session.announcementData
            );

            // Archive previous announcement if exists
            const previousMessageId = await bot.announcementService.archiveUserPreviousAnnouncement(ctx.from.id);
            
            // Delete previous message from topic
            if (previousMessageId) {
                try {
                    await ctx.telegram.deleteMessage(bot.groupId, previousMessageId);
                } catch (error) {
                    console.log('Could not delete previous announcement:', error.description);
                }
            }

            // Get user stats for badge
            const userStats = await bot.userService.getUserStats(ctx.from.id);
            
            // Format and publish announcement
            const messageText = await bot.announcementService.formatAnnouncementMessage(
                { ...announcement, username: ctx.from.username },
                userStats
            );

            const publishedMessage = await ctx.telegram.sendMessage(
                bot.groupId,
                messageText,
                {
                    message_thread_id: bot.topicId,
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getContactSellerKeyboard(announcement.announcementId).reply_markup
                }
            );

            // Update announcement with message ID
            await bot.announcementService.updateAnnouncementMessageId(
                announcement.announcementId,
                publishedMessage.message_id
            );

            await ctx.editMessageText(Messages.ANNOUNCEMENT_PUBLISHED, { reply_markup: undefined });
            await ctx.reply('Usa il menu per altre operazioni:', Keyboards.MAIN_MENU);
            
        } catch (error) {
            console.error('Error publishing announcement:', error);
            await ctx.editMessageText(Messages.ERROR_MESSAGES.GENERIC_ERROR, { reply_markup: undefined });
            await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
        }

        return ctx.scene.leave();
    });

    scene.action('edit_announcement', async (ctx) => {
        await ctx.answerCbQuery();
        // Reset to beginning for editing
        ctx.session.announcementData = {};
        await ctx.editMessageText(Messages.SELL_START, { reply_markup: undefined });
    });

    scene.action('cancel', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText('❌ Creazione annuncio annullata.', { reply_markup: undefined });
        await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
        return ctx.scene.leave();
    });

    async function showAnnouncementPreview(ctx) {
        const data = ctx.session.announcementData;
        
        // Format display texts
        const currentTypeTexts = {
            'dc_only': 'SOLO DC',
            'ac_only': 'SOLO AC',
            'both': 'DC E AC',
            'dc_min_30': 'SOLO DC E MINIMO 30 KW'
        };
        
        data.currentTypeText = currentTypeTexts[data.currentType];
        data.networksText = data.networks === 'all' ? 'TUTTE LE COLONNINE' : data.networksList.join(', ');
        
        const previewText = Messages.formatAnnouncementPreview(data);
        
        await ctx.reply(previewText, {
            parse_mode: 'Markdown',
            ...Keyboards.getAnnouncementPreviewKeyboard()
        });
    }

    // Handle unexpected messages
    scene.on('message', async (ctx) => {
        if (ctx.message.photo) {
            await ctx.reply('❌ Non inviare foto durante la creazione dell\'annuncio.');
            return;
        }
        
        await ctx.reply('❌ Messaggio non riconosciuto. Segui le istruzioni o premi Annulla.');
    });

    return scene;
}

module.exports = { createSellAnnouncementScene };