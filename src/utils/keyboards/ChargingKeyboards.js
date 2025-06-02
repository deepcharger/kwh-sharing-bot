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
}

module.exports = ChargingKeyboards;
