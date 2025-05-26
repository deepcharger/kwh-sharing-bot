const { Scenes } = require('telegraf');
const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

function createContactSellerScene(bot) {
    const scene = new Scenes.BaseScene('contactSellerScene');

    scene.enter(async (ctx) => {
        const announcementId = ctx.session.announcementId;
        
        if (!announcementId) {
            await ctx.reply('❌ Annuncio non trovato.', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        const announcement = await bot.announcementService.getAnnouncement(announcementId);
        
        if (!announcement) {
            await ctx.reply('❌ Annuncio non più disponibile.', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        if (announcement.userId === ctx.from.id) {
            await ctx.reply('❌ Non puoi acquistare dal tuo stesso annuncio!', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        ctx.session.contactData = {
            announcementId,
            sellerId: announcement.userId,
            step: 'confirm'
        };

        let message = `🛒 **CONTATTA VENDITORE**\n\n`;
        message += `📍 Posizione: ${announcement.location}\n`;
        message += `${bot.announcementService.formatPricing(announcement)}\n\n`;
        message += `Vuoi procedere con la richiesta di acquisto?`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Sì, procedo', callback_data: 'confirm_contact' },
                        { text: '❌ Annulla', callback_data: 'cancel_contact' }
                    ]
                ]
            }
        });
    });

    scene.action('confirm_contact', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '📅 **QUANDO TI SERVE LA RICARICA?**\n\n' +
            'Inserisci data e ora nel formato:\n' +
            '`GG/MM/AAAA HH:MM`\n\n' +
            'Esempio: `25/12/2024 15:30`',
            { parse_mode: 'Markdown' }
        );
        ctx.session.contactData.step = 'date';
    });

    scene.action('cancel_contact', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText('❌ Richiesta annullata.');
        return ctx.scene.leave();
    });

    scene.on('text', async (ctx) => {
        const text = ctx.message.text;
        const data = ctx.session.contactData;

        if (!data) {
            return ctx.scene.leave();
        }

        switch (data.step) {
            case 'date':
                data.scheduledDate = text;
                data.step = 'brand';
                await ctx.reply('🏢 **MARCA COLONNINA?**\n\nEsempio: Enel X, Be Charge, Ionity...');
                break;

            case 'brand':
                data.brand = text;
                data.step = 'current';
                await ctx.reply(
                    '⚡ **TIPO DI CORRENTE?**',
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⚡ AC', callback_data: 'current_ac' }],
                                [{ text: '🔌 DC', callback_data: 'current_dc' }]
                            ]
                        }
                    }
                );
                break;

            case 'location':
                data.location = text;
                data.step = 'serial';
                await ctx.reply('🔢 **NUMERO SERIALE COLONNINA?**');
                break;

            case 'serial':
                data.serialNumber = text;
                data.step = 'connector';
                await ctx.reply('🔌 **TIPO CONNETTORE?**\n\nEsempio: Type 2, CCS, CHAdeMO...');
                break;

            case 'connector':
                data.connector = text;
                await this.createTransaction(ctx, bot);
                break;
        }
    });

    scene.action(/^current_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const currentType = ctx.match[1].toUpperCase();
        ctx.session.contactData.currentType = currentType;
        ctx.session.contactData.step = 'location';
        
        await ctx.editMessageText('📍 **POSIZIONE ESATTA COLONNINA?**\n\nInserisci indirizzo o coordinate GPS.');
    });

    scene.createTransaction = async function(ctx, bot) {
        try {
            const data = ctx.session.contactData;
            
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

            try {
                const buyer = await bot.userService.getUser(ctx.from.id);
                const announcement = await bot.announcementService.getAnnouncement(data.announcementId);
                
                let notifyText = `📥 **NUOVA RICHIESTA DI ACQUISTO**\n\n`;
                notifyText += `👤 Da: @${buyer?.username || buyer?.firstName || 'utente'}\n`;
                notifyText += `📅 Data/ora: ${data.scheduledDate}\n`;
                notifyText += `🏢 Brand: ${data.brand}\n`;
                notifyText += `⚡ Tipo: ${data.currentType}\n`;
                notifyText += `📍 Posizione: ${data.location}\n`;
                notifyText += `🔌 Connettore: ${data.connector}\n\n`;
                notifyText += `🔍 ID Transazione: \`${transaction.transactionId}\``;

                await ctx.telegram.sendMessage(
                    data.sellerId,
                    notifyText,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ Accetto', callback_data: `accept_request_${transaction.transactionId}` },
                                    { text: '❌ Rifiuto', callback_data: `reject_request_${transaction.transactionId}` }
                                ]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Error notifying seller:', error);
            }

            await ctx.reply(
                `✅ **RICHIESTA INVIATA!**\n\n` +
                `🆔 ID Transazione: \`${transaction.transactionId}\`\n\n` +
                `Il venditore riceverà una notifica e dovrà confermare la tua richiesta.\n` +
                `Ti aggiorneremo sullo stato della transazione.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.MAIN_MENU.reply_markup
                }
            );

        } catch (error) {
            console.error('Error creating transaction:', error);
            await ctx.reply('❌ Errore nella creazione della richiesta. Riprova.', Keyboards.MAIN_MENU);
        }

        return ctx.scene.leave();
    };

    return scene;
}

module.exports = { createContactSellerScene };
