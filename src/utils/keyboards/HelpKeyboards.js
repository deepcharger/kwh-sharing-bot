// src/utils/keyboards/HelpKeyboards.js - NUOVO FILE
const { Markup } = require('telegraf');

class HelpKeyboards {
    static getHelpKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('📋 Come vendere', 'help_selling')],
            [Markup.button.callback('🛒 Come comprare', 'help_buying')],
            [Markup.button.callback('⭐ Sistema feedback', 'help_feedback')],
            [Markup.button.callback('❓ FAQ', 'help_faq')],
            [Markup.button.callback('📞 Contatta admin', 'contact_admin')],
            [Markup.button.callback('🏠 Menu principale', 'back_to_main')]
        ]);
    }
}

module.exports = HelpKeyboards;
