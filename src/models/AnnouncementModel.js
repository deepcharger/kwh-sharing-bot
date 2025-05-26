const mongoose = require('mongoose');

const pricingTierSchema = new mongoose.Schema({
    limit: {
        type: Number,
        default: null // null significa illimitato (ultima fascia)
    },
    price: {
        type: Number,
        required: true,
        min: 0
    }
});

const announcementSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    location: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    availability: {
        type: String,
        default: 'Sempre disponibile',
        maxlength: 200
    },
    contactInfo: {
        type: String,
        trim: true,
        maxlength: 200
    },
    
    // Nuovo sistema prezzi
    pricingType: {
        type: String,
        enum: ['fixed', 'graduated'],
        required: true
    },
    
    // Per prezzo fisso
    basePrice: {
        type: Number,
        min: 0,
        required: function() {
            return this.pricingType === 'fixed';
        }
    },
    
    // Per prezzi graduati
    pricingTiers: {
        type: [pricingTierSchema],
        validate: {
            validator: function(tiers) {
                if (this.pricingType === 'graduated') {
                    if (!tiers || tiers.length === 0) return false;
                    
                    // Verifica che l'ultima fascia abbia limite null
                    const lastTier = tiers[tiers.length - 1];
                    if (lastTier.limit !== null) return false;
                    
                    // Verifica ordine crescente dei limiti
                    for (let i = 0; i < tiers.length - 1; i++) {
                        if (tiers[i].limit === null || 
                            (i > 0 && tiers[i].limit <= tiers[i-1].limit)) {
                            return false;
                        }
                    }
                    
                    return true;
                }
                return true;
            },
            message: 'Fasce di prezzo non valide'
        },
        required: function() {
            return this.pricingType === 'graduated';
        }
    },
    
    // KWH minimi (opzionale per entrambi i tipi)
    minimumKwh: {
        type: Number,
        min: 0,
        default: null
    },
    
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Indici per performance
announcementSchema.index({ userId: 1, isActive: 1 });
announcementSchema.index({ location: 'text', description: 'text' });
announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ isActive: 1, createdAt: -1 });

// Middleware per aggiornare updatedAt
announcementSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Metodo per formattare il prezzo
announcementSchema.methods.formatPricing = function() {
    if (this.pricingType === 'fixed') {
        let result = `💰 Prezzo: ${this.basePrice}€/KWH`;
        if (this.minimumKwh) {
            result += `\n🎯 Minimo garantito: ${this.minimumKwh} KWH`;
        }
        return result;
    }
    
    if (this.pricingType === 'graduated') {
        let result = `💰 Prezzi graduati:\n`;
        
        for (let i = 0; i < this.pricingTiers.length; i++) {
            const tier = this.pricingTiers[i];
            const previousLimit = i > 0 ? this.pricingTiers[i-1].limit : 0;
            
            if (tier.limit === null) {
                result += `• Oltre ${previousLimit} KWH: TUTTO a ${tier.price}€/KWH\n`;
            } else {
                result += `• ${previousLimit + 1}-${tier.limit} KWH: TUTTO a ${tier.price}€/KWH\n`;
            }
        }
        
        if (this.minimumKwh) {
            result += `🎯 Minimo garantito: ${this.minimumKwh} KWH`;
        }
        
        return result.trim();
    }
    
    return 'Prezzo non configurato';
};

// Metodo per calcolare il prezzo
announcementSchema.methods.calculatePrice = function(kwhAmount) {
    if (!kwhAmount || kwhAmount <= 0) {
        throw new Error('Quantità KWH non valida');
    }
    
    // Applica minimo se presente
    const finalKwh = Math.max(kwhAmount, this.minimumKwh || 0);
    
    if (this.pricingType === 'fixed') {
        return {
            totalAmount: finalKwh * this.basePrice,
            kwhUsed: finalKwh,
            pricePerKwh: this.basePrice,
            appliedMinimum: finalKwh > kwhAmount
        };
    }
    
    if (this.pricingType === 'graduated') {
        // Trova la fascia appropriata
        let applicableTier = this.pricingTiers[this.pricingTiers.length - 1]; // Default ultima fascia
        
        for (let tier of this.pricingTiers) {
            if (tier.limit === null || finalKwh <= tier.limit) {
                applicableTier = tier;
                break;
            }
        }
        
        return {
            totalAmount: finalKwh * applicableTier.price,
            kwhUsed: finalKwh,
            pricePerKwh: applicableTier.price,
            appliedTier: applicableTier,
            appliedMinimum: finalKwh > kwhAmount
        };
    }
    
    throw new Error('Tipo di prezzo non supportato');
};

// Metodo statico per validare i dati di pricing
announcementSchema.statics.validatePricingData = function(data) {
    const errors = [];
    
    if (!data.pricingType || !['fixed', 'graduated'].includes(data.pricingType)) {
        errors.push('Tipo di prezzo non valido');
    }
    
    if (data.pricingType === 'fixed') {
        if (!data.basePrice || data.basePrice <= 0) {
            errors.push('Prezzo fisso deve essere maggiore di 0');
        }
    }
    
    if (data.pricingType === 'graduated') {
        if (!data.pricingTiers || !Array.isArray(data.pricingTiers) || data.pricingTiers.length === 0) {
            errors.push('Almeno una fascia di prezzo è richiesta');
        } else {
            // Validazione fasce
            for (let i = 0; i < data.pricingTiers.length; i++) {
                const tier = data.pricingTiers[i];
                
                if (!tier.price || tier.price <= 0) {
                    errors.push(`Prezzo fascia ${i + 1} deve essere maggiore di 0`);
                }
                
                if (i < data.pricingTiers.length - 1) {
                    if (!tier.limit || tier.limit <= 0) {
                        errors.push(`Limite fascia ${i + 1} deve essere maggiore di 0`);
                    }
                    
                    if (i > 0 && tier.limit <= data.pricingTiers[i-1].limit) {
                        errors.push(`Limite fascia ${i + 1} deve essere maggiore del precedente`);
                    }
                }
                
                if (i === data.pricingTiers.length - 1 && tier.limit !== null) {
                    errors.push('L\'ultima fascia deve avere limite null');
                }
            }
        }
    }
    
    if (data.minimumKwh && (isNaN(data.minimumKwh) || data.minimumKwh <= 0)) {
        errors.push('KWH minimi devono essere maggiori di 0');
    }
    
    return errors;
};

module.exports = mongoose.model('Announcement', announcementSchema);
