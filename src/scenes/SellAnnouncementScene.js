const { Scenes, Markup } = require('telegraf');
const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

// Questo è il file corretto basato sulla struttura originale del progetto
const scene = new Scenes.BaseScene('sell_announcement');

// Inizializza la sessione
scene.enter(async (ctx) => {
    try {
        // Reset dati sessione
        ctx.session.announcementData = {};
        
        await ctx.reply(
            Messages.SELL_WELCOME,
            Markup.inlineKeyboard([
                [Markup.button.callback('📝 Crea Annuncio', 'start_announcement')],
                [Markup.button.callback('❌ Annulla', 'cancel')]
            ])
        );
    } catch (error) {
        console.error('Errore nell\'ingresso della scene sell:', error);
        await ctx.reply('❌ Errore nel caricamento. Riprova.');
        return ctx.scene.leave();
    }
});

// Avvia creazione annuncio
scene.action('start_announcement', async (ctx) => {
    try {
        await ctx.editMessageText(
            '📍 **POSIZIONE**\n\nInserisci la posizione dove offri la ricarica:\n\n*Esempio: Via Roma 123, Milano*',
            { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '❌ Annulla', callback_data: 'cancel' }
                    ]]
                }
            }
        );
        ctx.session.step = 'location';
    } catch (error) {
        console.error('Errore start_announcement:', error);
        await ctx.reply('❌ Errore. Riprova.');
    }
});

// Gestione input testuali
scene.on('text', async (ctx) => {
    try {
        const step = ctx.session.step;
        const text = ctx.message.text.trim();

        switch (step) {
            case 'location':
                await handleLocationInput(ctx, text);
                break;
            case 'description':
                await handleDescriptionInput(ctx, text);
                break;
            case 'availability':
                await handleAvailabilityInput(ctx, text);
                break;
            case 'contact':
                await handleContactInput(ctx, text);
                break;
            case 'fixed_price':
                await handleFixedPriceInput(ctx, text);
                break;
            case 'graduated_price':
                await handleGraduatedPriceInput(ctx, text);
                break;
            case 'minimum_kwh':
                await handleMinimumKwhInput(ctx, text);
                break;
            default:
                await ctx.reply('❌ Comando non riconosciuto. Usa /help per assistenza.');
        }
    } catch (error) {
        console.error('Errore nella gestione del testo:', error);
        await ctx.reply('❌ Errore nell\'elaborazione. Riprova.');
    }
});

// Handler per la posizione
async function handleLocationInput(ctx, location) {
    if (location.length < 5 || location.length > 200) {
        await ctx.reply('❌ La posizione deve essere tra 5 e 200 caratteri. Riprova:');
        return;
    }

    ctx.session.announcementData.location = location;
    
    await ctx.reply(
        '📝 **DESCRIZIONE**\n\nDescrivi la tua offerta di ricarica:\n\n*Esempio: Ricarica rapida 22kW, parcheggio coperto, disponibile H24*',
        { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '❌ Annulla', callback_data: 'cancel' }
                ]]
            }
        }
    );
    ctx.session.step = 'description';
}

// Handler per la descrizione
async function handleDescriptionInput(ctx, description) {
    if (description.length < 10 || description.length > 1000) {
        await ctx.reply('❌ La descrizione deve essere tra 10 e 1000 caratteri. Riprova:');
        return;
    }

    ctx.session.announcementData.description = description;
    
    await ctx.reply(
        '⏰ **DISPONIBILITÀ**\n\nQuando è disponibile la ricarica?\n\n*Esempio: Lun-Ven 8:00-18:00, Weekend su appuntamento*',
        { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🕐 Sempre disponibile', callback_data: 'availability_always' }],
                    [{ text: '❌ Annulla', callback_data: 'cancel' }]
                ]
            }
        }
    );
    ctx.session.step = 'availability';
}

// Handler per la disponibilità
async function handleAvailabilityInput(ctx, availability) {
    if (availability.length > 200) {
        await ctx.reply('❌ La disponibilità deve essere massimo 200 caratteri. Riprova:');
        return;
    }

    ctx.session.announcementData.availability = availability;
    
    await ctx.reply(
        '📞 **CONTATTI**\n\nCome possono contattarti?\n\n*Esempio: Telegram @username, WhatsApp +39123456789*',
        { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Solo Telegram', callback_data: 'contact_telegram' }],
                    [{ text: '❌ Annulla', callback_data: 'cancel' }]
                ]
            }
        }
    );
    ctx.session.step = 'contact';
}

// Handler per i contatti
async function handleContactInput(ctx, contact) {
    if (contact.length > 200) {
        await ctx.reply('❌ Le informazioni di contatto devono essere massimo 200 caratteri. Riprova:');
        return;
    }

    ctx.session.announcementData.contactInfo = contact;
    await askPricingType(ctx);
}

// Nuova funzione per chiedere il tipo di prezzo
async function askPricingType(ctx) {
    await ctx.reply(
        '💰 **COME VUOI STRUTTURARE IL PREZZO?**\n\n' +
        '🔸 **Prezzo fisso** - Un prezzo uguale per qualsiasi quantità\n' +
        '📊 **Prezzi graduati** - Prezzo diverso in base alla quantità totale',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔸 Prezzo fisso', callback_data: 'pricing_type_fixed' }],
                    [{ text: '📊 Prezzi graduati', callback_data: 'pricing_type_graduated' }],
                    [{ text: '❌ Annulla', callback_data: 'cancel' }]
                ]
            }
        }
    );
}

// Handler per tipo prezzo fisso
scene.action('pricing_type_fixed', async (ctx) => {
    try {
        ctx.session.announcementData.pricingType = 'fixed';
        
        await ctx.editMessageText(
            '💶 **PREZZO FISSO**\n\nInserisci il prezzo per KWH:\n\n*Esempio: 0.40*',
            { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '❌ Annulla', callback_data: 'cancel' }
                    ]]
                }
            }
        );
        ctx.session.step = 'fixed_price';
    } catch (error) {
        console.error('Errore pricing_type_fixed:', error);
        await ctx.reply('❌ Errore. Riprova.');
    }
});

// Handler per tipo prezzo graduato
scene.action('pricing_type_graduated', async (ctx) => {
    try {
        ctx.session.announcementData.pricingType = 'graduated';
        ctx.session.announcementData.pricingTiers = [];
        
        await ctx.editMessageText(
            '📊 **PREZZI GRADUATI**\n\n' +
            'Imposta i prezzi in base alla quantità TOTALE ricaricata.\n\n' +
            '**Come funziona:**\n' +
            '• Se ricarico 0-30 KWH → TUTTO a prezzo fascia 1\n' +
            '• Se ricarico 31-60 KWH → TUTTO a prezzo fascia 2\n' +
            '• Se ricarico 61+ KWH → TUTTO a prezzo fascia 3\n\n' +
            '**FASCIA 1 (obbligatoria)**\n' +
            'Inserisci: `limite_kwh prezzo`\n\n' +
            '*Esempio: 30 0.45*\n' +
            '*(Da 0 a 30 KWH, tutto a 0,45€/KWH)*',
            { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '❌ Annulla', callback_data: 'cancel' }
                    ]]
                }
            }
        );
        ctx.session.step = 'graduated_price';
    } catch (error) {
        console.error('Errore pricing_type_graduated:', error);
        await ctx.reply('❌ Errore. Riprova.');
    }
});

// Handler per prezzo fisso
async function handleFixedPriceInput(ctx, input) {
    const price = parseFloat(input.replace(',', '.'));
    
    if (isNaN(price) || price <= 0 || price > 10) {
        await ctx.reply('❌ Prezzo non valido. Inserisci un numero tra 0.01 e 10.00 €/KWH:');
        return;
    }

    ctx.session.announcementData.basePrice = price;
    
    await ctx.reply(
        `✅ **Prezzo impostato: ${price.toFixed(2)}€/KWH**\n\n` +
        '🎯 **VUOI AGGIUNGERE UN MINIMO GARANTITO?**\n\n' +
        'Questo significa che anche se si ricarica poco, si paga comunque un minimo.\n\n' +
        '*Esempio: Minimo 10 KWH → anche chi ricarica 5 KWH paga come se avesse ricaricato 10 KWH*',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Sì, aggiungi minimo', callback_data: 'add_minimum_yes' }],
                    [{ text: '❌ No, solo prezzo fisso', callback_data: 'add_minimum_no' }],
                    [{ text: '🔙 Indietro', callback_data: 'back_to_pricing' }]
                ]
            }
        }
    );
}

// Handler per prezzi graduati
async function handleGraduatedPriceInput(ctx, input) {
    if (input === '/fine') {
        return await finishGraduatedTiers(ctx);
    }

    const parts = input.trim().split(/\s+/);
    if (parts.length !== 2) {
        await ctx.reply('❌ Formato non valido. Usa: `limite_kwh prezzo`\n\n*Esempio: 30 0.45*', { parse_mode: 'Markdown' });
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

    // Verifica che il limite sia maggiore del precedente
    const tiers = ctx.session.announcementData.pricingTiers || [];
    if (tiers.length > 0) {
        const lastLimit = tiers[tiers.length - 1].limit;
        if (limit <= lastLimit) {
            await ctx.reply(`❌ Il limite deve essere maggiore di ${lastLimit} KWH. Riprova:`);
            return;
        }
    }

    // Aggiungi la fascia
    tiers.push({ limit, price });
    ctx.session.announcementData.pricingTiers = tiers;

    const tierNumber = tiers.length;
    let message = `✅ **Fascia ${tierNumber} aggiunta:**\n`;
    
    // Mostra tutte le fasce
    for (let i = 0; i < tiers.length; i++) {
        const prevLimit = i > 0 ? tiers[i-1].limit : 0;
        message += `• **${prevLimit + 1}-${tiers[i].limit} KWH:** TUTTO a ${tiers[i].price.toFixed(2)}€/KWH\n`;
    }

    message += `\n📊 **FASCIA ${tierNumber + 1} (opzionale)**\n\n`;
    message += 'Inserisci la fascia successiva o scrivi `/fine`\n\n';
    message += `*Esempio: ${limit + 30} 0.35*`;

    await ctx.reply(message, { 
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Finisci configurazione', callback_data: 'finish_graduated' }],
                [{ text: '❌ Annulla', callback_data: 'cancel' }]
            ]
        }
    });
}

// Finisci configurazione fasce graduate
scene.action('finish_graduated', async (ctx) => {
    await finishGraduatedTiers(ctx);
});

async function finishGraduatedTiers(ctx) {
    const tiers = ctx.session.announcementData.pricingTiers || [];
    
    if (tiers.length === 0) {
        await ctx.reply('❌ Devi configurare almeno una fascia. Riprova:');
        return;
    }

    // Aggiungi ultima fascia automatica con prezzo ridotto
    const lastTier = tiers[tiers.length - 1];
    const autoPrice = Math.max(0.01, lastTier.price - 0.05); // Riduzione automatica di 5 centesimi
    tiers.push({ limit: null, price: autoPrice });

    let message = '✅ **Prezzi graduati configurati:**\n\n📊 **Le tue tariffe:**\n';
    
    for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const prevLimit = i > 0 ? tiers[i-1].limit : 0;
        
        if (tier.limit === null) {
            message += `• **Oltre ${prevLimit} KWH:** TUTTO a ${tier.price.toFixed(2)}€/KWH\n`;
        } else {
            message += `• **${prevLimit + 1}-${tier.limit} KWH:** TUTTO a ${tier.price.toFixed(2)}€/KWH\n`;
        }
    }

    message += '\n🎯 **VUOI AGGIUNGERE UN MINIMO GARANTITO?**';

    await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Sì, aggiungi minimo', callback_data: 'add_minimum_yes' }],
                [{ text: '❌ No, solo prezzi graduati', callback_data: 'add_minimum_no' }],
                [{ text: '🔙 Indietro', callback_data: 'back_to_pricing' }]
            ]
        }
    });
}

// Handler per aggiungere minimo - SÌ
scene.action('add_minimum_yes', async (ctx) => {
    try {
        await ctx.editMessageText(
            '🎯 **MINIMO GARANTITO**\n\n' +
            'Inserisci i KWH minimi da far pagare sempre:\n\n' +
            '*Esempio: 10*\n' +
            '*(anche chi ricarica 5 KWH pagherà per 10 KWH)*',
            { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Indietro', callback_data: 'back_to_minimum_choice' }],
                        [{ text: '❌ Annulla', callback_data: 'cancel' }]
                    ]
                }
            }
        );
        ctx.session.step = 'minimum_kwh';
    } catch (error) {
        console.error('Errore add_minimum_yes:', error);
        await ctx.reply('❌ Errore. Riprova.');
    }
});

// Handler per aggiungere minimo - NO
scene.action('add_minimum_no', async (ctx) => {
    ctx.session.announcementData.minimumKwh = null;
    await showFinalSummary(ctx);
});

// Handler per KWH minimi
async function handleMinimumKwhInput(ctx, input) {
    const minimumKwh = parseInt(input);
    
    if (isNaN(minimumKwh) || minimumKwh <= 0 || minimumKwh > 1000) {
        await ctx.reply('❌ KWH minimi non validi (1-1000). Riprova:');
        return;
    }

    ctx.session.announcementData.minimumKwh = minimumKwh;
    await showFinalSummary(ctx);
}

// Mostra riepilogo finale
async function showFinalSummary(ctx) {
    const data = ctx.session.announcementData;
    
    let pricingInfo = '';
    if (data.pricingType === 'fixed') {
        pricingInfo = `💰 Prezzo: **${data.basePrice.toFixed(2)}€/KWH**`;
        if (data.minimumKwh) {
            pricingInfo += `\n🎯 Minimo garantito: **${data.minimumKwh} KWH**`;
        }
    } else if (data.pricingType === 'graduated') {
        pricingInfo = '💰 Prezzi graduati:\n';
        for (let i = 0; i < data.pricingTiers.length; i++) {
            const tier = data.pricingTiers[i];
            const prevLimit = i > 0 ? data.pricingTiers[i-1].limit : 0;
            
            if (tier.limit === null) {
                pricingInfo += `• Oltre ${prevLimit} KWH: TUTTO a ${tier.price.toFixed(2)}€/KWH\n`;
            } else {
                pricingInfo += `• ${prevLimit + 1}-${tier.limit} KWH: TUTTO a ${tier.price.toFixed(2)}€/KWH\n`;
            }
        }
        if (data.minimumKwh) {
            pricingInfo += `🎯 Minimo garantito: **${data.minimumKwh} KWH**`;
        }
    }

    const summary = `✅ **RIEPILOGO ANNUNCIO**\n\n` +
        `📍 **Posizione:** ${data.location}\n` +
        `📝 **Descrizione:** ${data.description}\n` +
        `⏰ **Disponibilità:** ${data.availability}\n` +
        `📞 **Contatti:** ${data.contactInfo}\n\n` +
        `${pricingInfo}\n\n` +
        `Confermi la pubblicazione?`;

    await ctx.reply(summary, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Pubblica Annuncio', callback_data: 'confirm_publish' }],
                [{ text: '✏️ Modifica', callback_data: 'back_to_pricing' }],
                [{ text: '❌ Annulla', callback_data: 'cancel' }]
            ]
        }
    });
}

// Conferma pubblicazione - PARTE CRITICA CON POSIZIONE COPIABILE
scene.action('confirm_publish', async (ctx) => {
    try {
        const data = ctx.session.announcementData;
        data.userId = ctx.from.id;

        // Ottieni il bot dal contesto della scene
        const bot = ctx.scene.state.bot;
        
        if (!bot) {
            console.error('Bot non trovato nel contesto della scene');
            await ctx.reply('❌ Errore di configurazione. Riprova.');
            return ctx.scene.leave();
        }

        // Crea l'annuncio
        const announcement = await bot.announcementService.createAnnouncement(data);
        
        // Ottieni statistiche utente per badge
        const userStats = await bot.userService.getUserStats(ctx.from.id);
        
        // IMPORTANTE: Usa il metodo che formatta con posizione copiabile
        const groupMessage = bot.announcementService.formatAnnouncementForGroup(
            announcement,
            userStats
        );
        
        // Pubblica nel topic del gruppo
        try {
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
                '🎉 **ANNUNCIO PUBBLICATO CON SUCCESSO!**\n\n' +
                `📋 ID Annuncio: \`${announcement.announcementId}\`\n\n` +
                'Il tuo annuncio è ora visibile a tutti gli utenti. ' +
                'Riceverai notifiche quando qualcuno sarà interessato.',
                { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '👀 Vedi i miei annunci', callback_data: 'view_my_announcements' }],
                            [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );
            
            console.log(`Annuncio creato da utente ${ctx.from.id}: ${announcement.announcementId}`);
            
        } catch (error) {
            console.error('Errore pubblicazione nel gruppo:', error);
            await ctx.reply(
                '⚠️ **Annuncio salvato ma non pubblicato nel gruppo**\n\n' +
                'Contatta l\'amministratore per risolvere il problema.',
                { parse_mode: 'Markdown' }
            );
        }
        
        // Reset sessione
        ctx.session.announcementData = {};
        ctx.session.step = null;
        
    } catch (error) {
        console.error('Errore nella pubblicazione dell\'annuncio:', error);
        await ctx.reply(
            '❌ **Errore nella pubblicazione**\n\n' +
            'Si è verificato un errore. Riprova tra qualche minuto.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔄 Riprova', callback_data: 'confirm_publish' },
                        { text: '❌ Annulla', callback_data: 'cancel' }
                    ]]
                }
            }
        );
    }
});

// Gestione pulsanti di navigazione
scene.action('availability_always', async (ctx) => {
    ctx.session.announcementData.availability = 'Sempre disponibile';
    
    await ctx.editMessageText(
        '📞 **CONTATTI**\n\nCome possono contattarti?\n\n*Esempio: Telegram @username, WhatsApp +39123456789*',
        { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Solo Telegram', callback_data: 'contact_telegram' }],
                    [{ text: '❌ Annulla', callback_data: 'cancel' }]
                ]
            }
        }
    );
    ctx.session.step = 'contact';
});

scene.action('contact_telegram', async (ctx) => {
    const username = ctx.from.username ? `@${ctx.from.username}` : 'Telegram';
    ctx.session.announcementData.contactInfo = username;
    await askPricingType(ctx);
});

scene.action('back_to_pricing', async (ctx) => {
    // Reset pricing data
    delete ctx.session.announcementData.pricingType;
    delete ctx.session.announcementData.basePrice;
    delete ctx.session.announcementData.pricingTiers;
    delete ctx.session.announcementData.minimumKwh;
    ctx.session.step = null;
    
    await askPricingType(ctx);
});

scene.action('back_to_minimum_choice', async (ctx) => {
    const data = ctx.session.announcementData;
    
    if (data.pricingType === 'fixed') {
        await ctx.editMessageText(
            `✅ **Prezzo impostato: ${data.basePrice.toFixed(2)}€/KWH**\n\n` +
            '🎯 **VUOI AGGIUNGERE UN MINIMO GARANTITO?**\n\n' +
            'Questo significa che anche se si ricarica poco, si paga comunque un minimo.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Sì, aggiungi minimo', callback_data: 'add_minimum_yes' }],
                        [{ text: '❌ No, solo prezzo fisso', callback_data: 'add_minimum_no' }]
                    ]
                }
            }
        );
    } else {
        await ctx.editMessageText(
            '🎯 **VUOI AGGIUNGERE UN MINIMO GARANTITO?**',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Sì, aggiungi minimo', callback_data: 'add_minimum_yes' }],
                        [{ text: '❌ No, solo prezzi graduati', callback_data: 'add_minimum_no' }]
                    ]
                }
            }
        );
    }
});

// Pulsanti di navigazione generali
scene.action('view_my_announcements', async (ctx) => {
    return ctx.scene.enter('my_announcements');
});

scene.action('back_to_main', async (ctx) => {
    return ctx.scene.leave();
});

scene.action('cancel', async (ctx) => {
    try {
        await ctx.editMessageText(
            '❌ **Operazione annullata**\n\nPuoi sempre creare un annuncio dal menu principale.',
            { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🏠 Menu Principale', callback_data: 'back_to_main' }
                    ]]
                }
            }
        );
        
        // Reset sessione
        ctx.session.announcementData = {};
        ctx.session.step = null;
        
        setTimeout(() => {
            ctx.scene.leave();
        }, 2000);
        
    } catch (error) {
        console.error('Errore nell\'annullamento:', error);
        return ctx.scene.leave();
    }
});

// Gestione uscita dalla scene
scene.leave(async (ctx) => {
    // Pulizia finale della sessione
    delete ctx.session.announcementData;
    delete ctx.session.step;
});

// Funzione helper per creare la scene con il bot iniettato
function createSellAnnouncementScene(bot) {
    // Inietta il bot nel contesto della scene
    scene.state.bot = bot;
    return scene;
}

module.exports = { createSellAnnouncementScene };
