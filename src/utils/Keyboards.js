const { Markup } = require('telegraf');

class Keyboards {
    static get MAIN_MENU() {
        return Markup.keyboard([
            ['🔋 Vendi KWH', '📥 Richieste pendenti'],
            ['📊 I miei annunci', '⭐ I miei feedback'],
            ['❓ Aiuto']
        ]).resize().persistent();
    }

    static get CANCEL_ONLY() {
        return Markup.keyboard([
            ['❌ Annulla']
        ]).resize().oneTime();
    }

    static getCurrentTypeKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔌 Solo DC', 'current_dc_only')],
            [Markup.button.callback('⚡ Solo AC', 'current_ac_only')],
            [Markup.button.callback('🔋 Entrambi DC e AC', 'current_both')],
            [Markup.button.callback('⚡ DC minimo 30 KW', 'current_dc_min_30')],
            [Markup.button.callback('❌ Annulla', 'cancel')]
        ]);
    }

    static getNetworksKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🌐 Tutte le colonnine', 'networks_all')],
            [Markup.button.callback('📝 Specifica reti', 'networks_specific')],
            [Markup.button.callback('❌ Annulla', 'cancel')]
        ]);
    }

    static getAnnouncementPreviewKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Pubblica annuncio', 'publish_announcement')],
            [Markup.button.callback('✏️ Modifica', 'edit_announcement')],
            [Markup.button.callback('❌ Annulla', 'cancel')]
        ]);
    }

    static getContactSellerKeyboard(announcementId) {
        return Markup.inlineKeyboard([
            [Markup.button.url('🛒 Contatta venditore', `t.me/${process.env.BOT_USERNAME}?start=contact_${announcementId}`)]
        ]);
    }

    static getConfirmPurchaseKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sì, procedo con l\'acquisto', 'confirm_purchase')],
            [Markup.button.callback('❌ Annulla', 'cancel_purchase')]
        ]);
    }

    static getCurrentTypeSelectionKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('⚡ AC', 'select_ac')],
            [Markup.button.callback('🔌 DC', 'select_dc')]
        ]);
    }

    static getSellerConfirmationKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Accetto la richiesta', 'seller_accept')],
            [Markup.button.callback('❌ Rifiuto', 'seller_reject')],
            [Markup.button.callback('💬 Contatta acquirente', 'contact_buyer')]
        ]);
    }

    static getActivateChargingKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('⚡ Attivo ricarica ORA', 'activate_charging')],
            [Markup.button.callback('⏸️ Ritarda di 5 min', 'delay_charging')],
            [Markup.button.callback('❌ Problemi tecnici', 'technical_issues')]
        ]);
    }

    static getBuyerChargingConfirmKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Confermo, sta caricando', 'charging_confirmed')],
            [Markup.button.callback('❌ Non sta caricando, riprova', 'charging_failed')],
            [Markup.button.callback('⏸️ Aspetta, non sono pronto', 'buyer_not_ready')]
        ]);
    }

    static getRetryActivationKeyboard(retryCount) {
        const maxRetries = 5;
        const buttons = [];
        
        if (retryCount < maxRetries) {
            buttons.push([Markup.button.callback(`🔄 Riprovo (tentativo ${retryCount + 1}/${maxRetries})`, 'retry_activation')]);
        }
        
        buttons.push(
            [Markup.button.callback('🔌 Provo altro connettore', 'try_other_connector')],
            [Markup.button.callback('📍 Cerco colonnina alternativa', 'find_alternative')],
            [Markup.button.callback('❌ Rinuncio alla transazione', 'give_up_transaction')],
            [Markup.button.callback('📞 Chiama admin', 'call_admin')]
        );

        return Markup.inlineKeyboard(buttons);
    }

    static getChargingCompletedKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🏁 Ho terminato la ricarica', 'charging_finished')]
        ]);
    }

    static getKwhValidationKeyboard(transactionId) {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sì, KWH corretti', `kwh_correct_${transactionId}`)],
            [Markup.button.callback('❌ No, KWH errati', `kwh_incorrect_${transactionId}`)],
            [Markup.button.callback('📞 Contatta admin', `call_admin_${transactionId}`)]
        ]);
    }

    static getPaymentConfirmationKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sì, ho pagato', 'payment_completed')],
            [Markup.button.callback('❌ Ho problemi con il pagamento', 'payment_issues')],
            [Markup.button.callback('⏰ Sto ancora pagando...', 'payment_in_progress')]
        ]);
    }

    static getSellerPaymentConfirmKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sì, confermo pagamento ricevuto', 'payment_received')],
            [Markup.button.callback('❌ No, non ho ricevuto nulla', 'payment_not_received')],
            [Markup.button.callback('⚠️ Ricevuto importo diverso', 'payment_amount_different')],
            [Markup.button.callback('⏰ Non ancora, aspetto', 'payment_waiting')]
        ]);
    }

    static getPaymentIssuesKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Riprovo il pagamento', 'retry_payment')],
            [Markup.button.callback('📱 Invio screenshot pagamento', 'send_payment_proof')],
            [Markup.button.callback('📞 Contatto admin', 'contact_admin_payment')],
            [Markup.button.callback('💬 Parlo in privato con venditore', 'contact_seller_private')]
        ]);
    }

    static getFeedbackKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('⭐⭐⭐⭐⭐ Ottima (5/5)', 'feedback_5')],
            [Markup.button.callback('⭐⭐⭐⭐ Buona (4/5)', 'feedback_4')],
            [Markup.button.callback('⭐⭐⭐ Sufficiente (3/5)', 'feedback_3')],
            [Markup.button.callback('⭐⭐ Scarsa (2/5)', 'feedback_2')],
            [Markup.button.callback('⭐ Pessima (1/5)', 'feedback_1')]
        ]);
    }

    static getAdminArbitrationKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Favorevole all\'acquirente', 'admin_favor_buyer')],
            [Markup.button.callback('⚖️ Favorevole al venditore', 'admin_favor_seller')],
            [Markup.button.callback('🤝 Via di mezzo/Compromesso', 'admin_compromise')],
            [Markup.button.callback('❌ Annullo senza penali', 'admin_cancel_transaction')],
            [Markup.button.callback('💬 Messaggio personalizzato', 'admin_custom_message')]
        ]);
    }

    static getBackToMainMenuKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Torna al menu principale', 'back_to_main')]
        ]);
    }

    static getUserAnnouncementsKeyboard(announcements) {
        const buttons = [];
        
        announcements.slice(0, 10).forEach(ann => {
            buttons.push([Markup.button.callback(
                `📋 ${ann.announcementId} - ${ann.price}€/KWH`, 
                `view_announcement_${ann.announcementId}`
            )]);
        });

        buttons.push([Markup.button.callback('🏠 Menu principale', 'back_to_main')]);
        
        return Markup.inlineKeyboard(buttons);
    }

    static getAnnouncementActionsKeyboard(announcementId) {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✏️ Modifica', `edit_ann_${announcementId}`)],
            [Markup.button.callback('❌ Elimina', `delete_ann_${announcementId}`)],
            [Markup.button.callback('📊 Statistiche', `stats_ann_${announcementId}`)],
            [Markup.button.callback('🔙 Indietro', 'my_announcements')]
        ]);
    }

    static getConfirmDeleteKeyboard(announcementId) {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sì, elimina', `confirm_delete_${announcementId}`)],
            [Markup.button.callback('❌ No, mantieni', `cancel_delete_${announcementId}`)]
        ]);
    }

    static getHelpKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔋 Come vendere KWH', 'help_selling')],
            [Markup.button.callback('🛒 Come comprare KWH', 'help_buying')],
            [Markup.button.callback('⭐ Sistema feedback', 'help_feedback')],
            [Markup.button.callback('❓ FAQ', 'help_faq')],
            [Markup.button.callback('📞 Contatta admin', 'contact_admin')]
        ]);
    }

    static removeKeyboard() {
        return Markup.removeKeyboard();
    }

    static getAdminDashboardKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('📊 Statistiche generali', 'admin_general_stats')],
            [Markup.button.callback('🔄 Transazioni pending', 'admin_pending_transactions')],
            [Markup.button.callback('⚠️ Dispute aperte', 'admin_open_disputes')],
            [Markup.button.callback('👥 Gestione utenti', 'admin_manage_users')],
            [Markup.button.callback('📋 Annunci attivi', 'admin_active_announcements')]
        ]);
    }

    static getTransactionStatusKeyboard(transactionId) {
        return Markup.inlineKeyboard([
            [Markup.button.callback('📊 Dettagli completi', `transaction_details_${transactionId}`)],
            [Markup.button.callback('⚠️ Segnala problema', `report_issue_${transactionId}`)],
            [Markup.button.callback('📞 Contatta admin', `admin_help_${transactionId}`)]
        ]);
    }
}

module.exports = Keyboards;
