const mongoose = require('mongoose');
const TransactionModel = require('../models/TransactionModel');
const AnnouncementService = require('./AnnouncementService');
const UserService = require('./UserService');
const logger = require('../utils/logger');

class TransactionService {
    static async createTransaction(data) {
        try {
            // Validazione dati obbligatori
            if (!data.buyerId || !data.sellerId || !data.announcementId || !data.kwhAmount) {
                throw new Error('Dati obbligatori mancanti');
            }

            // Verifica che buyer e seller siano diversi
            if (data.buyerId.toString() === data.sellerId.toString()) {
                throw new Error('Non puoi comprare dalla tua stessa offerta');
            }

            // Recupera l'annuncio per calcolare il prezzo
            const announcement = await AnnouncementService.getAnnouncementById(data.announcementId);
            if (!announcement) {
                throw new Error('Annuncio non trovato');
            }

            if (!announcement.isActive) {
                throw new Error('Annuncio non più attivo');
            }

            // Verifica che il seller corrisponda
            if (announcement.userId.toString() !== data.sellerId.toString()) {
                throw new Error('Seller non corrispondente all\'annuncio');
            }

            // Calcola il prezzo usando il nuovo sistema
            const priceCalculation = this.calculatePrice(announcement, data.kwhAmount);
            
            // Crea la transazione
            const transaction = new TransactionModel({
                buyerId: data.buyerId,
                sellerId: data.sellerId,
                announcementId: data.announcementId,
                kwhAmount: data.kwhAmount,
                kwhUsedForCalculation: priceCalculation.kwhUsed,
                pricePerKwh: priceCalculation.pricePerKwh,
                totalAmount: priceCalculation.totalAmount,
                appliedMinimum: priceCalculation.appliedMinimum || false,
                appliedTier: priceCalculation.appliedTier || null,
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date()
            });

            await transaction.save();
            logger.info(`Transazione creata: ${transaction._id}`);
            return transaction;

        } catch (error) {
            logger.error('Errore nella creazione della transazione:', error);
            throw error;
        }
    }

    static calculatePrice(announcement, kwhAmount) {
        try {
            if (!announcement || !kwhAmount || kwhAmount <= 0) {
                throw new Error('Parametri non validi per il calcolo del prezzo');
            }

            // Applica minimo se presente
            const finalKwh = Math.max(kwhAmount, announcement.minimumKwh || 0);

            if (announcement.pricingType === 'fixed') {
                return {
                    totalAmount: finalKwh * announcement.basePrice,
                    kwhUsed: finalKwh,
                    pricePerKwh: announcement.basePrice,
                    appliedMinimum: finalKwh > kwhAmount
                };
            }

            if (announcement.pricingType === 'graduated') {
                // Trova la fascia appropriata
                let applicableTier = announcement.pricingTiers[announcement.pricingTiers.length - 1]; // Default ultima fascia
                
                for (let tier of announcement.pricingTiers) {
                    if (tier.limit === null || finalKwh <= tier.limit) {
                        applicableTier = tier;
                        break;
                    }
                }

                return {
                    totalAmount: finalKwh * applicableTier.price,
                    kwhUsed: finalKwh,
                    pricePerKwh: applicableTier.price,
                    appliedTier: {
                        limit: applicableTier.limit,
                        price: applicableTier.price
                    },
                    appliedMinimum: finalKwh > kwhAmount
                };
            }

            throw new Error('Tipo di prezzo non supportato');
        } catch (error) {
            logger.error('Errore nel calcolo del prezzo:', error);
            throw error;
        }
    }

    static async getTransactionById(id) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw new Error('ID transazione non valido');
            }

            const transaction = await TransactionModel
                .findById(id)
                .populate('buyerId', 'username firstName lastName')
                .populate('sellerId', 'username firstName lastName')
                .populate('announcementId');

            return transaction;
        } catch (error) {
            logger.error('Errore nel recupero della transazione:', error);
            throw error;
        }
    }

    static async getUserTransactions(userId, type = 'all') {
        try {
            let query = {};

            switch (type) {
                case 'buy':
                    query.buyerId = userId;
                    break;
                case 'sell':
                    query.sellerId = userId;
                    break;
                case 'all':
                default:
                    query.$or = [{ buyerId: userId }, { sellerId: userId }];
                    break;
            }

            const transactions = await TransactionModel
                .find(query)
                .populate('buyerId', 'username firstName lastName')
                .populate('sellerId', 'username firstName lastName')
                .populate('announcementId')
                .sort({ createdAt: -1 });

            return transactions;
        } catch (error) {
            logger.error('Errore nel recupero delle transazioni utente:', error);
            throw error;
        }
    }

    static async updateTransactionStatus(id, status, updatedBy) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw new Error('ID transazione non valido');
            }

            const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
            if (!validStatuses.includes(status)) {
                throw new Error('Status non valido');
            }

            const transaction = await TransactionModel.findById(id);
            if (!transaction) {
                throw new Error('Transazione non trovata');
            }

            // Verifica autorizzazioni
            const isAuthorized = transaction.buyerId.toString() === updatedBy.toString() || 
                               transaction.sellerId.toString() === updatedBy.toString();
            
            if (!isAuthorized) {
                throw new Error('Non autorizzato a modificare questa transazione');
            }

            // Logica di transizione degli stati
            if (transaction.status === 'completed' || transaction.status === 'cancelled') {
                throw new Error('Transazione già finalizzata');
            }

            const updatedTransaction = await TransactionModel.findByIdAndUpdate(
                id,
                { 
                    status,
                    updatedAt: new Date(),
                    ...(status === 'completed' && { completedAt: new Date() })
                },
                { new: true }
            );

            logger.info(`Transazione ${id} aggiornata a status: ${status}`);
            return updatedTransaction;

        } catch (error) {
            logger.error('Errore nell\'aggiornamento dello status:', error);
            throw error;
        }
    }

    static async confirmTransaction(id, userId) {
        try {
            const transaction = await this.getTransactionById(id);
            if (!transaction) {
                throw new Error('Transazione non trovata');
            }

            // Solo il seller può confermare
            if (transaction.sellerId._id.toString() !== userId.toString()) {
                throw new Error('Solo il venditore può confermare la transazione');
            }

            if (transaction.status !== 'pending') {
                throw new Error('Transazione non in stato pending');
            }

            return await this.updateTransactionStatus(id, 'confirmed', userId);
        } catch (error) {
            logger.error('Errore nella conferma della transazione:', error);
            throw error;
        }
    }

    static async completeTransaction(id, userId) {
        try {
            const transaction = await this.getTransactionById(id);
            if (!transaction) {
                throw new Error('Transazione non trovata');
            }

            // Solo il buyer può completare
            if (transaction.buyerId._id.toString() !== userId.toString()) {
                throw new Error('Solo il compratore può completare la transazione');
            }

            if (transaction.status !== 'confirmed') {
                throw new Error('Transazione deve essere confermata prima del completamento');
            }

            return await this.updateTransactionStatus(id, 'completed', userId);
        } catch (error) {
            logger.error('Errore nel completamento della transazione:', error);
            throw error;
        }
    }

    static async cancelTransaction(id, userId) {
        try {
            const transaction = await this.getTransactionById(id);
            if (!transaction) {
                throw new Error('Transazione non trovata');
            }

            // Entrambi possono cancellare se pending
            const isAuthorized = transaction.buyerId._id.toString() === userId.toString() || 
                               transaction.sellerId._id.toString() === userId.toString();
            
            if (!isAuthorized) {
                throw new Error('Non autorizzato');
            }

            if (transaction.status === 'completed') {
                throw new Error('Non puoi cancellare una transazione completata');
            }

            return await this.updateTransactionStatus(id, 'cancelled', userId);
        } catch (error) {
            logger.error('Errore nella cancellazione della transazione:', error);
            throw error;
        }
    }

    static async getTransactionStats(userId) {
        try {
            const stats = await TransactionModel.aggregate([
                {
                    $match: {
                        $or: [
                            { buyerId: new mongoose.Types.ObjectId(userId) },
                            { sellerId: new mongoose.Types.ObjectId(userId) }
                        ]
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalTransactions: { $sum: 1 },
                        totalAmount: { $sum: '$totalAmount' },
                        totalKwh: { $sum: '$kwhAmount' },
                        pendingCount: { 
                            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } 
                        },
                        confirmedCount: { 
                            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } 
                        },
                        completedCount: { 
                            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } 
                        },
                        cancelledCount: { 
                            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } 
                        }
                    }
                }
            ]);

            // Statistiche separate per acquisti e vendite
            const buyStats = await TransactionModel.aggregate([
                { $match: { buyerId: new mongoose.Types.ObjectId(userId) } },
                {
                    $group: {
                        _id: null,
                        buyTransactions: { $sum: 1 },
                        buyAmount: { $sum: '$totalAmount' },
                        buyKwh: { $sum: '$kwhAmount' }
                    }
                }
            ]);

            const sellStats = await TransactionModel.aggregate([
                { $match: { sellerId: new mongoose.Types.ObjectId(userId) } },
                {
                    $group: {
                        _id: null,
                        sellTransactions: { $sum: 1 },
                        sellAmount: { $sum: '$totalAmount' },
                        sellKwh: { $sum: '$kwhAmount' }
                    }
                }
            ]);

            return {
                overall: stats[0] || {
                    totalTransactions: 0,
                    totalAmount: 0,
                    totalKwh: 0,
                    pendingCount: 0,
                    confirmedCount: 0,
                    completedCount: 0,
                    cancelledCount: 0
                },
                buying: buyStats[0] || {
                    buyTransactions: 0,
                    buyAmount: 0,
                    buyKwh: 0
                },
                selling: sellStats[0] || {
                    sellTransactions: 0,
                    sellAmount: 0,
                    sellKwh: 0
                }
            };
        } catch (error) {
            logger.error('Errore nel calcolo delle statistiche transazioni:', error);
            throw error;
        }
    }

    static async getRecentTransactions(limit = 10) {
        try {
            const transactions = await TransactionModel
                .find()
                .populate('buyerId', 'username firstName lastName')
                .populate('sellerId', 'username firstName lastName')
                .populate('announcementId')
                .sort({ createdAt: -1 })
                .limit(limit);

            return transactions;
        } catch (error) {
            logger.error('Errore nel recupero delle transazioni recenti:', error);
            throw error;
        }
    }

    static async getPendingTransactions() {
        try {
            const transactions = await TransactionModel
                .find({ status: { $in: ['pending', 'confirmed'] } })
                .populate('buyerId', 'username firstName lastName')
                .populate('sellerId', 'username firstName lastName')
                .populate('announcementId')
                .sort({ createdAt: 1 });

            return transactions;
        } catch (error) {
            logger.error('Errore nel recupero delle transazioni pending:', error);
            throw error;
        }
    }

    static async searchTransactions(filters) {
        try {
            const query = {};

            if (filters.userId) {
                query.$or = [
                    { buyerId: filters.userId },
                    { sellerId: filters.userId }
                ];
            }

            if (filters.status) {
                query.status = filters.status;
            }

            if (filters.dateFrom) {
                query.createdAt = { $gte: new Date(filters.dateFrom) };
            }

            if (filters.dateTo) {
                query.createdAt = { 
                    ...query.createdAt, 
                    $lte: new Date(filters.dateTo) 
                };
            }

            if (filters.minAmount) {
                query.totalAmount = { $gte: filters.minAmount };
            }

            if (filters.maxAmount) {
                query.totalAmount = { 
                    ...query.totalAmount, 
                    $lte: filters.maxAmount 
                };
            }

            const transactions = await TransactionModel
                .find(query)
                .populate('buyerId', 'username firstName lastName')
                .populate('sellerId', 'username firstName lastName')
                .populate('announcementId')
                .sort({ createdAt: -1 });

            return transactions;
        } catch (error) {
            logger.error('Errore nella ricerca delle transazioni:', error);
            throw error;
        }
    }

    // Funzione per ricalcolare il prezzo di una transazione esistente
    static async recalculateTransactionPrice(transactionId, newKwhAmount) {
        try {
            const transaction = await this.getTransactionById(transactionId);
            if (!transaction) {
                throw new Error('Transazione non trovata');
            }

            const announcement = await AnnouncementService.getAnnouncementById(
                transaction.announcementId._id || transaction.announcementId
            );
            if (!announcement) {
                throw new Error('Annuncio associato non trovato');
            }

            // Calcola nuovo prezzo
            const priceCalculation = this.calculatePrice(announcement, newKwhAmount);

            // Aggiorna la transazione
            const updatedTransaction = await TransactionModel.findByIdAndUpdate(
                transactionId,
                {
                    kwhAmount: newKwhAmount,
                    kwhUsedForCalculation: priceCalculation.kwhUsed,
                    pricePerKwh: priceCalculation.pricePerKwh,
                    totalAmount: priceCalculation.totalAmount,
                    appliedMinimum: priceCalculation.appliedMinimum || false,
                    appliedTier: priceCalculation.appliedTier || null,
                    updatedAt: new Date()
                },
                { new: true }
            );

            logger.info(`Prezzo transazione ${transactionId} ricalcolato`);
            return updatedTransaction;

        } catch (error) {
            logger.error('Errore nel ricalcolo del prezzo:', error);
            throw error;
        }
    }

    // Funzione per generare un resoconto dettagliato della transazione
    static formatTransactionSummary(transaction, announcement) {
        try {
            let summary = `🔖 **RIEPILOGO TRANSAZIONE**\n\n`;
            summary += `📋 ID: \`${transaction._id}\`\n`;
            summary += `📅 Data: ${transaction.createdAt.toLocaleDateString('it-IT')}\n`;
            summary += `📊 Status: **${this.getStatusText(transaction.status)}**\n\n`;

            summary += `👤 **Acquirente:** ${transaction.buyerId.username || transaction.buyerId.firstName}\n`;
            summary += `👤 **Venditore:** ${transaction.sellerId.username || transaction.sellerId.firstName}\n\n`;

            summary += `⚡ **Dettagli Energia:**\n`;
            summary += `• KWH richiesti: ${transaction.kwhAmount}\n`;
            summary += `• KWH per calcolo: ${transaction.kwhUsedForCalculation}\n`;

            if (transaction.appliedMinimum) {
                summary += `🎯 *Applicato minimo garantito*\n`;
            }

            summary += `\n💰 **Dettagli Prezzo:**\n`;
            
            if (announcement) {
                if (announcement.pricingType === 'fixed') {
                    summary += `• Tipo: Prezzo fisso\n`;
                    summary += `• Prezzo: ${transaction.pricePerKwh}€/KWH\n`;
                } else if (announcement.pricingType === 'graduated') {
                    summary += `• Tipo: Prezzi graduati\n`;
                    summary += `• Fascia applicata: ${transaction.pricePerKwh}€/KWH\n`;
                    if (transaction.appliedTier && transaction.appliedTier.limit) {
                        summary += `• Limite fascia: ${transaction.appliedTier.limit} KWH\n`;
                    }
                }
            }

            summary += `• **Totale: €${transaction.totalAmount.toFixed(2)}**\n\n`;

            if (transaction.status === 'completed' && transaction.completedAt) {
                summary += `✅ Completata il: ${transaction.completedAt.toLocaleDateString('it-IT')}\n`;
            }

            return summary;

        } catch (error) {
            logger.error('Errore nella formattazione del riepilogo:', error);
            return 'Errore nella generazione del riepilogo';
        }
    }

    static getStatusText(status) {
        const statusMap = {
            'pending': 'In attesa',
            'confirmed': 'Confermata',
            'completed': 'Completata',
            'cancelled': 'Annullata'
        };
        return statusMap[status] || status;
    }

    static getStatusEmoji(status) {
        const emojiMap = {
            'pending': '⏳',
            'confirmed': '✅',
            'completed': '🎉',
            'cancelled': '❌'
        };
        return emojiMap[status] || '❓';
    }
}

module.exports = TransactionService;
