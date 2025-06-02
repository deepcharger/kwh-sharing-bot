// src/utils/keyboards/ChargingKeyboards.js - NUOVO FILE
const { Markup } = require('telegraf');

class ChargingKeyboards {
    static getActivateKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('⚡ Attiva ricarica', 'activate_charging')],
            [Markup.button.callback('⏸️ Ritarda di 5 min', 'delay_charging')]
        ]);
    }

    static getBuyerConfirmKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Confermo, sta caricando', 'charging_confirmed')],
            [Markup.button.callback('❌ Non sta caricando', 'charging_failed')]
        ]);
    }

    static getChargingCompletedKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🏁 Ho terminato la ricarica', 'charging_finished')]
        ]);
    }

    static getRetryKeyboard(retryCount) {
        const buttons = [];
        
        if (retryCount < 3) {
            buttons.push([Markup.button.callback('🔄 Riprova attivazione', 'retry_activation')]);
        }
        
        buttons.push(
            [Markup.button.callback('🔌 Cambia connettore', 'change_connector')],
            [Markup.button.callback('📍 Cambia colonnina', 'change_station')],
            [Markup.button.callback('🚨 Chiama admin', 'contact_admin')]
        );
        
        return Markup.inlineKeyboard(buttons);
    }

    static getRetryActivationKeyboard(retryCount) {
        return this.getRetryKeyboard(retryCount);
    }

    static getSellerChargingActionsKeyboard(transactionId) {
        return Markup.inlineKeyboard([
            [Markup.button.callback('⚡ Attiva ricarica ORA', `activate_charging_${transactionId}`)],
            [Markup.button.callback('⏸️ Ritarda di 5 min', `delay_charging_${transactionId}`)],
            [Markup.button.callback('❌ Problemi tecnici', `technical_issues_${transactionId}`)]
        ]);
    }

    static getBuyerArrivedConfirmKeyboard(transactionId) {
        return Markup.inlineKeyboard([
            [Markup.button.callback('📍 Sono arrivato alla colonnina', `arrived_at_station_${transactionId}`)]
        ]);
    }

    static getChargingConfirmKeyboard(transactionId) {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Confermo, sta caricando', `charging_ok_${transactionId}`),
                Markup.button.callback('❌ Non sta caricando', `charging_fail_${transactionId}`)
            ]
        ]);
    }

    static getKwhValidationKeyboard(shortId) {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Corretti', `kwh_ok_${shortId}`),
                Markup.button.callback('❌ Non corretti', `kwh_bad_${shortId}`)
            ]
        ]);
    }
}

module.exports = ChargingKeyboards;
