// src/utils/keyboards/MainMenuKeyboard.js - NUOVO FILE
const { Markup } = require('telegraf');

class MainMenuKeyboard {
    static getMainMenu() {
        return {
            reply_markup: Markup.keyboard([
                ['🔋 Vendi KWH', '🛒 Compra KWH'],
                ['📊 I miei annunci', '💼 Le mie transazioni'],
                ['📥 Richieste pendenti', '⭐ I miei feedback'],
                ['❓ Aiuto']
            ]).resize().persistent().reply_markup
        };
    }
}

module.exports = MainMenuKeyboard;
