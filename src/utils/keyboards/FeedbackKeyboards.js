// src/utils/keyboards/FeedbackKeyboards.js - NUOVO FILE
const { Markup } = require('telegraf');

class FeedbackKeyboards {
    static getRatingKeyboard() {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('⭐', 'feedback_1'),
                Markup.button.callback('⭐⭐', 'feedback_2'),
                Markup.button.callback('⭐⭐⭐', 'feedback_3'),
                Markup.button.callback('⭐⭐⭐⭐', 'feedback_4'),
                Markup.button.callback('⭐⭐⭐⭐⭐', 'feedback_5')
            ]
        ]);
    }

    static getMissingListKeyboard(missingFeedback, userId) {
        const buttons = [];
        
        missingFeedback.slice(0, 5).forEach(tx => {
            const role = tx.sellerId === userId ? '📤 Vendita' : '📥 Acquisto';
            const date = tx.completedAt || tx.createdAt;
            const kwh = tx.declaredKwh || tx.actualKwh || '?';
            
            buttons.push([Markup.button.callback(
                `${role} ${date.toLocaleDateString('it-IT')} - ${kwh} KWH`,
                `feedback_tx_${tx.transactionId}`
            )]);
        });
        
        buttons.push([Markup.button.callback('🏠 Menu principale', 'back_to_main')]);
        
        return Markup.inlineKeyboard(buttons);
    }
}

module.exports = FeedbackKeyboards;
