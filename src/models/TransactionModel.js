const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    buyerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    announcementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Announcement',
        required: true
    },
    
    // Quantità di energia
    kwhAmount: {
        type: Number,
        required: true,
        min: 0.1,
        max: 10000
    },
    
    // KWH usati per il calcolo (dopo applicazione del minimo)
    kwhUsedForCalculation: {
        type: Number,
        required: true,
        min: 0.1
    },
    
    // Prezzo per KWH applicato a questa transazione
    pricePerKwh: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Importo totale calcolato
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Indica se è stato applicato il minimo garantito
    appliedMinimum: {
        type: Boolean,
        default: false
    },
    
    // Dettagli della fascia applicata (per prezzi graduati)
    appliedTier: {
        limit: {
            type: Number,
            default: null // null = fascia illimitata
        },
        price: {
            type: Number,
            min: 0
        }
    },
    
    // Status della transazione
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'completed', 'cancelled'],
        default: 'pending'
    },
    
    // Note e comunicazioni
    buyerNotes: {
        type: String,
        maxlength: 500
    },
    sellerNotes: {
        type: String,
        maxlength: 500
    },
    
    // Dati di completamento
    completedAt: {
        type: Date
    },
    
    // Rating reciproco (opzionale)
    buyerRating: {
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        comment: {
            type: String,
            maxlength: 300
        },
        ratedAt: Date
    },
    sellerRating: {
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        comment: {
            type: String,
            maxlength: 300
        },
        ratedAt: Date
    },
    
    // Metadati
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
transactionSchema.index({ buyerId: 1, status: 1 });
transactionSchema.index({ sellerId: 1, status: 1 });
transactionSchema.index({ announcementId: 1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ createdAt: -1 });

// Validazione personalizzata
transactionSchema.pre('save', function(next) {
    // Aggiorna timestamp
    this.updatedAt = new Date();
    
    // Validazione: buyer e seller devono essere diversi
    if (this.buyerId.toString() === this.sellerId.toString()) {
        next(new Error('Buyer e Seller non possono essere la stessa persona'));
        return;
    }
    
    // Validazione: kwhUsedForCalculation deve essere >= kwhAmount
    if (this.kwhUsedForCalculation < this.kwhAmount) {
        next(new Error('KWH per calcolo non può essere minore di KWH richiesti'));
        return;
    }
    
    // Validazione: totalAmount deve corrispondere al calcolo
    const expectedAmount = this.kwhUsedForCalculation * this.pricePerKwh;
    const difference = Math.abs(this.totalAmount - expectedAmount);
    if (difference > 0.01) { // Tolleranza di 1 centesimo per arrotondamenti
        next(new Error('Total amount non corrisponde al calcolo'));
        return;
    }
    
    // Imposta appliedMinimum se necessario
    if (this.kwhUsedForCalculation > this.kwhAmount) {
        this.appliedMinimum = true;
    }
    
    next();
});

// Middleware per aggiornare updatedAt
transactionSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: new Date() });
    next();
});

// Metodi del documento
transactionSchema.methods.calculateSavings = function() {
    // Calcola il risparmio rispetto a un prezzo di riferimento (es. 0.50€/KWH)
    const referencePrice = 0.50;
    const referenceCost = this.kwhAmount * referencePrice;
    return Math.max(0, referenceCost - this.totalAmount);
};

transactionSchema.methods.getEffectivePrice = function() {
    // Prezzo effettivo pagato per KWH richiesto (non quello per calcolo)
    return this.totalAmount / this.kwhAmount;
};

transactionSchema.methods.formatSummary = function() {
    let summary = `💰 €${this.totalAmount.toFixed(2)} per ${this.kwhAmount} KWH`;
    
    if (this.appliedMinimum) {
        summary += ` (min. ${this.kwhUsedForCalculation} KWH)`;
    }
    
    if (this.appliedTier && this.appliedTier.limit) {
        summary += ` - Fascia: fino a ${this.appliedTier.limit} KWH`;
    }
    
    return summary;
};

transactionSchema.methods.canBeModified = function() {
    return this.status === 'pending';
};

transactionSchema.methods.canBeCancelled = function() {
    return ['pending', 'confirmed'].includes(this.status);
};

transactionSchema.methods.canBeCompleted = function() {
    return this.status === 'confirmed';
};

transactionSchema.methods.hasBeenRated = function(byUserId) {
    if (this.buyerId.toString() === byUserId.toString()) {
        return !!this.buyerRating.rating;
    }
    if (this.sellerId.toString() === byUserId.toString()) {
        return !!this.sellerRating.rating;
    }
    return false;
};

// Metodi statici
transactionSchema.statics.getStatusCounts = async function() {
    return await this.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
};

transactionSchema.statics.getTotalVolume = async function(dateFrom, dateTo) {
    const match = { status: 'completed' };
    
    if (dateFrom || dateTo) {
        match.completedAt = {};
        if (dateFrom) match.completedAt.$gte = new Date(dateFrom);
        if (dateTo) match.completedAt.$lte = new Date(dateTo);
    }
    
    const result = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalTransactions: { $sum: 1 },
                totalKwh: { $sum: '$kwhAmount' },
                totalAmount: { $sum: '$totalAmount' },
                avgPricePerKwh: { $avg: '$pricePerKwh' }
            }
        }
    ]);
    
    return result[0] || {
        totalTransactions: 0,
        totalKwh: 0,
        totalAmount: 0,
        avgPricePerKwh: 0
    };
};

transactionSchema.statics.getUserStats = async function(userId) {
    const buyStats = await this.aggregate([
        { $match: { buyerId: new mongoose.Types.ObjectId(userId), status: 'completed' } },
        {
            $group: {
                _id: null,
                totalBought: { $sum: 1 },
                totalKwhBought: { $sum: '$kwhAmount' },
                totalSpent: { $sum: '$totalAmount' },
                avgPricePaid: { $avg: '$pricePerKwh' }
            }
        }
    ]);
    
    const sellStats = await this.aggregate([
        { $match: { sellerId: new mongoose.Types.ObjectId(userId), status: 'completed' } },
        {
            $group: {
                _id: null,
                totalSold: { $sum: 1 },
                totalKwhSold: { $sum: '$kwhAmount' },
                totalEarned: { $sum: '$totalAmount' },
                avgPriceReceived: { $avg: '$pricePerKwh' }
            }
        }
    ]);
    
    // Calcola rating medio ricevuto
    const ratings = await this.aggregate([
        {
            $match: {
                $or: [
                    { buyerId: new mongoose.Types.ObjectId(userId), 'sellerRating.rating': { $exists: true } },
                    { sellerId: new mongoose.Types.ObjectId(userId), 'buyerRating.rating': { $exists: true } }
                ]
            }
        },
        {
            $project: {
                rating: {
                    $cond: [
                        { $eq: ['$buyerId', new mongoose.Types.ObjectId(userId)] },
                        '$sellerRating.rating',
                        '$buyerRating.rating'
                    ]
                }
            }
        },
        {
            $group: {
                _id: null,
                avgRating: { $avg: '$rating' },
                totalRatings: { $sum: 1 }
            }
        }
    ]);
    
    return {
        buying: buyStats[0] || {
            totalBought: 0,
            totalKwhBought: 0,
            totalSpent: 0,
            avgPricePaid: 0
        },
        selling: sellStats[0] || {
            totalSold: 0,
            totalKwhSold: 0,
            totalEarned: 0,
            avgPriceReceived: 0
        },
        rating: ratings[0] || {
            avgRating: 0,
            totalRatings: 0
        }
    };
};

// Virtual per calcolare il numero di giorni dalla creazione
transactionSchema.virtual('daysSinceCreation').get(function() {
    return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual per determinare il ruolo dell'utente nella transazione
transactionSchema.methods.getUserRole = function(userId) {
    if (this.buyerId.toString() === userId.toString()) return 'buyer';
    if (this.sellerId.toString() === userId.toString()) return 'seller';
    return null;
};

module.exports = mongoose.model('Transaction', transactionSchema);
