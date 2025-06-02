// src/scenes/sell/steps/PublishStep.js
const Keyboards = require('../../../utils/keyboards/Keyboards');
const MarkdownEscape = require('../../../utils/helpers/MarkdownEscape');
const logger = require('../../../utils/logger');

class PublishStep {
    constructor(bot) {
        this.bot = bot;
    }

    /**
     * Show announcement preview
     */
    static async showPreview(ctx, data) {
        const preview = this.formatPreview(data);
        
        await ctx.reply(preview, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Pubblica annuncio', callback_data: 'publish_announcement' }],
                    [{ text: '✏️ Modifica', callback_data: 'edit_announcement' }],
                    [{ text: '❌ Annulla', callback_data: 'cancel' }]
                ]
            }
        });
    }

    /**
     * Format preview
     */
    static formatPreview(data) {
        let preview = '📋 **ANTEPRIMA ANNUNCIO**\n\n';
        
        // Pricing
        if (data.pricingType === 'fixed') {
            preview += `💰 Prezzo: ${data.basePrice}€/KWH\n`;
        } else {
            preview += '💰 Prezzi graduati:\n';
            for (let i = 0; i < data.pricingTiers.length; i++) {
                const tier = data.pricingTiers[i];
                const prevLimit = i > 0 ? data.pricingTiers[i-1].limit : 0;
                if (tier.limit) {
                    preview += `  • ${prevLimit + 1}-${tier.limit} KWH: ${tier.price}€/KWH\n`;
                } else {
                    preview += `  • Oltre ${prevLimit} KWH: ${tier.price}€/KWH\n`;
                }
            }
        }
        
        if (data.minimumKwh) {
            preview += `🎯 Minimo: ${data.minimumKwh} KWH\n`;
        }
        
        preview += `⚡ Corrente: ${MarkdownEscape.escape(data.currentType)}\n`;
        preview += `📍 Zone: ${MarkdownEscape.escape(data.zones)}\n`;
        preview += `🌐 Reti: ${MarkdownEscape.escape(data.networks)}\n`;
        
        if (data.description) {
            preview += `📝 Descrizione: ${MarkdownEscape.escape(data.description)}\n`;
        }
        
        preview += `⏰ Disponibilità: ${MarkdownEscape.escape(data.availability)}\n`;
        preview += `💳 Pagamenti: ${MarkdownEscape.escape(data.paymentMethods)}\n`;
        
        return preview;
    }

    /**
     * Publish announcement
     */
    static async publishAnnouncement(ctx, bot, data) {
        try {
            // Add user data
            data.userId = ctx.from.id;
            data.contactInfo = ctx.from.username ? `@${ctx.from.username}` : 'Telegram';
            
            // Create announcement
            const announcement = await bot.services.announcement.createAnnouncement(data);
            
            // Get user stats for badge
            const userStats = await bot.services.user.getUserStats(ctx.from.id);
            
            // Format message for group
            const groupMessage = bot.services.announcement.formatAnnouncementForGroup(
                announcement, 
                userStats
            );
            
            // Publish to group topic
            const sentMessage = await ctx.telegram.sendMessage(
                bot.groupId,
                groupMessage,
                {
                    parse_mode: 'Markdown',
                    message_thread_id: parseInt(bot.topicId),
                    reply_markup: Keyboards.announcement.getContactSellerKeyboard(announcement.announcementId).reply_markup
                }
            );
            
            // Save message ID for later deletion
            await bot.services.announcement.updateAnnouncement(
                announcement.announcementId,
                { messageId: sentMessage.message_id }
            );
            
            // Show success message
            await ctx.editMessageText(
                '✅ **ANNUNCIO PUBBLICATO!**\n\n' +
                'Il tuo annuncio è ora visibile nel gruppo.\n' +
                'Riceverai una notifica quando qualcuno sarà interessato.\n\n' +
                `🆔 ID Annuncio: \`${announcement.announcementId}\`\n\n` +
                '💡 **Suggerimenti:**\n' +
                '• Rispondi velocemente alle richieste\n' +
                '• Mantieni prezzi competitivi\n' +
                '• Fornisci un ottimo servizio per ricevere feedback positivi',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
                }
            );
            
            logger.info(`Announcement published: ${announcement.announcementId}`);
            
            return { success: true, announcement };
            
        } catch (error) {
            logger.error('Error publishing announcement:', error);
            
            await ctx.editMessageText(
                '❌ Errore nella pubblicazione. Riprova più tardi.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
                }
            );
            
            return { success: false, error };
        }
    }

    /**
     * Handle edit request
     */
    static async handleEdit(ctx) {
        const options = [
            { text: '💰 Modifica prezzo', callback_data: 'edit_price' },
            { text: '📍 Modifica zone', callback_data: 'edit_zones' },
            { text: '🌐 Modifica reti', callback_data: 'edit_networks' },
            { text: '⏰ Modifica disponibilità', callback_data: 'edit_availability' },
            { text: '💳 Modifica pagamenti', callback_data: 'edit_payments' },
            { text: '🔙 Torna all\'anteprima', callback_data: 'back_to_preview' }
        ];
        
        await ctx.editMessageText(
            '✏️ **MODIFICA ANNUNCIO**\n\nCosa vuoi modificare?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: options.map(opt => [opt])
                }
            }
        );
    }

    /**
     * Validate announcement before publishing
     */
    static validateAnnouncement(data) {
        const errors = [];
        
        // Check pricing
        if (!data.pricingType) {
            errors.push('Tipo di prezzo mancante');
        } else if (data.pricingType === 'fixed' && !data.basePrice) {
            errors.push('Prezzo mancante');
        } else if (data.pricingType === 'graduated' && (!data.pricingTiers || data.pricingTiers.length === 0)) {
            errors.push('Fasce di prezzo mancanti');
        }
        
        // Check required fields
        const required = {
            currentType: 'Tipo corrente',
            zones: 'Zone',
            networks: 'Reti',
            availability: 'Disponibilità',
            paymentMethods: 'Metodi di pagamento'
        };
        
        for (const [field, name] of Object.entries(required)) {
            if (!data[field]) {
                errors.push(`${name} mancante`);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Check for duplicate announcements
     */
    static async checkDuplicates(bot, userId) {
        const activeAnnouncements = await bot.services.announcement.getUserAnnouncements(userId);
        
        if (activeAnnouncements.length >= 5) {
            return {
                canPublish: false,
                reason: 'Hai già raggiunto il limite massimo di 5 annunci attivi'
            };
        }
        
        // Check if user published recently
        const recentAnnouncements = activeAnnouncements.filter(ann => {
            const hoursSinceCreated = (Date.now() - ann.createdAt.getTime()) / (1000 * 60 * 60);
            return hoursSinceCreated < 1;
        });
        
        if (recentAnnouncements.length > 0) {
            return {
                canPublish: false,
                reason: 'Devi attendere almeno 1 ora tra una pubblicazione e l\'altra'
            };
        }
        
        return { canPublish: true };
    }

    /**
     * Send notification to potential buyers
     */
    static async notifyPotentialBuyers(bot, announcement) {
        // This could be expanded to notify users who have shown interest
        // in similar announcements or zones
        // For now, we don't send unsolicited notifications
    }
}

module.exports = PublishStep;
