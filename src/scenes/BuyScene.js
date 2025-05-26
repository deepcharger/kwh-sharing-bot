const { Scenes, Markup } = require('telegraf');
const AnnouncementService = require('../services/AnnouncementService');
const TransactionService = require('../services/TransactionService');
const Messages = require('../utils/Messages');
const logger = require('../utils/logger');

// Scene per il processo di acquisto
const scene = new Scenes.BaseScene('buy_energy_scene');

scene.enter(async (ctx) => {
    try {
        // Reset dei dati di sessione
        ctx.session.buyData = {};
        
        // Mostra annunci disponibili
        const announcements = await AnnouncementService.getActiveAnnouncements(10);
        
        if (announcements.length === 0) {
            await ctx.reply(
                '📭 **NESSUNA OFFERTA DISPONIBILE**\n\nAl momento non ci sono offerte di energia.\n\nTorna più tardi o crea tu un annuncio di vendita!',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔋 Vendi Energia', callback_data: 'sell_energy' }],
                            [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );
            return ctx.scene.leave();
        }

        await showAnnouncementsList(ctx, announcements);
        
    } catch (error) {
        logger.error('Errore nell\'ingresso della scene buy:', error);
        await ctx.reply('❌ Errore nel caricamento delle offerte. Riprova.');
        return ctx.scene.leave();
    }
});

async function showAnnouncementsList(ctx, announcements) {
    let message = `🛒 **OFFERTE DISPONIBILI**\n\nScegli un'offerta per vedere i dettagli:\n\n`;

    const keyboard = [];
    
    for (let i = 0; i < Math.min(announcements.length, 8); i++) {
        const ann = announcements[i];
        
        // Filtra annunci propri
        if (ann.userId._id.toString() === ctx.from.id.toString()) {
            continue;
        }
        
        let buttonText = '';
        let previewText = '';
        
        if (ann.pricingType === 'fixed') {
            buttonText = `💰 ${ann.basePrice}€/KWH`;
            previewText = `💰 Prezzo fisso: ${ann.basePrice}€/KWH`;
        } else {
            const firstTier = ann.pricingTiers[0];
            const lastTier = ann.pricingTiers[ann.pricingTiers.length - 1];
            buttonText = `📊 ${firstTier.price}-${lastTier.price}€/KWH`;
            previewText = `📊 Prezzi graduati: da ${firstTier.price}€/KWH`;
        }
        
        message += `${i + 1}. 📍 **${ann.location}**\n`;
        message += `   ${previewText}\n`;
        if (ann.minimumKwh) {
            message += `   🎯 Minimo: ${ann.minimumKwh} KWH\n`;
        }
        message += `   👤 ${ann.userId.username || ann.userId.firstName}\n\n`;
        
        // Tronca il testo del pulsante se troppo lungo
        const locationText = ann.location.length > 25 ? ann.location.substring(0, 22) + '...' : ann.location;
        buttonText = `${buttonText} - ${locationText}`;
        
        keyboard.push([{
            text: buttonText,
            callback_data: `view_announcement_${ann._id}`
        }]);
    }

    if (keyboard.length === 0) {
        await ctx.reply(
            '📭 **NESSUNA OFFERTA DISPONIBILE**\n\nTutti gli annunci attivi sono tuoi. Non puoi acquistare dalle tue stesse offerte!',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔋 Crea Altro Annuncio', callback_data: 'sell_energy' }],
                        [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                    ]
                }
            }
        );
        return ctx.scene.leave();
    }

    keyboard.push([{ text: '🔄 Aggiorna Lista', callback_data: 'refresh_list' }]);
    keyboard.push([{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]);

    await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
}

// Visualizza dettagli annuncio
scene.action(/^view_announcement_(.+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const announcementId = ctx.match[1];
        
        const announcement = await AnnouncementService.getAnnouncementById(announcementId);
        
        if (!announcement || !announcement.isActive) {
            await ctx.editMessageText(Messages.ERROR_MESSAGES.ANNOUNCEMENT_NOT_FOUND, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Torna alle offerte', callback_data: 'refresh_list' }
                    ]]
                }
            });
            return;
        }

        // Verifica che non sia il proprio annuncio
        if (announcement.userId._id.toString() === ctx.from.id.toString()) {
            await ctx.editMessageText(Messages.ERROR_MESSAGES.CANNOT_BUY_OWN, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 I Miei Annunci', callback_data: 'my_announcements' }],
                        [{ text: '🔙 Torna alle offerte', callback_data: 'refresh_list' }]
                    ]
                }
            });
            return;
        }

        // Ottieni stats del venditore per il badge
        const sellerStats = await TransactionService.getUserStats(announcement.userId._id);
        
        // Formatta messaggio dettagliato
        let detailMessage = Messages.formatAnnouncementDisplay(announcement, sellerStats);
        
        // Aggiungi esempi di prezzo
        detailMessage += `\n\n${Messages.formatPriceExamples(announcement)}`;

        const keyboard = [
            [{ text: '🛒 Acquista Energia', callback_data: `start_buy_${announcement._id}` }],
            [{ text: '📞 Contatta Venditore', callback_data: `contact_seller_${announcement._id}` }],
            [{ text: '🔙 Torna alle offerte', callback_data: 'refresh_list' }]
        ];

        await ctx.editMessageText(detailMessage, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (error) {
        logger.error('Errore in view_announcement:', error);
        await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
    }
});

// Inizia processo di acquisto
scene.action(/^start_buy_(.+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const announcementId = ctx.match[1];
        
        // Salva l'annuncio nella sessione
        ctx.session.buyData.announcementId = announcementId;
        
        await ctx.editMessageText(
            Messages.BUY_PROCESS_START,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Annulla', callback_data: 'refresh_list' }]
                    ]
                }
            }
        );
        
        // Imposta lo step per aspettare la quantità
        ctx.session.buyData.step = 'waiting_kwh';

    } catch (error) {
        logger.error('Errore in start_buy:', error);
        await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
    }
});

// Contatta venditore
scene.action(/^contact_seller_(.+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const announcementId = ctx.match[1];
        
        const announcement = await AnnouncementService.getAnnouncementById(announcementId);
        if (!announcement) {
            await ctx.reply(Messages.ERROR_MESSAGES.ANNOUNCEMENT_NOT_FOUND);
            return;
        }

        let contactMessage = `📞 **CONTATTI VENDITORE**\n\n`;
        contactMessage += `👤 **Nome:** ${announcement.userId.firstName}`;
        if (announcement.userId.username) {
            contactMessage += ` (@${announcement.userId.username})`;
        }
        contactMessage += `\n\n`;
        
        if (announcement.contactInfo) {
            contactMessage += `📱 **Contatti:** ${announcement.contactInfo}\n\n`;
        }
        
        contactMessage += `📍 **Posizione:** ${announcement.location}\n`;
        contactMessage += `💰 **Prezzi:** Vedi dettagli dell'annuncio\n\n`;
        contactMessage += `💡 **Suggerimento:** Contatta il venditore per accordarti sui dettagli della ricarica!`;

        await ctx.editMessageText(contactMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🛒 Acquista invece', callback_data: `start_buy_${announcementId}` }],
                    [{ text: '🔙 Torna ai dettagli', callback_data: `view_announcement_${announcementId}` }]
                ]
            }
        });

    } catch (error) {
        logger.error('Errore in contact_seller:', error);
        await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
    }
});

// Gestione input KWH
scene.on('text', async (ctx) => {
    try {
        if (!ctx.session.buyData || ctx.session.buyData.step !== 'waiting_kwh') {
            return; // Non stiamo aspettando input
        }

        const text = ctx.message.text.trim();
        const kwhAmount = parseFloat(text.replace(',', '.'));
        
        if (isNaN(kwhAmount) || kwhAmount <= 0 || kwhAmount > 1000) {
            await ctx.reply(Messages.ERROR_MESSAGES.INVALID_AMOUNT);
            return;
        }

        const announcementId = ctx.session.buyData.announcementId;
        const announcement = await AnnouncementService.getAnnouncementById(announcementId);
        
        if (!announcement || !announcement.isActive) {
            await ctx.reply(Messages.ERROR_MESSAGES.ANNOUNCEMENT_NOT_FOUND);
            return;
        }

        // Calcola il prezzo con il nuovo sistema
        const calculation = Messages.calculateExamplePrice(announcement, kwhAmount);
        
        // Salva i dati
        ctx.session.buyData.kwhAmount = kwhAmount;
        ctx.session.buyData.calculation = calculation;
        ctx.session.buyData.step = 'confirm';

        // Mostra riepilogo per conferma
        const confirmMessage = Messages.formatBuyConfirmation(announcement, kwhAmount);
        
        const keyboard = [
            [{ text: '✅ Confermo l\'acquisto', callback_data: `confirm_purchase` }],
            [{ text: '✏️ Cambia quantità', callback_data: `start_buy_${announcementId}` }],
            [{ text: '❌ Annulla', callback_data: 'refresh_list' }]
        ];

        await ctx.reply(confirmMessage, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (error) {
        logger.error('Errore nella gestione del testo:', error);
        await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
    }
});

// Conferma acquisto
scene.action('confirm_purchase', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        
        if (!ctx.session.buyData || ctx.session.buyData.step !== 'confirm') {
            await ctx.reply('❌ Errore: dati di acquisto non validi.');
            return;
        }

        const { announcementId, kwhAmount } = ctx.session.buyData;
        
        // Crea la transazione
        const announcement = await AnnouncementService.getAnnouncementById(announcementId);
        
        const transactionData = {
            buyerId: ctx.from.id,
            sellerId: announcement.userId._id,
            announcementId: announcementId,
            kwhAmount: kwhAmount
        };

        const transaction = await TransactionService.createTransaction(transactionData);
        
        // Pulisci sessione
        ctx.session.buyData = {};

        await ctx.editMessageText(
            `✅ **RICHIESTA INVIATA!**\n\n` +
            `La tua richiesta di acquisto è stata inviata al venditore.\n\n` +
            `🆔 **ID Transazione:** \`${transaction._id.toString().slice(-8)}\`\n` +
            `⚡ **KWH:** ${transaction.kwhAmount}\n` +
            `💰 **Totale:** €${transaction.totalAmount.toFixed(2)}\n\n` +
            `Riceverai una notifica quando il venditore risponderà alla richiesta.\n\n` +
            `📱 **Prossimi passi:**\n` +
            `1. Attendi conferma del venditore\n` +
            `2. Organizzati per la ricarica\n` +
            `3. Effettua il pagamento concordato\n` +
            `4. Conferma il completamento\n` +
            `5. Lascia una recensione`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }],
                        [{ text: '🛒 Acquista Altro', callback_data: 'refresh_list' }],
                        [{ text: '🏠 Menu Principale', callback_data: 'back_to_main' }]
                    ]
                }
            }
        );

        // Invia notifica al venditore
        try {
            const notificationMessage = Messages.formatTransactionRequest(transaction, announcement);
            
            await ctx.telegram.sendMessage(
                announcement.userId._id,
                notificationMessage,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Conferma', callback_data: `confirm_transaction_${transaction._id}` },
                                { text: '❌ Rifiuta', callback_data: `reject_transaction_${transaction._id}` }
                            ],
                            [{ text: '💼 Le Mie Transazioni', callback_data: 'my_transactions' }]
                        ]
                    }
                }
            );
            
            logger.info(`Notifica inviata al venditore ${announcement.userId._id} per transazione ${transaction._id}`);
            
        } catch (notificationError) {
            logger.error('Errore nell\'invio della notifica al venditore:', notificationError);
            // La transazione è comunque creata
        }

        // Esci dalla scene
        setTimeout(() => {
            ctx.scene.leave();
        }, 2000);

    } catch (error) {
        logger.error('Errore in confirm_purchase:', error);
        await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
    }
});

// Refresh lista annunci
scene.action('refresh_list', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        
        // Reset dati di sessione
        ctx.session.buyData = {};
        
        const announcements = await AnnouncementService.getActiveAnnouncements(10);
        await showAnnouncementsList(ctx, announcements);

    } catch (error) {
        logger.error('Errore in refresh_list:', error);
        await ctx.reply(Messages.ERROR_MESSAGES.GENERIC_ERROR);
    }
});

// Esci dalla scene
scene.action('back_to_main', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        
        // Pulisci sessione
        ctx.session.buyData = {};
        
        await ctx.scene.leave();
        
        // Torna al menu principale
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔋 Vendi Energia', 'sell_energy')],
            [Markup.button.callback('🛒 Compra Energia', 'buy_energy')],
            [Markup.button.callback('💼 Le Mie Transazioni', 'my_transactions')],
            [Markup.button.callback('📋 I Miei Annunci', 'my_announcements')]
        ]);

        await ctx.editMessageText(Messages.WELCOME, { 
            parse_mode: 'Markdown',
            ...keyboard
        });
        
    } catch (error) {
        logger.error('Errore in back_to_main:', error);
        await ctx.scene.leave();
    }
});

scene.action('my_transactions', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    // Il bot handler gestirà this.my_transactions
});

scene.action('my_announcements', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    // Il bot handler gestirà this.my_announcements
});

scene.action('sell_energy', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('sell_announcement');
});

// Cleanup quando si esce dalla scene
scene.leave(async (ctx) => {
    // Pulizia finale
    delete ctx.session.buyData;
});

module.exports = scene;
