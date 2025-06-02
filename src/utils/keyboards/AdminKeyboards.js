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

    static getStatsKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('📈 Esporta report', 'admin_export_report')],
            [Markup.button.callback('🔄 Aggiorna', 'admin_general_stats')],
            [Markup.button.callback('🔙 Dashboard admin', 'admin')],
            [Markup.button.callback('🏠 Menu principale', 'back_to_main')]
        ]);
    }

    static getUserManagementKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Cerca utente', 'admin_search_user')],
            [Markup.button.callback('🚫 Utenti bannati', 'admin_banned_users')],
            [Markup.button.callback('⭐ Top venditori', 'admin_top_sellers')],
            [Markup.button.callback('🔙 Dashboard admin', 'admin')]
        ]);
    }

    static getDisputeActionsKeyboard(transactionId) {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Risolvi a favore venditore', `resolve_seller_${transactionId}`)],
            [Markup.button.callback('✅ Risolvi a favore acquirente', `resolve_buyer_${transactionId}`)],
            [Markup.button.callback('📞 Contatta entrambi', `contact_both_${transactionId}`)],
            [Markup.button.callback('❌ Annulla transazione', `cancel_tx_admin_${transactionId}`)],
            [Markup.button.callback('🔙 Torna alle dispute', 'admin_open_disputes')]
        ]);
    }

    static getBackToAdminKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Dashboard admin', 'admin')],
            [Markup.button.callback('🏠 Menu principale', 'back_to_main')]
        ]);
    }
}

module.exports = AdminKeyboards;
