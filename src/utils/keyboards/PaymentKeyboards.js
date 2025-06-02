// src/utils/keyboards/PaymentKeyboards.js - NUOVO FILE
const { Markup } = require('telegraf');

class PaymentKeyboards {
    static getConfirmationKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Ho effettuato il pagamento', 'payment_completed')],
            [Markup.button.callback('❌ Ho problemi con il pagamento', 'payment_issues')],
            [Markup.button.callback('🏠 Torna al menu', 'back_to_main')]
        ]);
    }

    static getIssuesKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('💳 Riprovo il pagamento', 'retry_payment')],
            [Markup.button.callback('📷 Invio prova pagamento', 'send_payment_proof')],
            [Markup.button.callback('📞 Contatta venditore', 'contact_seller')],
            [Markup.button.callback('🚨 Chiama admin', 'contact_admin')]
        ]);
    }

    static getSellerConfirmKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Pagamento ricevuto', 'payment_received')],
            [Markup.button.callback('❌ Non ancora ricevuto', 'payment_not_received')]
        ]);
    }

    static getSellerPaymentConfirmKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Confermo ricezione', 'payment_received')],
            [Markup.button.callback('❌ Non ricevuto', 'payment_not_received')]
        ]);
    }
}

module.exports = PaymentKeyboards;
