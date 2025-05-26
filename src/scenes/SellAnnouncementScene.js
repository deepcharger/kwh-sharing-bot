const { Scenes } = require('telegraf');
const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

function createSellAnnouncementScene(bot) {
    const scene = new Scenes.BaseScene('sellAnnouncementScene');

    scene.enter(async (ctx) => {
        // Reset session data
        ctx.session.announcementData = {
            userId: ctx.from.id,
            username: ctx.from.username,
            step: 'location'
        };

        await ctx.reply(
            '📍 **POSIZIONE COLONNINA**\n\n' +
            'Inserisci l\'indirizzo preciso o le coordinate GPS della colonnina.\n\n' +
            'Esempio: `Via Roma 123, Milano` o `45.464211, 9.191383`',
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.CANCEL_ONLY.reply_markup
            }
        );
    });

    // Handle cancel
    scene.hears('❌ Annulla', async (ctx) => {
        await ctx.reply('❌ Creazione annuncio annullata.', Keyboards.MAIN_MENU);
        return ctx.scene.leave();
    });

    // Handle text input
    scene.on('text', async (ctx) => {
        const text = ctx.message.text;
        const data = ctx.session.announcementData;

        if (!data) {
            return ctx.scene.leave();
        }

        switch (data.step) {
            case 'location':
                data.location = text;
                data.step = 'description';
                await ctx.reply(
                    '📝 **DESCRIZIONE (opzionale)**\n\n' +
                    'Aggiungi dettagli utili come:\n' +
                    '• Tipo di parcheggio\n' +
                    '• Accessibilità\n' +
                    '• Note particolari\n\n' +
                    'Scrivi "no" per saltare.',
                    { parse_mode: 'Markdown' }
                );
                break;

            case 'description':
                data.description = text === 'no' ? '' : text;
                data.step = 'availability';
                await ctx.reply(
                    '⏰ **DISPONIBILITÀ**\n\n' +
                    'Quando è disponibile la colonnina?\n\n' +
                    'Esempi:\n' +
                    '• Sempre disponibile\n' +
                    '• Lun-Ven 18:00-08:00\n' +
                    '• Weekend e festivi',
                    { parse_mode: 'Markdown' }
                );
                break;

            case 'availability':
                data.availability = text;
                data.step = 'pricing_type';
                await ctx.reply(
                    '💰 **TIPO DI PREZZO**\n\n' +
                    'Scegli il sistema di prezzi:',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💵 Prezzo Fisso', callback_data: 'price_fixed' }],
                                [{ text: '📊 Prezzi Graduati', callback_data: 'price_graduated' }],
                                [{ text: '❓ Cosa sono?', callback_data: 'price_help' }]
                            ]
                        }
                    }
                );
                break;

            case 'fixed_price':
                const price = parseFloat(text.replace(',', '.'));
                if (isNaN(price) || price <= 0 || price > 10) {
                    await ctx.reply('❌ Prezzo non valido. Inserisci un valore tra 0.01 e 10.00 €/KWH');
                    return;
                }
                data.pricingType = 'fixed';
                data.basePrice = price;
                data.price = price; // Compatibilità
                data.step = 'minimum_kwh';
                
                await ctx.reply(
                    '🎯 **MINIMO GARANTITO (opzionale)**\n\n' +
                    'Vuoi impostare un minimo di KWH garantiti?\n\n' +
                    'Esempio: Se imposti 15 KWH, chi ricarica meno pagherà comunque per 15 KWH.\n\n' +
                    'Inserisci il numero minimo o "0" per non avere minimi.',
                    { parse_mode: 'Markdown' }
                );
                break;

            case 'minimum_kwh':
                const minKwh = parseInt(text);
                if (isNaN(minKwh) || minKwh < 0 || minKwh > 1000) {
                    await ctx.reply('❌ Valore non valido. Inserisci un numero tra 0 e 1000.');
                    return;
                }
                data.minimumKwh = minKwh > 0 ? minKwh : null;
                data.step = 'current_type';
                
                await ctx.reply(
                    '⚡ **TIPO DI CORRENTE**\n\nChe tipo di corrente fornisce la colonnina?',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: Keyboards.getCurrentTypeKeyboard().reply_markup
                    }
                );
                break;

            case 'zones':
                data.zones = text;
                data.step = 'networks';
                await ctx.reply(
                    '🌐 **RETI SUPPORTATE**\n\nQuali reti/app di ricarica puoi attivare?',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: Keyboards.getNetworksKeyboard().reply_markup
                    }
                );
                break;

            case 'networks_list':
                data.networks = text;
                data.step = 'payment_methods';
                await ctx.reply(
                    '💳 **METODI DI PAGAMENTO**\n\n' +
                    'Come preferisci ricevere i pagamenti?\n\n' +
                    'Esempi:\n' +
                    '• PayPal\n' +
                    '• Bonifico\n' +
                    '• Satispay\n' +
                    '• Contanti',
                    { parse_mode: 'Markdown' }
                );
                break;

            case 'payment_methods':
                data.paymentMethods = text;
                await this.showPreview(ctx);
                break;

            case 'graduated_tier':
                await this.handleGraduatedTier(ctx, text);
                break;
        }
    });

    // Handle inline buttons
    scene.action('price_fixed', async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.announcementData.step = 'fixed_price';
        await ctx.editMessageText(
            '💵 **PREZZO FISSO**\n\n' +
            'Inserisci il prezzo in €/KWH\n\n' +
            'Esempio: `0.40` (per 0,40€/KWH)',
            { parse_mode: 'Markdown' }
        );
    });

    scene.action('price_graduated', async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.announcementData.pricingType = 'graduated';
        ctx.session.announcementData.pricingTiers = [];
        ctx.session.announcementData.step = 'graduated_tier';
        
        await ctx.editMessageText(
            Messages.formatGraduatedPricingExplanation() + '\n\n' +
            '**FASCIA 1**\n' +
            'Inserisci limite KWH e prezzo.\n' +
            'Formato: `limite_kwh prezzo`\n\n' +
            'Esempio: `30 0.45`\n(fino a 30 KWH a 0.45€/KWH)',
            { parse_mode: 'Markdown' }
        );
    });

    scene.action('price_help', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            Messages.formatGraduatedPricingExplanation() + '\n\n' +
            Messages.formatMinimumGuaranteeExplanation(),
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💵 Prezzo Fisso', callback_data: 'price_fixed' }],
                        [{ text: '📊 Prezzi Graduati', callback_data: 'price_graduated' }]
                    ]
                }
            }
        );
    });

    scene.action(/^current_/, async (ctx) => {
        await ctx.answerCbQuery();
        const type = ctx.match[0].replace('current_', '').toUpperCase();
        
        if (type === 'DC_ONLY') {
            ctx.session.announcementData.currentType = 'DC';
        } else if (type === 'AC_ONLY') {
            ctx.session.announcementData.currentType = 'AC';
        } else if (type === 'BOTH') {
            ctx.session.announcementData.currentType = 'AC/DC';
        }
        
        ctx.session.announcementData.step = 'zones';
        await ctx.editMessageText(
            '📍 **ZONE SERVITE**\n\n' +
            'In quali zone/quartieri puoi fornire il servizio?\n\n' +
            'Esempio: Centro, Stazione, San Siro',
            { parse_mode: 'Markdown' }
        );
    });

    scene.action('networks_all', async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.announcementData.networks = 'Tutte le principali reti';
        ctx.session.announcementData.step = 'payment_methods';
        
        await ctx.editMessageText(
            '💳 **METODI DI PAGAMENTO**\n\n' +
            'Come preferisci ricevere i pagamenti?\n\n' +
            'Esempi:\n' +
            '• PayPal\n' +
            '• Bonifico\n' +
            '• Satispay\n' +
            '• Contanti',
            { parse_mode: 'Markdown' }
        );
    });

    scene.action('networks_specific', async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.announcementData.step = 'networks_list';
        
        await ctx.editMessageText(
            '📝 **SPECIFICA LE RETI**\n\n' +
            'Elenca le reti/app che puoi attivare.\n\n' +
            'Esempio: Enel X, Be Charge, A2A',
            { parse_mode: 'Markdown' }
        );
    });

    scene.action('publish_announcement', async (ctx) => {
        await ctx.answerCbQuery();
        await this.publishAnnouncement(ctx);
    });

    scene.action('edit_announcement', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '✏️ **MODIFICA NON DISPONIBILE**\n\n' +
            'La modifica diretta non è ancora implementata.\n' +
            'Puoi annullare e ricreare l\'annuncio.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 Ricrea annuncio', callback_data: 'restart' }],
                        [{ text: '❌ Annulla tutto', callback_data: 'cancel' }]
                    ]
                }
            }
        );
    });

    scene.action('restart', async (ctx) => {
        await ctx.answerCbQuery();
        return ctx.scene.reenter();
    });

    scene.action('cancel', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText('❌ Creazione annuncio annullata.');
        await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
        return ctx.scene.leave();
    });

    scene.action('tier_done', async (ctx) => {
        await ctx.answerCbQuery();
        const data = ctx.session.announcementData;
        
        if (!data.pricingTiers || data.pricingTiers.length < 2) {
            await ctx.editMessageText('❌ Devi inserire almeno 2 fasce di prezzo.');
            return;
        }
        
        // Imposta l'ultima fascia come illimitata
        data.pricingTiers[data.pricingTiers.length - 1].limit = null;
        
        data.step = 'minimum_kwh';
        await ctx.editMessageText(
            '🎯 **MINIMO GARANTITO (opzionale)**\n\n' +
            'Vuoi impostare un minimo di KWH garantiti?\n\n' +
            'Inserisci il numero minimo o "0" per non avere minimi.',
            { parse_mode: 'Markdown' }
        );
    });

    // Helper methods
    scene.handleGraduatedTier = async function(ctx, text) {
        const data = ctx.session.announcementData;
        const parts = text.trim().split(/\s+/);
        
        if (parts.length !== 2) {
            await ctx.reply(Messages.ERROR_MESSAGES.INVALID_TIER_FORMAT);
            return;
        }
        
        const limit = parseInt(parts[0]);
        const price = parseFloat(parts[1].replace(',', '.'));
        
        if (isNaN(limit) || limit <= 0 || isNaN(price) || price <= 0 || price > 10) {
            await ctx.reply(Messages.ERROR_MESSAGES.INVALID_TIER_FORMAT);
            return;
        }
        
        // Verifica che il limite sia maggiore del precedente
        if (data.pricingTiers.length > 0) {
            const lastLimit = data.pricingTiers[data.pricingTiers.length - 1].limit;
            if (limit <= lastLimit) {
                await ctx.reply(Messages.ERROR_MESSAGES.INVALID_TIER_LIMIT);
                return;
            }
        }
        
        data.pricingTiers.push({ limit, price });
        
        const tierNum = data.pricingTiers.length + 1;
        await ctx.reply(
            `✅ Fascia ${tierNum - 1} aggiunta!\n\n` +
            `**FASCIA ${tierNum}**\n` +
            'Inserisci limite e prezzo o premi il pulsante per terminare.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Ho finito le fasce', callback_data: 'tier_done' }]
                    ]
                }
            }
        );
    };

    scene.showPreview = async function(ctx) {
        const data = ctx.session.announcementData;
        const userStats = await bot.userService.getUserStats(ctx.from.id);
        
        // Crea un oggetto announcement temporaneo per il preview
        const tempAnnouncement = {
            ...data,
            userId: { username: ctx.from.username, firstName: ctx.from.first_name },
            createdAt: new Date()
        };
        
        let preview = '👁️ **ANTEPRIMA ANNUNCIO**\n\n';
        preview += await bot.announcementService.formatAnnouncementMessage(tempAnnouncement, userStats);
        
        if (data.pricingType === 'graduated' || data.minimumKwh) {
            preview += '\n\n' + Messages.formatPriceExamples(tempAnnouncement);
        }
        
        await ctx.reply(preview, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getAnnouncementPreviewKeyboard().reply_markup
        });
    };

    scene.publishAnnouncement = async function(ctx) {
        try {
            const data = ctx.session.announcementData;
            data.userId = ctx.from.id;
            
            // Elimina eventuali annunci precedenti dell'utente
            const existingAnnouncements = await bot.announcementService.getUserAnnouncements(ctx.from.id);
            for (const ann of existingAnnouncements) {
                await bot.announcementService.deleteAnnouncement(ann.announcementId, ctx.from.id);
                if (ann.messageId) {
                    try {
                        await ctx.telegram.deleteMessage(bot.groupId, ann.messageId);
                    } catch (error) {
                        console.log('Could not delete old announcement:', error.description);
                    }
                }
            }
            
            // Crea nuovo annuncio
            const announcement = await bot.announcementService.createAnnouncement(data);
            
            // Prepara messaggio per il gruppo
            const userStats = await bot.userService.getUserStats(ctx.from.id);
            const groupMessage = bot.announcementService.formatAnnouncementForGroup(announcement, userStats);
            
            // Pubblica nel topic del gruppo
            const sentMessage = await ctx.telegram.sendMessage(
                bot.groupId,
                groupMessage,
                {
                    parse_mode: 'Markdown',
                    message_thread_id: bot.topicId,
                    reply_markup: Keyboards.getContactSellerKeyboard(announcement.announcementId).reply_markup
                }
            );
            
            // Salva ID messaggio
            await bot.announcementService.updateAnnouncement(
                announcement.announcementId,
                { messageId: sentMessage.message_id }
            );
            
            await ctx.editMessageText(
                '✅ **ANNUNCIO PUBBLICATO!**\n\n' +
                `Il tuo annuncio è ora visibile nel gruppo.\n\n` +
                `🆔 ID: \`${announcement.announcementId}\`\n\n` +
                'Riceverai una notifica per ogni richiesta di acquisto.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
                }
            );
            
            // Torna al menu dopo 5 secondi
            setTimeout(async () => {
                try {
                    await ctx.reply('Torna al menu principale:', Keyboards.MAIN_MENU);
                } catch (error) {
                    console.log('Could not send menu:', error);
                }
            }, 5000);
            
        } catch (error) {
            console.error('Error publishing announcement:', error);
            await ctx.editMessageText(
                '❌ Errore nella pubblicazione dell\'annuncio. Riprova più tardi.',
                { reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup }
            );
        }
        
        return ctx.scene.leave();
    };

    return scene;
}

module.exports = { createSellAnnouncementScene };
