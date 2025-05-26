const { Scenes } = require('telegraf');
const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

function createSellAnnouncementScene(bot) {
    const scene = new Scenes.BaseScene('sellAnnouncementScene');

    scene.enter(async (ctx) => {
        ctx.session.announcementData = {};
        
        await ctx.reply(
            Messages.SELL_WELCOME,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Crea Annuncio', callback_data: 'start_announcement' }],
                        [{ text: '❌ Annulla', callback_data: 'cancel' }]
                    ]
                }
            }
        );
    });

    scene.action('start_announcement', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '💰 **TIPO DI PREZZO**\n\nCome vuoi impostare il prezzo?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💵 Prezzo fisso', callback_data: 'price_fixed' }],
                        [{ text: '📊 Prezzi graduati', callback_data: 'price_graduated' }],
                        [{ text: '❌ Annulla', callback_data: 'cancel' }]
                    ]
                }
            }
        );
    });

    scene.action('price_fixed', async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.announcementData = {
            pricingType: 'fixed'
        };
        await ctx.editMessageText(
            '💵 **PREZZO FISSO**\n\nQuale prezzo vuoi impostare per KWH?\n\nInserisci un valore (es: 0.35):',
            { parse_mode: 'Markdown' }
        );
        ctx.session.step = 'price';
    });

    scene.action('price_graduated', async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.announcementData = {
            pricingType: 'graduated',
            pricingTiers: []
        };
        await ctx.editMessageText(
            Messages.formatGraduatedPricingExplanation() + '\n\n' +
            'Iniziamo con la prima fascia.\nInserisci: `limite_kwh prezzo`\n\nEsempio: `30 0.45`',
            { parse_mode: 'Markdown' }
        );
        ctx.session.step = 'graduated_tier';
    });

    scene.on('text', async (ctx) => {
        const text = ctx.message.text.trim();
        const step = ctx.session.step;

        switch (step) {
            case 'price':
                await handleFixedPrice(ctx, text);
                break;
            case 'graduated_tier':
                await handleGraduatedTier(ctx, text);
                break;
            case 'minimum_kwh':
                await handleMinimumKwh(ctx, text);
                break;
            case 'current_type':
                await handleCurrentType(ctx, text);
                break;
            case 'zones':
                await handleZones(ctx, text);
                break;
            case 'networks':
                await handleNetworks(ctx, text);
                break;
            case 'location':
                await handleLocation(ctx, text);
                break;
            case 'payment_methods':
                await handlePaymentMethods(ctx, text);
                break;
            case 'description':
                await handleDescription(ctx, text);
                break;
            case 'availability':
                await handleAvailability(ctx, text);
                break;
        }
    });

    async function handleFixedPrice(ctx, price) {
        const priceNum = parseFloat(price.replace(',', '.'));
        
        if (isNaN(priceNum) || priceNum <= 0 || priceNum > 10) {
            await ctx.reply('❌ Inserisci un prezzo valido tra 0.01 e 10.00 €/KWH');
            return;
        }

        ctx.session.announcementData.basePrice = priceNum;
        ctx.session.announcementData.price = priceNum; // Compatibilità
        
        await ctx.reply(
            '🎯 **MINIMO GARANTITO** (opzionale)\n\n' +
            'Vuoi impostare un minimo di KWH da far pagare sempre?\n\n' +
            'Esempio: se imposti 10, chi ricarica 5 KWH paga comunque per 10 KWH',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Sì, imposta minimo', callback_data: 'set_minimum' }],
                        [{ text: '❌ No, continua', callback_data: 'skip_minimum' }]
                    ]
                }
            }
        );
    }

    async function handleGraduatedTier(ctx, input) {
        if (input.toLowerCase() === 'fine') {
            return finishGraduatedTiers(ctx);
        }

        const parts = input.split(/\s+/);
        if (parts.length !== 2) {
            await ctx.reply('❌ Formato non valido. Usa: `limite_kwh prezzo`\n\nEsempio: `30 0.45`', 
                { parse_mode: 'Markdown' });
            return;
        }

        const limit = parseInt(parts[0]);
        const price = parseFloat(parts[1].replace(',', '.'));

        if (isNaN(limit) || limit <= 0 || limit > 10000) {
            await ctx.reply('❌ Limite KWH non valido (1-10000). Riprova:');
            return;
        }

        if (isNaN(price) || price <= 0 || price > 10) {
            await ctx.reply('❌ Prezzo non valido (0.01-10.00 €/KWH). Riprova:');
            return;
        }

        const tiers = ctx.session.announcementData.pricingTiers;
        if (tiers.length > 0 && limit <= tiers[tiers.length - 1].limit) {
            await ctx.reply(`❌ Il limite deve essere maggiore di ${tiers[tiers.length - 1].limit}. Riprova:`);
            return;
        }

        tiers.push({ limit, price });

        let message = `✅ Fascia ${tiers.length} aggiunta!\n\n📊 **Fasce configurate:**\n`;
        for (let i = 0; i < tiers.length; i++) {
            const prevLimit = i > 0 ? tiers[i-1].limit : 0;
            message += `• ${prevLimit + 1}-${tiers[i].limit} KWH: TUTTO a ${tiers[i].price}€/KWH\n`;
        }

        message += '\nAggiungi altra fascia o scrivi `fine` per terminare:';

        await ctx.reply(message, { parse_mode: 'Markdown' });
    }

    async function finishGraduatedTiers(ctx) {
        const tiers = ctx.session.announcementData.pricingTiers;
        
        if (tiers.length === 0) {
            await ctx.reply('❌ Devi configurare almeno una fascia!');
            return;
        }

        // Aggiungi fascia finale automatica
        const lastTier = tiers[tiers.length - 1];
        tiers.push({ 
            limit: null, 
            price: Math.max(0.01, lastTier.price - 0.05) 
        });

        await ctx.reply(
            '🎯 **MINIMO GARANTITO** (opzionale)\n\n' +
            'Vuoi impostare un minimo di KWH?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Sì, imposta minimo', callback_data: 'set_minimum' }],
                        [{ text: '❌ No, continua', callback_data: 'skip_minimum' }]
                    ]
                }
            }
        );
    }

    scene.action('set_minimum', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '🎯 Inserisci il numero minimo di KWH (es: 10):',
            { parse_mode: 'Markdown' }
        );
        ctx.session.step = 'minimum_kwh';
    });

    scene.action('skip_minimum', async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.announcementData.minimumKwh = null;
        await askCurrentType(ctx);
    });

    async function handleMinimumKwh(ctx, input) {
        const minimum = parseInt(input);
        
        if (isNaN(minimum) || minimum <= 0 || minimum > 1000) {
            await ctx.reply('❌ Inserisci un valore valido tra 1 e 1000 KWH');
            return;
        }

        ctx.session.announcementData.minimumKwh = minimum;
        await askCurrentType(ctx);
    }

    async function askCurrentType(ctx) {
        await ctx.reply(
            '⚡ **TIPO DI CORRENTE**\n\nChe tipo di corrente offri?',
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getCurrentTypeKeyboard().reply_markup
            }
        );
    }

    scene.action(/^current_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const currentType = ctx.match[1].replace('_', ' ').toUpperCase();
        ctx.session.announcementData.currentType = currentType;
        
        await ctx.editMessageText(
            '📍 **ZONE SERVITE**\n\nIn quali zone offri il servizio?\n\n' +
            'Inserisci le zone separate da virgola (es: Centro, Stazione, Periferia):',
            { parse_mode: 'Markdown' }
        );
        ctx.session.step = 'zones';
    });

    async function handleZones(ctx, zones) {
        ctx.session.announcementData.zones = zones;
        
        await ctx.reply(
            '🌐 **RETI DI RICARICA**\n\nQuale rete di ricarica usi?',
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getNetworksKeyboard().reply_markup
            }
        );
    }

    scene.action('networks_all', async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.announcementData.networks = 'Tutte le reti';
        await askLocation(ctx);
    });

    scene.action('networks_specific', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '🌐 Inserisci le reti disponibili separate da virgola\n\n' +
            'Esempio: Enel X, Be Charge, Ionity',
            { parse_mode: 'Markdown' }
        );
        ctx.session.step = 'networks';
    });

    async function handleNetworks(ctx, networks) {
        ctx.session.announcementData.networks = networks;
        await askLocation(ctx);
    }

    async function askLocation(ctx) {
        await ctx.reply(
            '📍 **POSIZIONE PRECISA**\n\n' +
            'Inserisci l\'indirizzo esatto dove si trova la colonnina:',
            { parse_mode: 'Markdown' }
        );
        ctx.session.step = 'location';
    }

    async function handleLocation(ctx, location) {
        if (location.length < 5 || location.length > 200) {
            await ctx.reply('❌ La posizione deve essere tra 5 e 200 caratteri. Riprova:');
            return;
        }
        
        ctx.session.announcementData.location = location;
        
        await ctx.reply(
            '📝 **DESCRIZIONE** (opzionale)\n\n' +
            'Vuoi aggiungere una descrizione?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Sì, aggiungi', callback_data: 'add_description' }],
                        [{ text: '❌ No, continua', callback_data: 'skip_description' }]
                    ]
                }
            }
        );
    }

    scene.action('add_description', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '📝 Inserisci una breve descrizione (es: Parcheggio coperto, ricarica veloce):',
            { parse_mode: 'Markdown' }
        );
        ctx.session.step = 'description';
    });

    scene.action('skip_description', async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.announcementData.description = '';
        await askAvailability(ctx);
    });

    async function handleDescription(ctx, description) {
        if (description.length > 500) {
            await ctx.reply('❌ La descrizione deve essere massimo 500 caratteri. Riprova:');
            return;
        }
        ctx.session.announcementData.description = description;
        await askAvailability(ctx);
    }

    async function askAvailability(ctx) {
        await ctx.reply(
            '⏰ **DISPONIBILITÀ**\n\nQuando è disponibile la ricarica?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🕐 Sempre disponibile', callback_data: 'availability_always' }],
                        [{ text: '⏰ Specifica orari', callback_data: 'availability_custom' }]
                    ]
                }
            }
        );
    }

    scene.action('availability_always', async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.announcementData.availability = 'Sempre disponibile';
        await askPaymentMethods(ctx);
    });

    scene.action('availability_custom', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '⏰ Inserisci gli orari di disponibilità (es: Lun-Ven 8:00-18:00):',
            { parse_mode: 'Markdown' }
        );
        ctx.session.step = 'availability';
    });

    async function handleAvailability(ctx, availability) {
        if (availability.length > 200) {
            await ctx.reply('❌ La disponibilità deve essere massimo 200 caratteri. Riprova:');
            return;
        }
        ctx.session.announcementData.availability = availability;
        await askPaymentMethods(ctx);
    }

    async function askPaymentMethods(ctx) {
        await ctx.reply(
            '💳 **METODI DI PAGAMENTO**\n\n' +
            'Quali metodi di pagamento accetti?\n\n' +
            'Esempio: PayPal, Satispay, Bonifico',
            { parse_mode: 'Markdown' }
        );
        ctx.session.step = 'payment_methods';
    }

    async function handlePaymentMethods(ctx, methods) {
        ctx.session.announcementData.paymentMethods = methods;
        await showPreview(ctx);
    }

    async function showPreview(ctx) {
        const data = ctx.session.announcementData;
        
        let preview = '📋 **ANTEPRIMA ANNUNCIO**\n\n';
        
        // Pricing
        if (data.pricingType === 'fixed') {
            preview += `💰 Prezzo: ${data.basePrice}€/KWH\n`;
        } else {
            preview += '💰 Prezzi graduati:\n';
            for (let i = 0; i < data.pricingTiers.length; i++) {
                const tier = data.pricingTiers[i];
                const prevLimit = i > 0 ? data.pricingTiers[i-1].limit : 0;
                if (tier.limit) {
                    preview += `  • ${prevLimit + 1}-${tier.limit} KWH: ${tier.price}€/KWH\n`;
                } else {
                    preview += `  • Oltre ${prevLimit} KWH: ${tier.price}€/KWH\n`;
                }
            }
        }
        
        if (data.minimumKwh) {
            preview += `🎯 Minimo: ${data.minimumKwh} KWH\n`;
        }
        
        preview += `⚡ Corrente: ${data.currentType}\n`;
        preview += `📍 Zone: ${data.zones}\n`;
        preview += `🌐 Reti: ${data.networks}\n`;
        preview += `📍 Posizione: ${data.location}\n`;
        
        if (data.description) {
            preview += `📝 Descrizione: ${data.description}\n`;
        }
        
        preview += `⏰ Disponibilità: ${data.availability}\n`;
        preview += `💳 Pagamenti: ${data.paymentMethods}\n`;

        await ctx.reply(preview, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getAnnouncementPreviewKeyboard().reply_markup
        });
    }

    scene.action('publish_announcement', async (ctx) => {
        await ctx.answerCbQuery();
        
        const data = ctx.session.announcementData;
        data.userId = ctx.from.id;
        data.contactInfo = ctx.from.username ? `@${ctx.from.username}` : 'Telegram';

        try {
            const announcement = await bot.announcementService.createAnnouncement(data);
            
            // Ottieni stats utente per badge
            const userStats = await bot.userService.getUserStats(ctx.from.id);
            
            // USA IL METODO formatAnnouncementForGroup PER POSIZIONE COPIABILE
            const groupMessage = bot.announcementService.formatAnnouncementForGroup(
                announcement, 
                userStats
            );
            
            // Pubblica nel topic del gruppo
            const sentMessage = await ctx.telegram.sendMessage(
                bot.groupId,
                groupMessage,
                {
                    parse_mode: 'Markdown',
                    message_thread_id: parseInt(bot.topicId),
                    reply_markup: Keyboards.getContactSellerKeyboard(announcement.announcementId).reply_markup
                }
            );
            
            // Salva ID messaggio per eventuale eliminazione
            await bot.announcementService.updateAnnouncement(
                announcement.announcementId,
                { messageId: sentMessage.message_id }
            );
            
            await ctx.editMessageText(
                '✅ **ANNUNCIO PUBBLICATO!**\n\n' +
                'Il tuo annuncio è ora visibile nel gruppo.\n' +
                'Riceverai una notifica quando qualcuno sarà interessato.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
                }
            );
            
        } catch (error) {
            console.error('Errore pubblicazione:', error);
            await ctx.editMessageText(
                '❌ Errore nella pubblicazione. Riprova più tardi.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
                }
            );
        }
        
        return ctx.scene.leave();
    });

    scene.action('edit_announcement', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '✏️ Modifica non ancora disponibile. Puoi eliminare e ricreare l\'annuncio.',
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
            }
        );
        return ctx.scene.leave();
    });

    scene.action('cancel', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText('❌ Creazione annuncio annullata.');
        return ctx.scene.leave();
    });

    return scene;
}

module.exports = { createSellAnnouncementScene };
