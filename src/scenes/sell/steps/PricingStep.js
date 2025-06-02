// src/scenes/sell/steps/PricingStep.js
const { Markup } = require('telegraf');
const Messages = require('../../../utils/messages/Messages');
const { PRICING } = require('../../../config/constants');

class PricingStep {
    constructor(bot) {
        this.bot = bot;
    }

    /**
     * Show pricing type selection
     */
    static async showPricingTypeSelection(ctx) {
        await ctx.editMessageText(
            '💰 **TIPO DI PREZZO**\n\nCome vuoi impostare il prezzo?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💵 Prezzo fisso', callback_data: 'price_fixed' }],
                        [{ text: '📊 Prezzi graduati', callback_data: 'price_graduated' }],
                        [{ text: '❓ Aiuto prezzi', callback_data: 'price_help' }],
                        [{ text: '❌ Annulla', callback_data: 'cancel' }]
                    ]
                }
            }
        );
    }

    /**
     * Handle fixed price input
     */
    static async handleFixedPrice(ctx, priceText) {
        const price = parseFloat(priceText.replace(',', '.'));
        
        if (isNaN(price) || price < PRICING.MIN_PRICE || price > PRICING.MAX_PRICE) {
            await ctx.reply(
                `❌ Inserisci un prezzo valido tra ${PRICING.MIN_PRICE} e ${PRICING.MAX_PRICE} €/KWH`
            );
            return false;
        }

        ctx.session.announcementData.basePrice = price;
        ctx.session.announcementData.price = price; // Compatibilità
        ctx.session.announcementData.pricingType = 'fixed';
        
        await this.showMinimumKwhOption(ctx);
        return true;
    }

    /**
     * Handle graduated tier input
     */
    static async handleGraduatedTier(ctx, input) {
        if (input.toLowerCase() === 'fine') {
            return await this.finishGraduatedTiers(ctx);
        }

        const tierData = this.parseTierInput(input);
        if (!tierData) {
            await ctx.reply(
                '❌ Formato non valido.\n\n' +
                '**Per fascia normale:** `limite prezzo`\n' +
                'Esempio: `30 0.35`\n\n' +
                '**Per fascia finale:** `oltre limite prezzo`\n' +
                'Esempio: `oltre 60 0.25`', 
                { parse_mode: 'Markdown' }
            );
            return false;
        }

        const { isOltre, limit, price } = tierData;
        
        // Validate tier
        const validation = this.validateTier(ctx, isOltre, limit, price);
        if (!validation.valid) {
            await ctx.reply(validation.error);
            return false;
        }

        // Add tier
        const tiers = ctx.session.announcementData.pricingTiers;
        
        if (isOltre) {
            tiers.push({ limit: null, price });
            await this.showTiersSummary(ctx, true);
            await this.finishGraduatedTiers(ctx);
        } else {
            tiers.push({ limit, price });
            await this.showTiersSummary(ctx, false);
        }

        return true;
    }

    /**
     * Parse tier input
     */
    static parseTierInput(input) {
        const isOltre = input.toLowerCase().startsWith('oltre ') || input.includes('+');
        let parts;
        
        if (isOltre) {
            const cleanInput = input.toLowerCase()
                .replace('oltre ', '')
                .replace('+', ' ')
                .trim();
            parts = cleanInput.split(/\s+/);
        } else {
            parts = input.split(/\s+/);
        }
        
        if (parts.length !== 2) {
            return null;
        }
        
        const limit = parseInt(parts[0]);
        const price = parseFloat(parts[1].replace(',', '.'));
        
        if (isNaN(limit) || isNaN(price)) {
            return null;
        }
        
        return { isOltre, limit, price };
    }

    /**
     * Validate tier
     */
    static validateTier(ctx, isOltre, limit, price) {
        const tiers = ctx.session.announcementData.pricingTiers;
        
        // Validate limit
        if (limit <= 0 || limit > PRICING.MAX_KWH) {
            return {
                valid: false,
                error: `❌ Limite KWH non valido (1-${PRICING.MAX_KWH}). Riprova:`
            };
        }
        
        // Validate price
        if (price < PRICING.MIN_PRICE || price > PRICING.MAX_PRICE) {
            return {
                valid: false,
                error: `❌ Prezzo non valido (${PRICING.MIN_PRICE}-${PRICING.MAX_PRICE} €/KWH). Riprova:`
            };
        }
        
        // Check limit progression
        if (tiers.length > 0) {
            const lastLimit = tiers[tiers.length - 1].limit;
            
            if (!isOltre && lastLimit && limit <= lastLimit) {
                return {
                    valid: false,
                    error: `❌ Il limite deve essere maggiore di ${lastLimit}. Riprova:`
                };
            }
            
            if (isOltre && lastLimit && limit < lastLimit) {
                return {
                    valid: false,
                    error: `❌ Il limite 'oltre' deve essere almeno ${lastLimit}. Riprova:`
                };
            }
        }
        
        return { valid: true };
    }

    /**
     * Show tiers summary
     */
    static async showTiersSummary(ctx, isFinal) {
        const tiers = ctx.session.announcementData.pricingTiers;
        
        let message = isFinal ? 
            `✅ Fascia finale aggiunta!\n\n` : 
            `✅ Fascia ${tiers.length} aggiunta!\n\n`;
            
        message += `📊 **RIEPILOGO FASCE:**\n`;
        
        for (let i = 0; i < tiers.length; i++) {
            const tier = tiers[i];
            const prevLimit = i > 0 ? tiers[i-1].limit : 0;
            
            if (tier.limit) {
                message += `• ${prevLimit + 1}-${tier.limit} KWH: ${tier.price}€/KWH\n`;
            } else {
                const lastTierLimit = i > 0 ? tiers[i-1].limit : 0;
                message += `• Oltre ${lastTierLimit} KWH: ${tier.price}€/KWH\n`;
            }
        }
        
        if (!isFinal) {
            message += '\n**Cosa vuoi fare?**\n';
            message += '• Aggiungi un\'altra fascia intermedia (es: `80 0.28`)\n';
            message += '• Aggiungi la fascia finale (es: `oltre 80 0.25`)\n';
            message += '• Scrivi `fine` per terminare senza fascia "oltre"';
            
            await ctx.reply(message, { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Termina configurazione', callback_data: 'finish_tiers' }],
                        [{ text: '❌ Annulla', callback_data: 'cancel' }]
                    ]
                }
            });
        } else {
            message += '\n✅ Configurazione prezzi completata!';
            await ctx.reply(message, { parse_mode: 'Markdown' });
        }
    }

    /**
     * Finish graduated tiers configuration
     */
    static async finishGraduatedTiers(ctx) {
        const tiers = ctx.session.announcementData.pricingTiers;
        
        if (tiers.length === 0) {
            await ctx.reply('❌ Devi configurare almeno una fascia!');
            return false;
        }

        // Check if last tier is "oltre"
        const lastTier = tiers[tiers.length - 1];
        const hasOltreFascia = lastTier.limit === null;

        if (!hasOltreFascia) {
            await ctx.reply(
                '⚠️ **ATTENZIONE**\n\n' +
                `Hai configurato fasce fino a ${lastTier.limit} KWH.\n` +
                `Per chi ricarica oltre ${lastTier.limit} KWH verrà applicato il prezzo di ${lastTier.price}€/KWH.\n\n` +
                '💡 Se vuoi un prezzo diverso per quantità maggiori, torna indietro e aggiungi una fascia "oltre".',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Va bene così', callback_data: 'confirm_no_oltre' }],
                            [{ text: '🔙 Aggiungi fascia oltre', callback_data: 'add_oltre_tier' }]
                        ]
                    }
                }
            );
            return false;
        }

        await this.showMinimumKwhOption(ctx);
        return true;
    }

    /**
     * Show minimum KWH option
     */
    static async showMinimumKwhOption(ctx) {
        await ctx.reply(
            '🎯 **MINIMO GARANTITO** (opzionale)\n\n' +
            'Vuoi impostare un minimo di KWH da far pagare sempre?\n\n' +
            'Esempio: se imposti 10, chi ricarica 5 KWH paga comunque per 10 KWH',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Sì, imposta minimo', callback_data: 'set_minimum' }],
                        [{ text: '❌ No, continua', callback_data: 'skip_minimum' }],
                        [{ text: '🔙 Annulla', callback_data: 'cancel' }]
                    ]
                }
            }
        );
    }

    /**
     * Handle minimum KWH input
     */
    static async handleMinimumKwh(ctx, input) {
        const minimum = parseInt(input);
        
        if (isNaN(minimum) || minimum <= 0 || minimum > PRICING.MAX_MINIMUM_KWH) {
            await ctx.reply(
                `❌ Inserisci un valore valido tra 1 e ${PRICING.MAX_MINIMUM_KWH} KWH`
            );
            return false;
        }

        ctx.session.announcementData.minimumKwh = minimum;
        return true;
    }

    /**
     * Show pricing examples
     */
    static showPricingExamples(announcement) {
        const examples = [10, 30, 50, 100];
        let text = '💡 **ESEMPI DI COSTO:**\n';
        
        for (const kwh of examples) {
            const cost = this.calculateCost(announcement, kwh);
            text += `• ${kwh} KWH → €${cost.toFixed(2)}\n`;
        }
        
        return text;
    }

    /**
     * Calculate cost for given KWH
     */
    static calculateCost(announcement, kwh) {
        const finalKwh = Math.max(kwh, announcement.minimumKwh || 0);
        
        if (announcement.pricingType === 'fixed') {
            return finalKwh * (announcement.basePrice || announcement.price);
        }
        
        if (announcement.pricingType === 'graduated' && announcement.pricingTiers) {
            let applicableTier = announcement.pricingTiers[announcement.pricingTiers.length - 1];
            
            for (let tier of announcement.pricingTiers) {
                if (tier.limit === null || finalKwh <= tier.limit) {
                    applicableTier = tier;
                    break;
                }
            }
            
            return finalKwh * applicableTier.price;
        }
        
        return 0;
    }

    /**
     * Show help for pricing
     */
    static async showPricingHelp(ctx) {
        const helpText = `💡 **GUIDA AI PREZZI**\n\n` +
            `**Prezzo Fisso:**\n` +
            `• Un unico prezzo per tutti i KWH\n` +
            `• Semplice e chiaro\n` +
            `• Ideale per ricariche veloci\n\n` +
            `**Prezzi Graduati:**\n` +
            `• Prezzi diversi per fasce di consumo\n` +
            `• Incentiva ricariche maggiori\n` +
            `• Più competitivo per grandi volumi\n\n` +
            `**Suggerimenti:**\n` +
            `• Prezzo medio mercato: 0.30-0.40€/KWH\n` +
            `• Considera i costi della tua tariffa\n` +
            `• Offri sconti per volumi maggiori`;
        
        await ctx.reply(helpText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Torna alla scelta', callback_data: 'back_to_pricing' }]
                ]
            }
        });
    }
}

module.exports = PricingStep;
