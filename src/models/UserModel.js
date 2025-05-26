const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: {
        type: Number,
        required: true,
        unique: true
    },
    username: {
        type: String,
        sparse: true
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String
    },
    
    // Statistiche transazioni
    totalTransactions: {
        type: Number,
        default: 0
    },
    totalKwhBought: {
        type: Number,
        default: 0
    },
    totalKwhSold: {
        type: Number,
        default: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    },
    totalEarned: {
        type: Number,
        default: 0
    },
    
    // Rating e recensioni
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    totalRatings: {
        type: Number,
        default: 0
    },
    
    // Stato account
    isActive: {
        type: Boolean,
        default: true
    },
    isBanned: {
        type: Boolean,
        default: false
    },
    
    // Timestamp
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    }
});

// Indici
userSchema.index({ userId: 1 }, { unique: true });
userSchema.index({ username: 1 }, { sparse: true });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastActivity: -1 });

// Middleware
userSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Metodi
userSchema.methods.updateActivity = function() {
    this.lastActivity = new Date();
    return this.save();
};

userSchema.methods.getDisplayName = function() {
    return this.username ? `@${this.username}` : this.firstName;
};

// Metodi statici
userSchema.statics.findByUserId = function(userId) {
    return this.findOne({ userId });
};

module.exports = mongoose.model('User', userSchema);
