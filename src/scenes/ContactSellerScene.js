const { Scenes } = require('telegraf');
const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');
const moment = require('moment');

function createContactSellerScene(bot) {
    const scene = new Scenes.BaseScene('contactSellerScene');

    // Enter scene
    scene.enter(async (ctx) => {
        const announcementId = ctx.session.announcementId;
        
        if (!announcementId) {
            await ctx.reply('❌ Annuncio non trovato.', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        // Get announcement details
        const announcement = await bot.announcementService.getAnnouncement(announcementId);
        
        if (!announcement) {
            await ctx.reply('❌ Annuncio non più disponibile.', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        // Check if trying to contact own announcement
        if (announcement.userId === ctx.from.id) {
            await ctx.reply('❌ Non puoi acquistare dal tuo stesso annuncio!', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        // Get seller stats
        const userStats = await bot.userService.getUserStats(announcement.userId);
        
        // Show announcement summary
        const summaryText = Messages.formatContactSummary(
            { ...announcement, username: announcement.username || 'utente' },
            userStats
        );

        ctx.session.purchaseData = {
            announcementId,
            sellerId: announcement.userId,
            announcement
        };

        await ctx.reply(summaryText, {
            parse_mode: 'Markdown',
            ...Keyboards.getConfirmPurchaseKeyboard()
        });
    });

    // Confirm purchase action
    scene.action('confirm_purchase', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(Messages.BUY_DATETIME, { reply_markup: undefined });
    });

    scene.action('cancel_purchase', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText('❌ Acquisto annullato.', Keyboards.MAIN_MENU);
        return ctx.scene.leave();
    });

    // Handle current type selection (AC/DC)
    scene.action(/^select_(ac|dc)$/, async (ctx) => {
        const currentType = ctx.match[1].toUpperCase();
        ctx.session.purchaseData.currentType = currentType;
        
        await ctx.answerCbQuery();
        await ctx.editMessageText(Messages.BUY_LOCATION, { reply_markup: undefined });
    });

    // Handle location (both text and location)
    scene.on('location', async (ctx) => {
        const { latitude, longitude } = ctx.message.location;
        ctx.session.purchaseData.location = `GPS: ${latitude}, ${longitude}`;
        await ctx.reply(Messages.BUY_SERIAL, Keyboards.CANCEL_ONLY);
    });

    // Handle text location
    scene.on('text', async (ctx) => {
        const text = ctx.message.text;
        const data = ctx.session.purchaseData;

        if (text === '❌ Annulla') {
            await ctx.reply('❌ Acquisto annullato.', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        // Step 1: Date and time
        if (!data.scheduledDate) {
            const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;
            const match = text.match(dateRegex);
            
            if (!match) {
                await ctx.reply(Messages.ERROR_MESSAGES.INVALID_DATE);
                return;
            }

            const [, day, month, year, hour, minute] = match;
            const scheduledDate = moment(`${year}-${month}-${day} ${hour}:${minute}`, 'YYYY-MM-DD HH:mm');
            
            if (!scheduledDate.isValid() || scheduledDate.isBefore(moment())) {
                await ctx.reply('❌ Data non valida o nel passato. Inserisci una data futura.');
                return;
            }

            data.scheduledDate = scheduledDate.format('DD/MM/YYYY HH:mm');
            await ctx.reply(Messages.BUY_BRAND, Keyboards.CANCEL_ONLY);
            return;
        }

        // Step 2: Brand
        if (!data.brand) {
            data.brand = text.trim().toUpperCase();
            await ctx.reply(Messages.SELL_CURRENT_TYPE, Keyboards.getCurrentTypeSelectionKeyboard());
            return;
        }

        // Step 3: Location (if we're waiting for location and got text instead)
        if (data.currentType && !data.location) {
            data.location = text.trim();
            await ctx.reply(Messages.BUY_SERIAL, Keyboards.CANCEL_ONLY);
            return;
        }

        // Step 4: Serial number
        if (!data.serialNumber) {
            data.serialNumber = text.trim();
            await ctx.reply(Messages.BUY_CONNECTOR, Keyboards.CANCEL_ONLY);
            return;
        }

        // Step 5: Connector type (final step)
        if (!data.connector) {
            data.connector = text.trim().toUpperCase();
            
            // All data collected, create transaction and notify seller
            await createTransactionAndNotifySeller(ctx, bot);
            return;
        }
    });

    async function createTransactionAndNotifySeller(ctx, bot) {
        try {
            const data = ctx.session.purchaseData;
            
            // Create transaction
            const transaction = await bot.transactionService.createTransaction(
                data.announcementId,
                data.sellerId,
                ctx.from.id,
                {
                    scheduledDate: data.scheduledDate,
                    brand: data.brand,
                    currentType: data.currentType,
                    location: data.location,
                    serialNumber: data.serialNumber,
                    connector: data.connector
                }
            );

            // Notify seller
            const requestText = Messages.formatPurchaseRequest(
                {
                    ...data,
                    buyerUsername: ctx.from.username || ctx.from.first_name
                },
                data.announcement
            );

            try {
                await ctx.telegram.sendMessage(
                    data.sellerId,
                    requestText,
                    {
                        parse_mode: 'Markdown',
                        ...Keyboards.getSellerConfirmationKeyboard()
                    }
                );

                // Add transaction ID to the message for seller actions
                await ctx.telegram.sendMessage(
                    data.sellerId,
                    `🔍 ID Transazione: \`${transaction.transactionId}\``,
                    { parse_mode: 'Markdown' }
                );

            } catch (error) {
                console.error('Error notifying seller:', error);
                // If we can't notify seller, still proceed but inform buyer
                await ctx.reply('⚠️ Richiesta creata, ma il venditore potrebbe non ricevere notifiche. Contattalo direttamente se necessario.');
            }

            // Confirm to buyer
            await ctx.reply(
                `✅ *Richiesta inviata al venditore!*\n\n` +
                `🆔 ID Transazione: \`${transaction.transactionId}\`\n\n` +
                `Il venditore riceverà una notifica e dovrà confermare la tua richiesta.\n` +
                `Ti aggiorneremo sullo stato della transazione.`,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.MAIN_MENU
                }
            );

            // Store transaction ID for future reference
            ctx.session.currentTransactionId = transaction.transactionId;

        } catch (error) {
            console.error('Error creating transaction:', error);
            await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR, Keyboards.MAIN_MENU);
        }

        return ctx.scene.leave();
    }

    // Handle unexpected messages
    scene.on('message', async (ctx) => {
        if (ctx.message.photo) {
            await ctx.reply('❌ Non inviare foto durante la configurazione dell\'acquisto.');
            return;
        }
        
        if (ctx.message.document) {
            await ctx.reply('❌ Non inviare documenti durante la configurazione dell\'acquisto.');
            return;
        }
    });

    return scene;
}

module.exports = { createContactSellerScene };
