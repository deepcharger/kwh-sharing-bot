// src/utils/keyboards/AdminKeyboards.js - NUOVO FILE
const { Markup } = require('telegraf');

class AdminKeyboards {
    static getDashboardKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('📊 Statistiche generali', 'admin_general_stats')],
            [Markup.button.callback('⏳ Transazioni pendenti', 'admin_pending_transactions')],
            [Markup.button.callback('⚠️ Dispute aperte', 'admin_open_disputes')],
            [Markup.button.callback('👥 Gestione utenti', 'admin_manage_users')],
            [Markup.button.callback('📋 Annunci attivi', 'admin_active_announcements')],
            [Markup.button.callback('🏠 Menu principale', 'back_to_main')]
        ]);
    }
}

module.exports = AdminKeyboards;
