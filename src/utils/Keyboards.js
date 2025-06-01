const { Markup } = require('telegraf');

class Keyboards {
    // Menu principale con bottone Compra KWH
    static get MAIN_MENU() {
        return {
            reply_markup: Markup.keyboard([
                ['🔋 Vendi KWH', '🛒 Compra KWH'],
                ['📊 I miei annunci', '💼 Le mie transazioni'],
                ['📥 Richieste pendenti', '⭐ I miei feedback'],
                ['❓ Aiuto']
            ]).resize().persistent().reply_markup
        };
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
        const shortId = this.createShortId(transactionId);
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sì, KWH corretti', `kwh_ok_${shortId}`)],
            [Markup.button.callback('❌ No, KWH errati', `kwh_bad_${shortId}`)],
            [Markup.button.callback('📞 Contatta admin', `admin_${shortId}`)]
        ]);
    }

    static getPaymentConfirmationKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sì, ho effettuato il pagamento', 'payment_completed')],
            [Markup.button.callback('❌ Ho problemi con il pagamento', 'payment_issues')],
            [Markup.button.callback('⏰ Sto ancora pagando...', 'payment_in_progress')]
        ]);
    }

    static getSellerPaymentConfirmKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Confermo: pagamento ricevuto', 'payment_received')],
            [Markup.button.callback('❌ Non ho ricevuto il pagamento', 'payment_not_received')],
            [Markup.button.callback('⚠️ Ricevuto importo diverso', 'payment_amount_different')],
            [Markup.button.callback('⏰ Non ancora, aspetto', 'payment_waiting')]
        ]);
    }

    static getPaymentIssuesKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Riprovo il pagamento', 'retry_payment')],
            [Markup.button.callback('📷 Invio screenshot pagamento', 'send_payment_proof')],
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

    static getTransactionsKeyboard(pending, completed) {
        const buttons = [];
        
        // Add pending transactions first (max 8)
        pending.slice(0, 8).forEach((tx, index) => {
            const statusText = this.getStatusText(tx.status);
            const displayId = tx.transactionId.length > 15 ? 
                tx.transactionId.substring(2, 12) + '...' : 
                tx.transactionId;
                
            buttons.push([Markup.button.callback(
                `${this.getStatusEmoji(tx.status)} ${displayId} - ${statusText}`, 
                `view_tx_${index}`
            )]);
        });
        
        // Add recent completed transactions (max 3)
        if (completed.length > 0) {
            buttons.push([Markup.button.callback('📜 Cronologia completa', 'tx_history')]);
        }
        
        buttons.push([Markup.button.callback('🏠 Menu principale', 'back_to_main')]);
        
        return Markup.inlineKeyboard(buttons);
    }

    static getStatusEmoji(status) {
        const statusEmojis = {
            'pending_seller_confirmation': '⏳',
            'confirmed': '✅',
            'charging_started': '⚡',
            'charging_in_progress': '🔋',
            'charging_completed': '🏁',
            'photo_uploaded': '📷',
            'kwh_declared': '📊',
            'payment_requested': '💳',
            'payment_confirmed': '💰',
            'completed': '✅',
            'cancelled': '❌',
            'disputed': '⚠️'
        };
        return statusEmojis[status] || '❓';
    }

    static getStatusText(status) {
        const statusTexts = {
            'pending_seller_confirmation': 'Attesa conferma',
            'confirmed': 'Confermata',
            'charging_started': 'Ricarica avviata',
            'charging_in_progress': 'In ricarica',
            'charging_completed': 'Ricarica completata',
            'photo_uploaded': 'Foto caricata',
            'kwh_declared': 'KWH dichiarati',
            'payment_requested': 'Pagamento richiesto',
            'payment_confirmed': 'Pagamento confermato',
            'completed': 'Completata',
            'cancelled': 'Annullata',
            'disputed': 'In disputa'
        };
        return statusTexts[status] || status;
    }

    static getTransactionActionsKeyboard(transactionId, status, isSeller) {
        const buttons = [];
        const shortId = this.createShortId(transactionId);
        
        // Add action button based on status
        if (status === 'payment_requested' && !isSeller) {
            buttons.push([Markup.button.callback('💳 Gestisci pagamento', `manage_tx_${shortId}`)]);
        } else if (status === 'pending_seller_confirmation' && isSeller) {
            buttons.push([Markup.button.callback('✅ Conferma/Rifiuta', `manage_tx_${shortId}`)]);
        } else if (!['completed', 'cancelled'].includes(status)) {
            buttons.push([Markup.button.callback('⚙️ Gestisci transazione', `manage_tx_${shortId}`)]);
        }
        
        // Always add details and back buttons
        buttons.push([Markup.button.callback('📊 Dettagli completi', `details_tx_${shortId}`)]);
        buttons.push([Markup.button.callback('🔙 Torna alle transazioni', 'back_to_txs')]);
        
        return Markup.inlineKeyboard(buttons);
    }

    // Metodo helper per creare ID corti
    static createShortId(fullId) {
        return fullId.slice(-10);
    }

    static getUserAnnouncementsKeyboard(announcements) {
        const buttons = [];
        
        announcements.slice(0, 10).forEach(ann => {
            const displayId = ann.announcementId.length > 20 ? 
                ann.announcementId.substring(0, 15) + '...' : 
                ann.announcementId;
            
            // Calcola tempo rimanente
            let timeInfo = '';
            if (ann.expiresAt) {
                const now = new Date();
                const diffMs = ann.expiresAt - now;
                const diffHours = Math.floor(diffMs / 3600000);
                
                if (diffHours <= 0) {
                    timeInfo = ' ⏰ SCADUTO';
                } else if (diffHours <= 1) {
                    timeInfo = ' ⏰ <1h';
                } else if (diffHours <= 24) {
                    timeInfo = ` ⏰ ${diffHours}h`;
                }
            }
                
            buttons.push([Markup.button.callback(
                `📋 ${displayId} - ${ann.price || ann.basePrice}€/KWH${timeInfo}`, 
                `view_ann_${this.createShortId(ann.announcementId)}`
            )]);
        });

        buttons.push([Markup.button.callback('🏠 Menu principale', 'back_to_main')]);
        
        return Markup.inlineKeyboard(buttons);
    }

    // METODO AGGIORNATO: Gestione dinamica del bottone refresh
    static getAnnouncementActionsKeyboard(announcement) {
        const shortId = this.createShortId(announcement.announcementId);
        const buttons = [];
        
        // Prima riga: azioni temporali
        const timeButtons = [];
        
        // Mostra "Estendi" se sta per scadere (meno di 4 ore)
        if (announcement.expiresAt) {
            const hoursRemaining = (announcement.expiresAt - new Date()) / (1000 * 60 * 60);
            if (hoursRemaining < 4) {
                timeButtons.push(Markup.button.callback('🔄 Estendi 24h', `extend_ann_${shortId}`));
            }
        }
        
        // Mostra "Aggiorna timer" se è stato modificato/esteso di recente
        if (this.needsGroupRefresh(announcement)) {
            timeButtons.push(Markup.button.callback('🔄 Aggiorna timer', `refresh_ann_${shortId}`));
        }
        
        if (timeButtons.length > 0) {
            buttons.push(timeButtons);
        }
        
        // Altre azioni
        buttons.push(
            [Markup.button.callback('✏️ Modifica', `edit_ann_${shortId}`)],
            [Markup.button.callback('❌ Elimina', `delete_ann_${shortId}`)],
            [Markup.button.callback('📊 Statistiche', `stats_ann_${shortId}`)],
            [Markup.button.callback('🔙 Indietro', 'my_announcements')]
        );
        
        return Markup.inlineKeyboard(buttons);
    }

    // METODO HELPER: Verifica se serve refresh del gruppo
    static needsGroupRefresh(announcement) {
        if (!announcement.lastRefreshedAt || !announcement.updatedAt) return false;
        
        const extendedRecently = announcement.updatedAt > announcement.lastRefreshedAt;
        const timeSinceUpdate = Date.now() - announcement.updatedAt.getTime();
        const lessThan1Hour = timeSinceUpdate < 60 * 60 * 1000;
        
        return extendedRecently && lessThan1Hour;
    }

    static getConfirmDeleteKeyboard(announcementId) {
        const shortId = this.createShortId(announcementId);
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sì, elimina', `confirm_del_${shortId}`)],
            [Markup.button.callback('❌ No, mantieni', `cancel_del_${shortId}`)]
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
        const shortId = this.createShortId(transactionId);
        return Markup.inlineKeyboard([
            [Markup.button.callback('📊 Dettagli completi', `tx_details_${shortId}`)],
            [Markup.button.callback('⚠️ Segnala problema', `report_${shortId}`)],
            [Markup.button.callback('📞 Contatta admin', `admin_help_${shortId}`)]
        ]);
    }

    static getMultiplePaymentsKeyboard(transactions) {
        const buttons = [];
        
        transactions.forEach((tx, index) => {
            const displayId = tx.transactionId.slice(-10);
            const amount = tx.amount || 'N/A';
            
            buttons.push([Markup.button.callback(
                `💳 ${displayId} - €${amount}`,
                `select_payment_${tx.transactionId}`
            )]);
        });
        
        buttons.push([Markup.button.callback('🏠 Menu principale', 'back_to_main')]);
        
        return Markup.inlineKeyboard(buttons);
    }

    // Tastiera inline per compra/vendi
    static getBuySellKeyboard() {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('🔋 Vendi energia', 'sell_energy'),
                Markup.button.callback('🛒 Compra energia', 'buy_energy')
            ],
            [Markup.button.callback('🏠 Menu principale', 'back_to_main')]
        ]);
    }
}

module.exports = Keyboards;
