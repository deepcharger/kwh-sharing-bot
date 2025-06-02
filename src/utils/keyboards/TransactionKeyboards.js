// src/utils/keyboards/TransactionKeyboards.js - NUOVO FILE
const { Markup } = require('telegraf');
const { TRANSACTION_STATUS } = require('../../config/constants');

class TransactionKeyboards {
    static getListKeyboard(pending, completed) {
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
        
        // Add history button if there are completed transactions
        if (completed.length > 0) {
            buttons.push([Markup.button.callback('📜 Cronologia completa', 'tx_history')]);
        }
        
        buttons.push([Markup.button.callback('🏠 Menu principale', 'back_to_main')]);
        
        return Markup.inlineKeyboard(buttons);
    }

    static getActionsKeyboard(transactionId, status, isSeller) {
        const buttons = [];
        const shortId = this.createShortId(transactionId);
        
        // Add action button based on status
        if (status === TRANSACTION_STATUS.PAYMENT_REQUESTED && !isSeller) {
            buttons.push([Markup.button.callback('💳 Gestisci pagamento', `manage_tx_${shortId}`)]);
        } else if (status === TRANSACTION_STATUS.PENDING_SELLER && isSeller) {
            buttons.push([Markup.button.callback('✅ Conferma/Rifiuta', `manage_tx_${shortId}`)]);
        } else if (![TRANSACTION_STATUS.COMPLETED, TRANSACTION_STATUS.CANCELLED].includes(status)) {
            buttons.push([Markup.button.callback('⚙️ Gestisci transazione', `manage_tx_${shortId}`)]);
        }
        
        // Always add details and back buttons
        buttons.push([Markup.button.callback('📊 Dettagli completi', `details_tx_${shortId}`)]);
        buttons.push([Markup.button.callback('🔙 Torna alle transazioni', 'back_to_txs')]);
        
        return Markup.inlineKeyboard(buttons);
    }

    static getRequestKeyboard(transaction, buyer) {
        return {
            inline_keyboard: [
                [
                    { text: '✅ Accetto', callback_data: `accept_request_${transaction.transactionId}` },
                    { text: '❌ Rifiuto', callback_data: `reject_request_${transaction.transactionId}` }
                ],
                [
                    { 
                        text: '💬 Contatta acquirente', 
                        callback_data: `contact_buyer_${transaction.buyerId}_${buyer?.username || 'user'}` 
                    }
                ]
            ]
        };
    }

    static getStatusKeyboard(transactionId) {
        const shortId = this.createShortId(transactionId);
        return Markup.inlineKeyboard([
            [Markup.button.callback('📊 Dettagli completi', `tx_details_${shortId}`)],
            [Markup.button.callback('⚠️ Segnala problema', `report_${shortId}`)],
            [Markup.button.callback('📞 Contatta admin', `admin_help_${shortId}`)]
        ]);
    }

    // Helper methods
    static getStatusEmoji(status) {
        const statusEmojis = {
            [TRANSACTION_STATUS.PENDING_SELLER]: '⏳',
            [TRANSACTION_STATUS.CONFIRMED]: '✅',
            [TRANSACTION_STATUS.BUYER_ARRIVED]: '📍',
            [TRANSACTION_STATUS.CHARGING_STARTED]: '⚡',
            [TRANSACTION_STATUS.CHARGING_IN_PROGRESS]: '🔋',
            [TRANSACTION_STATUS.CHARGING_COMPLETED]: '🏁',
            [TRANSACTION_STATUS.PHOTO_UPLOADED]: '📷',
            [TRANSACTION_STATUS.KWH_DECLARED]: '📊',
            [TRANSACTION_STATUS.PAYMENT_REQUESTED]: '💳',
            [TRANSACTION_STATUS.PAYMENT_DECLARED]: '💰',
            [TRANSACTION_STATUS.COMPLETED]: '✅',
            [TRANSACTION_STATUS.CANCELLED]: '❌',
            [TRANSACTION_STATUS.DISPUTED]: '⚠️'
        };
        return statusEmojis[status] || '❓';
    }

    static getStatusText(status) {
        const statusTexts = {
            [TRANSACTION_STATUS.PENDING_SELLER]: 'Attesa conferma',
            [TRANSACTION_STATUS.CONFIRMED]: 'Confermata',
            [TRANSACTION_STATUS.BUYER_ARRIVED]: 'Acquirente arrivato',
            [TRANSACTION_STATUS.CHARGING_STARTED]: 'Ricarica avviata',
            [TRANSACTION_STATUS.CHARGING_IN_PROGRESS]: 'In ricarica',
            [TRANSACTION_STATUS.CHARGING_COMPLETED]: 'Ricarica completata',
            [TRANSACTION_STATUS.PHOTO_UPLOADED]: 'Foto caricata',
            [TRANSACTION_STATUS.KWH_DECLARED]: 'KWH dichiarati',
            [TRANSACTION_STATUS.PAYMENT_REQUESTED]: 'Pagamento richiesto',
            [TRANSACTION_STATUS.PAYMENT_DECLARED]: 'Pagamento dichiarato',
            [TRANSACTION_STATUS.COMPLETED]: 'Completata',
            [TRANSACTION_STATUS.CANCELLED]: 'Annullata',
            [TRANSACTION_STATUS.DISPUTED]: 'In disputa'
        };
        return statusTexts[status] || status;
    }

    static createShortId(fullId) {
        return fullId.slice(-10);
    }
}

module.exports = TransactionKeyboards;
