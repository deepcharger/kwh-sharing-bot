// src/utils/messages/formatters/PriceFormatter.js
const { PRICING } = require('../../../config/constants');

class PriceFormatter {
    /**
     * Format price with currency
     */
    static formatPrice(amount, currency = '€') {
        if (typeof amount !== 'number' || isNaN(amount)) {
            return 'N/A';
        }
        
        return `${amount.toFixed(2)}${currency}`;
    }

    /**
     * Format price per KWH
     */
    static formatPricePerKwh(price, currency = '€') {
        if (typeof price !== 'number' || isNaN(price)) {
            return 'N/A';
        }
        
        return `${price.toFixed(3)}${currency}/KWH`;
    }

    /**
     * Format total amount
     */
    static formatTotal(kwh, pricePerKwh, currency = '€') {
        if (typeof kwh !== 'number' || typeof pricePerKwh !== 'number') {
            return 'N/A';
        }
        
        const total = kwh * pricePerKwh;
        return `${currency}${total.toFixed(2)}`;
    }

    /**
     * Format price range
     */
    static formatPriceRange(minPrice, maxPrice, currency = '€') {
        return `${currency}${minPrice.toFixed(2)} - ${currency}${maxPrice.toFixed(2)}`;
    }

    /**
     * Format graduated pricing tiers
     */
    static formatPricingTiers(tiers, currency = '€') {
        if (!Array.isArray(tiers) || tiers.length === 0) {
            return 'N/A';
        }
        
        let formatted = [];
        
        for (let i = 0; i < tiers.length; i++) {
            const tier = tiers[i];
            const prevLimit = i > 0 ? tiers[i-1].limit : 0;
            
            let tierText = '';
            if (tier.limit === null) {
                tierText = `Oltre ${prevLimit} KWH: ${tier.price.toFixed(3)}${currency}/KWH`;
            } else {
                tierText = `${prevLimit + 1}-${tier.limit} KWH: ${tier.price.toFixed(3)}${currency}/KWH`;
            }
            
            formatted.push(tierText);
        }
        
        return formatted.join('\n');
    }

    /**
     * Format price examples for announcement
     */
    static formatPriceExamples(announcement, exampleKwh = [10, 30, 50, 100]) {
        let examples = [];
        
        for (const kwh of exampleKwh) {
            const cost = this.calculateCost(announcement, kwh);
            examples.push(`• ${kwh} KWH → €${cost.toFixed(2)}`);
        }
        
        return examples.join('\n');
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
     * Format discount percentage
     */
    static formatDiscount(originalPrice, discountedPrice) {
        if (originalPrice <= 0) return '0%';
        
        const discount = ((originalPrice - discountedPrice) / originalPrice) * 100;
        return `${discount.toFixed(0)}%`;
    }

    /**
     * Format savings
     */
    static formatSavings(originalTotal, discountedTotal, currency = '€') {
        const savings = originalTotal - discountedTotal;
        if (savings <= 0) return '';
        
        return `Risparmi: ${currency}${savings.toFixed(2)}`;
    }

    /**
     * Validate price within limits
     */
    static isValidPrice(price) {
        return price >= PRICING.MIN_PRICE && price <= PRICING.MAX_PRICE;
    }

    /**
     * Format price comparison
     */
    static formatPriceComparison(price, marketAvg) {
        if (!marketAvg || marketAvg <= 0) return '';
        
        const diff = price - marketAvg;
        const percentage = (diff / marketAvg) * 100;
        
        if (Math.abs(percentage) < 5) {
            return 'Prezzo nella media';
        } else if (percentage < 0) {
            return `${Math.abs(percentage).toFixed(0)}% sotto la media`;
        } else {
            return `${percentage.toFixed(0)}% sopra la media`;
        }
    }

    /**
     * Format price tier benefits
     */
    static formatTierBenefits(tiers) {
        if (!tiers || tiers.length < 2) return '';
        
        const firstTier = tiers[0];
        const lastTier = tiers[tiers.length - 1];
        
        // Skip if last tier has no limit (it's the "oltre" tier)
        const actualLastTier = lastTier.limit === null && tiers.length > 1 ? 
            tiers[tiers.length - 2] : lastTier;
        
        const maxDiscount = this.formatDiscount(firstTier.price, actualLastTier.price);
        
        return `Risparmia fino al ${maxDiscount} sui grandi volumi!`;
    }

    /**
     * Format minimum purchase info
     */
    static formatMinimumPurchase(minimumKwh, pricePerKwh, currency = '€') {
        if (!minimumKwh) return '';
        
        const minCost = minimumKwh * pricePerKwh;
        return `Acquisto minimo: ${minimumKwh} KWH (${currency}${minCost.toFixed(2)})`;
    }
}

module.exports = PriceFormatter;
