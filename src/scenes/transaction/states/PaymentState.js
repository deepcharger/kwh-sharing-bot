// src/scenes/transaction/states/PaymentState.js
const { TRANSACTION_STATUS } = require('../../../config/constants');
const Messages = require('../../../utils/messages/Messages');
const Keyboards = require('../../../utils/keyboards/Keyboards');
const MarkdownEscape = require('../../../utils/helpers/MarkdownEscape');
const logger = require('../../../utils/logger');

class PaymentState {
    constructor(bot) {
        this.bot = bot;
        this.services = bot.services;
        this.chatCleaner = bot.chatCleaner;
    }

    /**
     * Handle payment state based on transaction status
     */
    async handle(ctx, transaction, announcement) {
        const status = transaction.status;
        const userId = ctx.from.id;
        const isSeller = userId === transaction.sellerId;
        const isBuyer = userId === transaction.buyerId;

        switch (status) {
            case TRANSACTION_STATUS.KWH_DECLARED:
                return await this.handleKwhDeclared(ctx, transaction, announcement, isSeller, isBuyer);
                
            case TRANSACTION_STATUS.PAYMENT_REQUESTED:
                return await this.handlePaymentRequested(ctx, transaction, announcement, isSeller, isBuyer);
                
            case TRANSACTION_STATUS.PAYMENT_DECLARED:
                return await this.handlePaymentDeclared(ctx, transaction, announcement, isSeller, isBuyer);
                
            default:
                return false;
        }
    }

    /**
     * Handle KWH declared state
     */
    async handleKwhDeclared(ctx, transaction, announcement, isSeller, isBuyer) {
        if (isSeller) {
            await this.showKwhValidation(ctx, transaction, announcement);
        } else if (isBuyer) {
            await this.showKwhDeclaredBuyer(ctx, transaction);
        }
        return true;
    }

    /**
     * Show KWH validation for seller
     */
    async showKwhValidation(ctx, transaction, announcement) {
        let message = `📸 **RICARICA COMPLETATA**\n\n`;
        
        if (transaction.actualKwh && transaction.actualKwh < transaction.declaredKwh) {
            message += `⚠️ **MINIMO APPLICATO:**\n`;
            message += `• KWH reali: ${transaction.actualKwh}\n`;
            message += `• KWH fatturati: ${transaction.declaredKwh} (minimo garantito)\n\n`;
        } else {
            message += `L'acquirente dichiara: **${transaction.declaredKwh} KWH**\n\n`;
        }

        // Calculate amount
        const calculation = this.services.transaction.calculatePrice(announcement, transaction.declaredKwh);
        
        message += `💰 **Calcolo importo:**\n`;
        message += `• Prezzo: ${calculation.pricePerKwh}€/KWH\n`;
        
        if (announcement.pricingType === 'graduated' && calculation.appliedTier) {
            if (calculation.appliedTier.limit) {
                message += `• Fascia applicata: fino a ${calculation.appliedTier.limit} KWH\n`;
            } else {
                message += `• Fascia applicata: oltre ${announcement.pricingTiers[announcement.pricingTiers.length - 2]?.limit || '?'} KWH\n`;
            }
        }
        
        message += `• **Totale: €${calculation.totalAmount.toFixed(2)}**\n\n`;
        message += `Verifica che i dati siano corretti.`;

        const shortId = this.generateShortId(transaction.transactionId);
        this.bot.cacheTransactionId(shortId, transaction.transactionId);

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Corretti', callback_data: `kwh_ok_${shortId}` },
                        { text: '❌ Non corretti', callback_data: `kwh_bad_${shortId}` }
                    ],
                    [{ text: '📷 Vedi foto', callback_data: `view_photo_${shortId}` }]
                ]
            }
        });

        // Send photo if available
        if (transaction.displayPhotoId) {
            try {
                await ctx.telegram.sendPhoto(ctx.chat.id, transaction.displayPhotoId);
            } catch (error) {
                logger.error('Error sending display photo:', error);
            }
        }
    }

    /**
     * Show KWH declared for buyer
     */
    async showKwhDeclaredBuyer(ctx, transaction) {
        const message = `✅ **DATI INVIATI**\n\n` +
            `Hai dichiarato: ${transaction.declaredKwh} KWH\n\n` +
            `⏳ In attesa della conferma del venditore.\n` +
            `Una volta confermati i KWH, potrai procedere con il pagamento.`;

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
     * Handle payment requested state
     */
    async handlePaymentRequested(ctx, transaction, announcement, isSeller, isBuyer) {
        if (isBuyer) {
            await this.showPaymentRequest(ctx, transaction, announcement);
        } else if (isSeller) {
            await this.showWaitingForPayment(ctx, transaction, announcement);
        }
        return true;
    }

    /**
     * Show payment request for buyer
     */
    async showPaymentRequest(ctx, transaction, announcement) {
        const amount = transaction.totalAmount || 
            (transaction.declaredKwh * (announcement.price || announcement.basePrice));

        let message = `💳 **RICHIESTA PAGAMENTO**\n\n`;
        
        message += `⚡ KWH confermati: ${transaction.declaredKwh}\n`;
        
        if (transaction.actualKwh && transaction.actualKwh < transaction.declaredKwh) {
            message += `⚠️ *Minimo applicato (hai ricaricato ${transaction.actualKwh} KWH)*\n`;
        }
        
        if (transaction.pricePerKwh) {
            message += `💰 Prezzo: ${transaction.pricePerKwh}€/KWH\n`;
        }
        
        message += `💵 **TOTALE DA PAGARE: €${amount.toFixed(2)}**\n\n`;
        
        message += `💳 **Metodi accettati:**\n`;
        message += `${MarkdownEscape.escape(announcement.paymentMethods)}\n\n`;
        
        message += `📝 **Istruzioni:**\n`;
        message += `1. Effettua il pagamento con uno dei metodi indicati\n`;
        message += `2. Una volta completato, premi "Ho pagato"\n`;
        message += `3. Il venditore confermerà la ricezione`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💳 Ho pagato', callback_data: 'tx_payment_done' }],
                    [{ text: '❌ Ho problemi', callback_data: 'payment_issues' }],
                    [{ text: '📞 Contatta venditore', callback_data: `contact_seller_${transaction.sellerId}` }]
                ]
            }
        });
    }

    /**
     * Show waiting for payment for seller
     */
    async showWaitingForPayment(ctx, transaction, announcement) {
        const amount = transaction.totalAmount || 
            (transaction.declaredKwh * (announcement.price || announcement.basePrice));

        const message = `⏳ **IN ATTESA DI PAGAMENTO**\n\n` +
            `L'acquirente deve pagare:\n` +
            `💰 Importo: €${amount.toFixed(2)}\n` +
            `💳 Metodi: ${MarkdownEscape.escape(announcement.paymentMethods)}\n\n` +
            `Riceverai una notifica quando l'acquirente dichiarerà di aver pagato.`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💬 Invia promemoria', callback_data: `send_payment_reminder_${transaction.transactionId}` }],
                    [{ text: '🔄 Aggiorna stato', callback_data: `refresh_tx_${transaction.transactionId}` }],
                    [{ text: '🔙 Indietro', callback_data: 'tx_back' }]
                ]
            }
        });
    }

    /**
     * Handle payment declared state
     */
    async handlePaymentDeclared(ctx, transaction, announcement, isSeller, isBuyer) {
        if (isSeller) {
            await this.showPaymentConfirmation(ctx, transaction, announcement);
        } else if (isBuyer) {
            await this.showPaymentDeclaredBuyer(ctx, transaction);
        }
        return true;
    }

    /**
     * Show payment confirmation for seller
     */
    async showPaymentConfirmation(ctx, transaction, announcement) {
        const amount = transaction.totalAmount || 
            (transaction.declaredKwh * (announcement.price || announcement.basePrice));

        const buyer = await this.services.user.getUser(transaction.buyerId);
        
        const message = `💳 **PAGAMENTO DICHIARATO**\n\n` +
            `L'acquirente @${MarkdownEscape.escape(buyer?.username || 'utente')} dichiara di aver pagato.\n\n` +
            `💰 Importo atteso: €${amount.toFixed(2)}\n` +
            `💳 Metodo: ${MarkdownEscape.escape(announcement.paymentMethods)}\n\n` +
            `Hai ricevuto il pagamento?`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Sì, ricevuto', callback_data: 'tx_payment_received' },
                        { text: '❌ Non ricevuto', callback_data: 'tx_payment_not_received' }
                    ],
                    [{ text: '📷 Richiedi prova', callback_data: `request_payment_proof_${transaction.transactionId}` }]
                ]
            }
        });
    }

    /**
     * Show payment declared for buyer
     */
    async showPaymentDeclaredBuyer(ctx, transaction) {
        const message = `✅ **PAGAMENTO DICHIARATO**\n\n` +
            `Hai dichiarato di aver effettuato il pagamento.\n\n` +
            `⏳ In attesa della conferma del venditore.\n\n` +
            `Se il venditore non conferma entro breve, puoi:\n` +
            `• Inviare una prova di pagamento\n` +
            `• Contattare direttamente il venditore\n` +
            `• Chiedere assistenza all'admin`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📷 Invia prova pagamento', callback_data: 'send_payment_proof' }],
                    [{ text: '📞 Contatta venditore', callback_data: `contact_seller_${transaction.sellerId}` }],
                    [{ text: '🚨 Chiama admin', callback_data: 'contact_admin' }],
                    [{ text: '🔙 Indietro', callback_data: 'tx_back' }]
                ]
            }
        });
    }

    /**
     * Process payment confirmation
     */
    async processPaymentConfirmation(ctx, transaction, confirmed) {
        if (confirmed) {
            // Update to completed
            await this.services.transaction.updateTransactionStatus(
                transaction.transactionId,
                TRANSACTION_STATUS.COMPLETED
            );

            // Update user stats
            await this.services.user.updateUserTransactionStats(
                transaction.sellerId,
                transaction.actualKwh || transaction.declaredKwh,
                'sell'
            );
            
            await this.services.user.updateUserTransactionStats(
                transaction.buyerId,
                transaction.actualKwh || transaction.declaredKwh,
                'buy'
            );

            // Notify both parties
            await this.notifyTransactionCompleted(transaction);

            await ctx.editMessageText(
                '🎉 **TRANSAZIONE COMPLETATA!**\n\n' +
                'Il pagamento è stato confermato e la transazione è completata.\n' +
                'Entrambi riceverete una richiesta di feedback.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⭐ Lascia feedback', callback_data: `feedback_tx_${transaction.transactionId}` }],
                            [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );
        } else {
            // Handle payment issue
            await this.handlePaymentIssue(ctx, transaction);
        }
    }

    /**
     * Handle payment issue
     */
    async handlePaymentIssue(ctx, transaction) {
        await this.services.transaction.addTransactionIssue(
            transaction.transactionId,
            'Pagamento non ricevuto dal venditore',
            ctx.from.id
        );

        try {
            await this.bot.bot.telegram.sendMessage(
                transaction.buyerId,
                Messages.templates.payment.paymentNotReceived(),
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            logger.error('Error notifying buyer about payment issue:', error);
        }

        await ctx.editMessageText(
            '⚠️ **PROBLEMA PAGAMENTO**\n\n' +
            'L\'acquirente è stato informato del problema.\n' +
            'Potete risolvere la questione privatamente o contattare l\'admin.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📞 Contatta acquirente', callback_data: `contact_buyer_${transaction.buyerId}` }],
                        [{ text: '🚨 Chiama admin', callback_data: 'contact_admin' }],
                        [{ text: '🔙 Indietro', callback_data: 'tx_back' }]
                    ]
                }
            }
        );
    }

    /**
     * Send payment reminder
     */
    async sendPaymentReminder(ctx, transaction) {
        try {
            await this.bot.bot.telegram.sendMessage(
                transaction.buyerId,
                `⏰ **PROMEMORIA PAGAMENTO**\n\n` +
                `Ricordati di completare il pagamento per la transazione.\n\n` +
                `ID: \`${transaction.transactionId}\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💳 Vai al pagamento', callback_data: `open_tx_${transaction.transactionId}` }]
                        ]
                    }
                }
            );

            await ctx.answerCbQuery('✅ Promemoria inviato', { show_alert: true });
        } catch (error) {
            logger.error('Error sending payment reminder:', error);
            await ctx.answerCbQuery('❌ Errore invio promemoria', { show_alert: true });
        }
    }

    /**
     * Request payment proof
     */
    async requestPaymentProof(ctx, transaction) {
        try {
            await this.bot.bot.telegram.sendMessage(
                transaction.buyerId,
                `📷 **RICHIESTA PROVA PAGAMENTO**\n\n` +
                `Il venditore richiede una prova del pagamento effettuato.\n` +
                `Invia uno screenshot che mostri:\n` +
                `• Importo inviato\n` +
                `• Data/ora transazione\n` +
                `• Destinatario\n\n` +
                `ID: \`${transaction.transactionId}\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📷 Invia prova', callback_data: 'send_payment_proof' }]
                        ]
                    }
                }
            );

            await ctx.answerCbQuery('✅ Richiesta inviata', { show_alert: true });
        } catch (error) {
            logger.error('Error requesting payment proof:', error);
            await ctx.answerCbQuery('❌ Errore invio richiesta', { show_alert: true });
        }
    }

    /**
     * Notify transaction completed
     */
    async notifyTransactionCompleted(transaction) {
        // Notify buyer
        try {
            await this.bot.bot.telegram.sendMessage(
                transaction.buyerId,
                Messages.templates.feedback.requestFeedback(transaction, 'buyer'),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⭐ Valuta il venditore', callback_data: `feedback_tx_${transaction.transactionId}` }]
                        ]
                    }
                }
            );
        } catch (error) {
            logger.error('Error notifying buyer for feedback:', error);
        }

        // Notify seller
        try {
            await this.bot.bot.telegram.sendMessage(
                transaction.sellerId,
                Messages.templates.feedback.requestFeedback(transaction, 'seller'),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⭐ Valuta l\'acquirente', callback_data: `feedback_tx_${transaction.transactionId}` }]
                        ]
                    }
                }
            );
        } catch (error) {
            logger.error('Error notifying seller for feedback:', error);
        }
    }

    /**
     * Generate short ID
     */
    generateShortId(fullId) {
        return fullId.slice(-10);
    }
}

module.exports = PaymentState;
