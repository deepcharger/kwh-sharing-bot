// src/utils/keyboards/AnnouncementKeyboards.js - NUOVO FILE
const { Markup } = require('telegraf');

class AnnouncementKeyboards {
    static getContactSellerKeyboard(announcementId) {
        return Markup.inlineKeyboard([
            [Markup.button.url('🛒 Contatta venditore', `t.me/${process.env.BOT_USERNAME}?start=contact_${announcementId}`)]
        ]);
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
            [Markup.button.callback('🌐 Tutte le reti', 'networks_all')],
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

    static getUserListKeyboard(announcements) {
        const buttons = [];
        
        announcements.slice(0, 10).forEach(ann => {
            const displayId = ann.announcementId.length > 20 ? 
                ann.announcementId.substring(0, 15) + '...' : 
                ann.announcementId;
            
            // Calculate time remaining
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

    static getActionsKeyboard(announcement) {
        const shortId = this.createShortId(announcement.announcementId);
        const buttons = [];
        
        // First row: time-based actions
        const timeButtons = [];
        
        // Show extend if expiring soon (less than 4 hours)
        if (announcement.expiresAt) {
            const hoursRemaining = (announcement.expiresAt - new Date()) / (1000 * 60 * 60);
            if (hoursRemaining < 4) {
                timeButtons.push(Markup.button.callback('🔄 Estendi 24h', `extend_ann_${shortId}`));
            }
        }
        
        // Show refresh timer if needed
        if (this.needsGroupRefresh(announcement)) {
            timeButtons.push(Markup.button.callback('🔄 Aggiorna timer', `refresh_ann_${shortId}`));
        }
        
        if (timeButtons.length > 0) {
            buttons.push(timeButtons);
        }
        
        // Other actions
        buttons.push(
            [Markup.button.callback('✏️ Modifica', `edit_ann_${shortId}`)],
            [Markup.button.callback('❌ Elimina', `delete_ann_${shortId}`)],
            [Markup.button.callback('📊 Statistiche', `stats_ann_${shortId}`)],
            [Markup.button.callback('🔙 Indietro', 'my_announcements')]
        );
        
        return Markup.inlineKeyboard(buttons);
    }

    static getConfirmDeleteKeyboard(announcementId) {
        const shortId = this.createShortId(announcementId);
        return Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sì, elimina', `confirm_del_${shortId}`)],
            [Markup.button.callback('❌ No, mantieni', `cancel_del_${shortId}`)]
        ]);
    }

    // Helper methods
    static needsGroupRefresh(announcement) {
        if (!announcement.lastRefreshedAt || !announcement.updatedAt) return false;
        
        const extendedRecently = announcement.updatedAt > announcement.lastRefreshedAt;
        const timeSinceUpdate = Date.now() - announcement.updatedAt.getTime();
        const lessThan1Hour = timeSinceUpdate < 60 * 60 * 1000;
        
        return extendedRecently && lessThan1Hour;
    }

    static createShortId(fullId) {
        return fullId.slice(-10);
    }
}

module.exports = AnnouncementKeyboards;
