class TransactionService {
    constructor(db) {
        this.db = db;
        this.collection = db.getCollection('transactions');
    }

    async createTransaction(announcementId, sellerId, buyerId, details) {
        try {
            // Recupera l'annuncio per calcolare il prezzo
            const announcement = await this.db.getCollection('announcements')
                .findOne({ announcementId: announcementId });
                
            // FIX: Cambiato da isActive a active
            if (!announcement || !announcement.active) {
                throw new Error('Annuncio non disponibile');
            }

            // Per ora creiamo la transazione senza KWH (verranno aggiunti dopo)
            const transaction = {
                transactionId: `T_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                announcementId: announcementId,
                sellerId: sellerId,
                buyerId: buyerId,
                
                // Dettagli richiesta
                scheduledDate: details.scheduledDate,
                brand: details.brand,
                currentType: details.currentType,
                location: details.location,
                serialNumber: details.serialNumber,
                connector: details.connector,
                
                // Stato iniziale
                status: 'pending_seller_confirmation',
                
                // Problemi e retry
                issues: [],
                retryCount: 0,
                
                // Timestamp
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await this.collection.insertOne(transaction);
            transaction._id = result.insertedId;
            
            console.log(`Transazione creata: ${transaction.transactionId}`);
            return transaction;

        } catch (error) {
            console.error('Errore nella creazione della transazione:', error);
            throw error;
        }
    }

    async updateTransactionWithKwh(transactionId, kwhAmount) {
        try {
            const transaction = await this.getTransaction(transactionId);
            if (!transaction) {
                throw new Error('Transazione non trovata');
            }

            const announcement = await this.db.getCollection('announcements')
                .findOne({ announcementId: transaction.announcementId });
                
            if (!announcement) {
                throw new Error('Annuncio non trovato');
            }

            // Calcola il prezzo
            const calculation = this.calculatePrice(announcement, kwhAmount);
            
            // Aggiorna la transazione con i dati del prezzo
            const updateData = {
                kwhAmount: kwhAmount,
                kwhUsedForCalculation: calculation.kwhUsed,
                pricePerKwh: calculation.pricePerKwh,
                totalAmount: calculation.totalAmount,
                appliedMinimum: calculation.appliedMinimum || false,
                appliedTier: calculation.appliedTier || null,
                updatedAt: new Date()
            };

            await this.collection.updateOne(
                { transactionId: transactionId },
                { $set: updateData }
            );

            return { ...transaction, ...updateData };

        } catch (error) {
            console.error('Errore nell\'aggiornamento KWH:', error);
            throw error;
        }
    }

    calculatePrice(announcement, kwhAmount) {
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
            let applicableTier = announcement.pricingTiers[announcement.pricingTiers.length - 1];
            
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
    }

    async getTransaction(transactionId) {
        try {
            return await this.collection.findOne({ transactionId: transactionId });
        } catch (error) {
            console.error('Errore nel recupero della transazione:', error);
            throw error;
        }
    }

    async getUserTransactions(userId, role = 'all') {
        try {
            let query = {};
            
            if (role === 'buyer') {
                query.buyerId = userId;
            } else if (role === 'seller') {
                query.sellerId = userId;
            } else {
                query.$or = [{ buyerId: userId }, { sellerId: userId }];
            }

            return await this.collection
                .find(query)
                .sort({ createdAt: -1 })
                .toArray();
        } catch (error) {
            console.error('Errore nel recupero transazioni utente:', error);
            throw error;
        }
    }

    async updateTransactionStatus(transactionId, newStatus, additionalData = {}) {
        try {
            const updateData = {
                status: newStatus,
                updatedAt: new Date(),
                ...additionalData
            };

            if (newStatus === 'completed') {
                updateData.completedAt = new Date();
            }

            const result = await this.collection.updateOne(
                { transactionId: transactionId },
                { $set: updateData }
            );

            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Errore nell\'aggiornamento dello status:', error);
            throw error;
        }
    }

    async getPendingTransactions() {
        try {
            return await this.collection
                .find({ 
                    status: { 
                        $nin: ['completed', 'cancelled'] 
                    } 
                })
                .sort({ createdAt: 1 })
                .toArray();
        } catch (error) {
            console.error('Errore nel recupero transazioni pending:', error);
            throw error;
        }
    }

    async addTransactionIssue(transactionId, issue, reportedBy) {
        try {
            const issueData = {
                description: issue,
                reportedBy: reportedBy,
                timestamp: new Date()
            };

            const result = await this.collection.updateOne(
                { transactionId: transactionId },
                { 
                    $push: { issues: issueData },
                    $set: { updatedAt: new Date() }
                }
            );

            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Errore nell\'aggiunta issue:', error);
            throw error;
        }
    }

    async incrementRetryCount(transactionId) {
        try {
            const result = await this.collection.findOneAndUpdate(
                { transactionId: transactionId },
                { 
                    $inc: { retryCount: 1 },
                    $set: { updatedAt: new Date() }
                },
                { returnDocument: 'after' }
            );

            return result.retryCount;
        } catch (error) {
            console.error('Errore nell\'incremento retry:', error);
            throw error;
        }
    }

    async createFeedback(transactionId, fromUserId, toUserId, rating, comment) {
        try {
            const feedback = {
                transactionId: transactionId,
                fromUserId: fromUserId,
                toUserId: toUserId,
                rating: rating,
                comment: comment,
                createdAt: new Date()
            };

            await this.db.getCollection('feedback').insertOne(feedback);
            
            // Aggiorna statistiche utente
            await this.updateUserStats(toUserId, rating);
            
            return true;
        } catch (error) {
            console.error('Errore nella creazione feedback:', error);
            throw error;
        }
    }

    async updateUserStats(userId, newRating) {
        const feedbacks = await this.db.getCollection('feedback')
            .find({ toUserId: userId })
            .toArray();
            
        const totalRatings = feedbacks.length;
        const positiveRatings = feedbacks.filter(f => f.rating >= 4).length;
        const avgRating = feedbacks.reduce((sum, f) => sum + f.rating, 0) / totalRatings;
        
        await this.db.getCollection('users').updateOne(
            { userId: userId },
            { 
                $set: { 
                    totalFeedback: totalRatings,
                    avgRating: avgRating,
                    positivePercentage: Math.round((positiveRatings / totalRatings) * 100),
                    sellerBadge: this.calculateBadge(positiveRatings, totalRatings)
                } 
            }
        );
    }

    calculateBadge(positiveRatings, totalRatings) {
        if (totalRatings < 5) return null;
        const percentage = (positiveRatings / totalRatings) * 100;
        
        if (percentage >= 95) return 'TOP';
        if (percentage >= 90) return 'AFFIDABILE';
        return null;
    }

    async getTransactionStats() {
        try {
            const stats = await this.collection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalTransactions: { $sum: 1 },
                        completedTransactions: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
                            }
                        },
                        totalKwh: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$status', 'completed'] },
                                    '$actualKwh',
                                    0
                                ]
                            }
                        },
                        totalAmount: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$status', 'completed'] },
                                    '$totalAmount',
                                    0
                                ]
                            }
                        }
                    }
                }
            ]).toArray();

            return {
                overall: stats[0] || {
                    totalTransactions: 0,
                    completedTransactions: 0,
                    totalKwh: 0,
                    totalAmount: 0
                }
            };
        } catch (error) {
            console.error('Errore nel calcolo statistiche:', error);
            throw error;
        }
    }
}

module.exports = TransactionService;
