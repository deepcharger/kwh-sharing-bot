// src/scenes/transaction/states/ChargingState.js
const { TRANSACTION_STATUS } = require('../../../config/constants');
const Messages = require('../../../utils/messages/Messages');
const Keyboards = require('../../../utils/keyboards/Keyboards');
const logger = require('../../../utils/logger');

class ChargingState {
    constructor(bot) {
        this.bot = bot;
        this.services = bot.services;
        this.chatCleaner = bot.chatCleaner;
    }

    /**
     * Handle charging state based on transaction status
     */
    async handle(ctx, transaction, announcement) {
        const status = transaction.status;
        const userId = ctx.from.id;
        const isSeller = userId === transaction.sellerId;
        const isBuyer = userId === transaction.buyerId;

        switch (status) {
            case TRANSACTION_STATUS.CONFIRMED:
                return await this.handleConfirmed(ctx, transaction, isSeller, isBuyer);
                
            case TRANSACTION_STATUS.BUYER_ARRIVED:
                return await this.handleBuyerArrived(ctx, transaction, isSeller, isBuyer);
                
            case TRANSACTION_STATUS.CHARGING_STARTED:
                return await this.handleChargingStarted(ctx, transaction, isSeller, isBuyer);
                
            case TRANSACTION_STATUS.CHARGING_IN_PROGRESS:
                return await this.handleChargingInProgress(ctx, transaction, isSeller, isBuyer);
                
            case TRANSACTION_STATUS.CHARGING_COMPLETED:
                return await this.handleChargingCompleted(ctx, transaction, isSeller, isBuyer);
                
            default:
                return false;
        }
    }

    /**
     * Handle confirmed state
     */
    async handleConfirmed(ctx, transaction, isSeller, isBuyer) {
        if (isSeller) {
            await this.showSellerConfirmedView(ctx, transaction);
        } else if (isBuyer) {
            await this.showBuyerConfirmedView(ctx, transaction);
        }
        return true;
    }

    /**
     * Show seller view for confirmed transaction
     */
    async showSellerConfirmedView(ctx, transaction) {
        const message = `✅ **RICHIESTA ACCETTATA**\n\n` +
            `L'acquirente arriverà il: ${transaction.scheduledDate}\n` +
            `📍 Luogo: ${transaction.location}\n` +
            `🏢 Brand: ${transaction.brand}\n` +
            `🔌 Connettore: ${transaction.connector}\n\n` +
            `⏳ Attendi che l'acquirente confermi di essere arrivato alla colonnina.`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📊 Dettagli transazione', callback_data: `tx_details_${transaction.transactionId}` }],
                    [{ text: '🔙 Indietro', callback_data: 'tx_back' }]
                ]
            }
        });
    }

    /**
     * Show buyer view for confirmed transaction
     */
    async showBuyerConfirmedView(ctx, transaction) {
        let message = `✅ **RICHIESTA CONFERMATA**\n\n` +
            `Il venditore ha accettato la tua richiesta!\n\n` +
            `📅 Data/ora: ${transaction.scheduledDate}\n`;

        if (transaction.locationCoords?.latitude && transaction.locationCoords?.longitude) {
            const lat = transaction.locationCoords.latitude;
            const lng = transaction.locationCoords.longitude;
            message += `📍 **Posizione:** [Apri in Google Maps](https://www.google.com/maps?q=${lat},${lng})\n`;
        } else {
            message += `📍 Posizione: ${transaction.location}\n`;
        }

        message += `🏢 Brand: ${transaction.brand}\n` +
            `🔌 Connettore: ${transaction.connector}\n\n` +
            `🚗 Quando arrivi alla colonnina, premi il bottone sotto per avvisare il venditore.`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📍 Sono arrivato alla colonnina', callback_data: `tx_arrived_at_station` }],
                    [{ text: '🔙 Indietro', callback_data: 'tx_back' }]
                ]
            }
        });
    }

    /**
     * Handle buyer arrived state
     */
    async handleBuyerArrived(ctx, transaction, isSeller, isBuyer) {
        if (isSeller) {
            await this.showActivationOptions(ctx, transaction);
        } else if (isBuyer) {
            await this.showWaitingForActivation(ctx, transaction);
        }
        return true;
    }

    /**
     * Show activation options for seller
     */
    async showActivationOptions(ctx, transaction) {
        const message = `⏰ **L'ACQUIRENTE È ARRIVATO!**\n\n` +
            `L'acquirente è alla colonnina e pronto per la ricarica.\n\n` +
            `📍 Posizione: ${transaction.location}\n` +
            `🏢 Colonnina: ${transaction.brand}\n` +
            `🔌 Connettore: ${transaction.connector}\n\n` +
            `È il momento di attivare la ricarica!`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⚡ Attiva ricarica ORA', callback_data: 'tx_activate_charging' }],
                    [{ text: '⏸️ Ritarda di 5 min', callback_data: 'tx_delay_charging' }],
                    [{ text: '❌ Problemi tecnici', callback_data: 'tx_technical_issues' }]
                ]
            }
        });
    }

    /**
     * Show waiting view for buyer
     */
    async showWaitingForActivation(ctx, transaction) {
        const message = `✅ **ARRIVO CONFERMATO**\n\n` +
            `Il venditore è stato avvisato del tuo arrivo.\n\n` +
            `⏳ Attendi che il venditore attivi la ricarica.\n\n` +
            `💡 **Nel frattempo:**\n` +
            `• Verifica che il connettore sia quello giusto\n` +
            `• Assicurati che l'auto sia pronta per ricevere la ricarica\n` +
            `• Tieni il cavo a portata di mano`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Aggiorna stato', callback_data: `refresh_tx_${transaction.transactionId}` }],
                    [{ text: '📞 Contatta venditore', callback_data: `contact_seller_${transaction.sellerId}` }],
                    [{ text: '🔙 Indietro', callback_data: 'tx_back' }]
                ]
            }
        });
    }

    /**
     * Handle charging started state
     */
    async handleChargingStarted(ctx, transaction, isSeller, isBuyer) {
        if (isSeller) {
            await this.showChargingStartedSeller(ctx, transaction);
        } else if (isBuyer) {
            await this.showChargingConfirmation(ctx, transaction);
        }
        return true;
    }

    /**
     * Show charging started view for seller
     */
    async showChargingStartedSeller(ctx, transaction) {
        const message = `⚡ **RICARICA ATTIVATA**\n\n` +
            `Hai attivato la ricarica.\n` +
            `In attesa della conferma dall'acquirente che la ricarica sia iniziata correttamente.\n\n` +
            `Se l'acquirente segnala problemi, potrai riprovare l'attivazione.`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Aggiorna stato', callback_data: `refresh_tx_${transaction.transactionId}` }],
                    [{ text: '🔙 Indietro', callback_data: 'tx_back' }]
                ]
            }
        });
    }

    /**
     * Show charging confirmation for buyer
     */
    async showChargingConfirmation(ctx, transaction) {
        const message = `⚡ **RICARICA ATTIVATA!**\n\n` +
            `Il venditore ha attivato la ricarica.\n` +
            `Controlla il connettore e verifica che la ricarica sia iniziata.\n\n` +
            `💡 **Verifica:**\n` +
            `• Il LED della colonnina è acceso?\n` +
            `• Il display mostra "In carica"?\n` +
            `• L'auto ha iniziato a ricaricare?`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Confermo, sta caricando', callback_data: 'tx_charging_confirmed' }],
                    [{ text: '❌ Non sta caricando', callback_data: 'tx_charging_failed' }]
                ]
            }
        });
    }

    /**
     * Handle charging in progress state
     */
    async handleChargingInProgress(ctx, transaction, isSeller, isBuyer) {
        if (isSeller) {
            await this.showChargingProgressSeller(ctx, transaction);
        } else if (isBuyer) {
            await this.showChargingProgressBuyer(ctx, transaction);
        }
        return true;
    }

    /**
     * Show charging progress for seller
     */
    async showChargingProgressSeller(ctx, transaction) {
        const startTime = transaction.chargingStartedAt || transaction.updatedAt;
        const duration = this.calculateDuration(startTime);

        const message = `🔋 **RICARICA IN CORSO**\n\n` +
            `L'acquirente sta ricaricando.\n\n` +
            `⏱️ Durata: ${duration}\n` +
            `🔌 Connettore: ${transaction.connector}\n\n` +
            `Riceverai una notifica quando l'acquirente completerà la ricarica.`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Aggiorna', callback_data: `refresh_tx_${transaction.transactionId}` }],
                    [{ text: '⚠️ Segnala problema', callback_data: `report_issue_${transaction.transactionId}` }],
                    [{ text: '🔙 Indietro', callback_data: 'tx_back' }]
                ]
            }
        });
    }

    /**
     * Show charging progress for buyer
     */
    async showChargingProgressBuyer(ctx, transaction) {
        const startTime = transaction.chargingStartedAt || transaction.updatedAt;
        const duration = this.calculateDuration(startTime);

        const message = `🔋 **RICARICA IN CORSO**\n\n` +
            `La ricarica sta procedendo correttamente.\n\n` +
            `⏱️ Durata: ${duration}\n` +
            `🔌 Connettore: ${transaction.connector}\n\n` +
            `Quando hai terminato, premi il pulsante sotto e invia la foto del display.`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏁 Ricarica completata', callback_data: 'tx_charging_finished' }],
                    [{ text: '🔄 Aggiorna', callback_data: `refresh_tx_${transaction.transactionId}` }],
                    [{ text: '⚠️ Segnala problema', callback_data: `report_issue_${transaction.transactionId}` }]
                ]
            }
        });
    }

    /**
     * Handle charging completed state
     */
    async handleChargingCompleted(ctx, transaction, isSeller, isBuyer) {
        if (isBuyer && !transaction.photoUploaded) {
            await this.requestDisplayPhoto(ctx);
        } else {
            await this.showChargingCompletedStatus(ctx, transaction, isSeller);
        }
        return true;
    }

    /**
     * Request display photo from buyer
     */
    async requestDisplayPhoto(ctx) {
        const message = `📸 **INVIA FOTO DEL DISPLAY**\n\n` +
            `Scatta una foto chiara del display che mostri i KWH erogati.\n\n` +
            `📱 **Suggerimenti per la foto:**\n` +
            `• Inquadra bene tutto il display\n` +
            `• Assicurati che i numeri siano leggibili\n` +
            `• Evita riflessi sullo schermo\n` +
            `• Se possibile, includi data/ora`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Annulla', callback_data: 'cancel_photo' }]
                ]
            }
        });

        ctx.session.waitingFor = 'display_photo';
    }

    /**
     * Show charging completed status
     */
    async showChargingCompletedStatus(ctx, transaction, isSeller) {
        const role = isSeller ? 'venditore' : 'acquirente';
        
        const message = `🏁 **RICARICA COMPLETATA**\n\n` +
            `Stato: In attesa della foto del display dall'acquirente.\n\n` +
            `Una volta ricevuta la foto con i KWH, potrai procedere con il pagamento.`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Aggiorna stato', callback_data: `refresh_tx_${transaction.transactionId}` }],
                    [{ text: '🔙 Indietro', callback_data: 'tx_back' }]
                ]
            }
        });
    }

    /**
     * Process display photo
     */
    async processDisplayPhoto(ctx, transaction, photo) {
        try {
            // Save photo reference
            await this.services.transaction.updateTransactionStatus(
                transaction.transactionId,
                TRANSACTION_STATUS.PHOTO_UPLOADED,
                { 
                    displayPhotoId: photo.file_id,
                    photoUploadedAt: new Date()
                }
            );

            // Ask for KWH amount
            await ctx.reply(
                '📷 **Foto ricevuta!**\n\n' +
                'Ora inserisci il numero di KWH mostrati sul display:',
                { parse_mode: 'Markdown' }
            );

            ctx.session.waitingFor = 'kwh_amount';
            ctx.session.photoFileId = photo.file_id;

            return true;
        } catch (error) {
            logger.error('Error processing display photo:', error);
            await ctx.reply('❌ Errore nel salvataggio della foto. Riprova.');
            return false;
        }
    }

    /**
     * Calculate duration
     */
    calculateDuration(startTime) {
        const now = new Date();
        const start = new Date(startTime);
        const diffMs = now - start;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;

        if (diffHours > 0) {
            return `${diffHours}h ${mins}min`;
        } else {
            return `${diffMins} minuti`;
        }
    }

    /**
     * Handle charging issues
     */
    async handleChargingIssue(ctx, transaction, issue) {
        await this.services.transaction.addTransactionIssue(
            transaction.transactionId,
            issue,
            ctx.from.id
        );

        const otherPartyId = ctx.from.id === transaction.sellerId ? 
            transaction.buyerId : transaction.sellerId;

        try {
            await this.bot.bot.telegram.sendMessage(
                otherPartyId,
                `⚠️ **PROBLEMA SEGNALATO**\n\n${issue}\n\nID: \`${transaction.transactionId}\``,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            logger.error('Error notifying issue:', error);
        }
    }

    /**
     * Handle retry activation
     */
    async handleRetryActivation(ctx, transaction) {
        const retryCount = await this.services.transaction.incrementRetryCount(
            transaction.transactionId
        );

        if (retryCount > 3) {
            await ctx.reply(
                '❌ **TROPPI TENTATIVI**\n\n' +
                'Hai raggiunto il limite massimo di tentativi.\n' +
                'Contatta l\'amministratore per assistenza.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📞 Contatta admin', callback_data: 'contact_admin' }],
                            [{ text: '🔙 Indietro', callback_data: 'tx_back' }]
                        ]
                    }
                }
            );
            return false;
        }

        // Reset to charging started
        await this.services.transaction.updateTransactionStatus(
            transaction.transactionId,
            TRANSACTION_STATUS.CHARGING_STARTED
        );

        // Notify buyer
        try {
            await this.bot.bot.telegram.sendMessage(
                transaction.buyerId,
                Messages.templates.charging.retryAttempt(transaction.transactionId),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Ora funziona!', callback_data: `charging_ok_${transaction.transactionId}` },
                                { text: '❌ Ancora non carica', callback_data: `charging_fail_${transaction.transactionId}` }
                            ]
                        ]
                    }
                }
            );
        } catch (error) {
            logger.error('Error notifying buyer about retry:', error);
        }

        await ctx.reply('🔄 Nuovo tentativo inviato all\'acquirente.');
        return true;
    }
}

module.exports = ChargingState;
