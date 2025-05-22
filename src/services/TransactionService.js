const moment = require('moment');

class TransactionService {
    constructor(database) {
        this.db = database;
        this.transactions = database.getCollection('transactions');
        this.feedback = database.getCollection('feedback');
    }

    async createTransaction(announcementId, sellerId, buyerId, transactionData) {
        try {
            const timestamp = moment().format('YYYYMMDDHHmmss');
            const transactionId = `T_${announcementId}_${timestamp}`;
            
            const transaction = {
                transactionId,
                announcementId,
                sellerId,
                buyerId,
                
                // Dati ricarica
                scheduledDate: transactionData.scheduledDate,
                brand: transactionData.brand,
                currentType: transactionData.currentType, // AC/DC
                location: transactionData.location,
                serialNumber: transactionData.serialNumber,
                connector: transactionData.connector,
                
                // Status tracking
                status: 'pending_seller_confirmation', // pending_seller_confirmation, confirmed, charging_started, charging_completed, photo_uploaded, payment_requested, payment_confirmed, completed, cancelled, disputed
                
                // Dati ricarica effettiva
                actualKwh: null,
                totalAmount: null,
                displayPhoto: null,
                
                // Timestampss
                createdAt: new Date(),
                updatedAt: new Date(),
                confirmedAt: null,
                chargingStartedAt: null,
                chargingCompletedAt: null,
                photoUploadedAt: null,
                paymentRequestedAt: null,
                paymentConfirmedAt: null,
                completedAt: null,
                
                // Problemi e note
                issues: [],
                adminNotes: [],
                retryCount: 0
            };

            const result = await this.transactions.insertOne(transaction);
            return { ...transaction, _id: result.insertedId };
            
        } catch (error) {
            console.error('Errore creazione transazione:', error);
            throw error;
        }
    }

    async getTransaction(transactionId) {
        try {
            return await this.transactions.findOne({ transactionId });
        } catch (error) {
            console.error('Errore get transazione:', error);
            return null;
        }
    }

    async updateTransactionStatus(transactionId, newStatus, additionalData = {}) {
        try {
            const updateData = {
                status: newStatus,
                updatedAt: new Date(),
                ...additionalData
            };

            // Aggiungi timestamp specifici per alcuni status
            const statusTimestamps = {
                'confirmed': 'confirmedAt',
                'charging_started': 'chargingStartedAt', 
                'charging_completed': 'chargingCompletedAt',
                'photo_uploaded': 'photoUploadedAt',
                'payment_requested': 'paymentRequestedAt',
                'payment_confirmed': 'paymentConfirmedAt',
                'completed': 'completedAt'
            };

            if (statusTimestamps[newStatus]) {
                updateData[statusTimestamps[newStatus]] = new Date();
            }

            const result = await this.transactions.updateOne(
                { transactionId },
                { $set: updateData }
            );

            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Errore update status transazione:', error);
            return false;
        }
    }

    async addTransactionIssue(transactionId, issue, reportedBy) {
        try {
            const issueData = {
                issue,
                reportedBy,
                timestamp: new Date()
            };

            await this.transactions.updateOne(
                { transactionId },
                { 
                    $push: { issues: issueData },
                    $set: { updatedAt: new Date() }
                }
            );

            return true;
        } catch (error) {
            console.error('Errore aggiunta issue transazione:', error);
            return false;
        }
    }

    async incrementRetryCount(transactionId) {
        try {
            const result = await this.transactions.updateOne(
                { transactionId },
                { 
                    $inc: { retryCount: 1 },
                    $set: { updatedAt: new Date() }
                }
            );

            const transaction = await this.getTransaction(transactionId);
            return transaction?.retryCount || 0;
        } catch (error) {
            console.error('Errore increment retry:', error);
            return 0;
        }
    }

    async getUserTransactions(userId, type = 'all') {
        try {
            let query = {};
            
            if (type === 'seller') {
                query.sellerId = userId;
            } else if (type === 'buyer') {
                query.buyerId = userId;
            } else {
                query = { $or: [{ sellerId: userId }, { buyerId: userId }] };
            }

            return await this.transactions
                .find(query)
                .sort({ createdAt: -1 })
                .toArray();
        } catch (error) {
            console.error('Errore get transazioni utente:', error);
            return [];
        }
    }

    async getPendingTransactions() {
        try {
            const pendingStatuses = [
                'pending_seller_confirmation',
                'confirmed', 
                'charging_started',
                'charging_completed',
                'photo_uploaded',
                'payment_requested'
            ];

            return await this.transactions
                .find({ status: { $in: pendingStatuses } })
                .sort({ createdAt: 1 })
                .toArray();
        } catch (error) {
            console.error('Errore get transazioni pending:', error);
            return [];
        }
    }

    async validateKwhFromPhoto(transactionId, declaredKwh, photoData) {
        try {
            // Qui implementeremo la validazione OCR della foto
            // Per ora simuliamo la validazione
            
            const tolerance = 0.1; // 10% di tolleranza
            const minKwh = declaredKwh * (1 - tolerance);
            const maxKwh = declaredKwh * (1 + tolerance);
            
            // TODO: Implementare OCR reale con Tesseract.js
            // const detectedKwh = await this.extractKwhFromImage(photoData);
            
            // Per ora accettiamo sempre (logica placeholder)
            const isValid = true;
            const detectedKwh = declaredKwh; // Placeholder
            
            await this.transactions.updateOne(
                { transactionId },
                {
                    $set: {
                        actualKwh: declaredKwh,
                        detectedKwh: detectedKwh,
                        photoValidated: isValid,
                        photoValidatedAt: new Date(),
                        updatedAt: new Date()
                    }
                }
            );

            return {
                isValid,
                declaredKwh,
                detectedKwh,
                tolerance
            };

        } catch (error) {
            console.error('Errore validazione foto KWH:', error);
            return { isValid: false, error: error.message };
        }
    }

    async calculateTransactionAmount(transactionId, kwhAmount, pricePerKwh) {
        try {
            const totalAmount = kwhAmount * pricePerKwh;
            
            await this.transactions.updateOne(
                { transactionId },
                {
                    $set: {
                        actualKwh: kwhAmount,
                        totalAmount: totalAmount,
                        pricePerKwh: pricePerKwh,
                        updatedAt: new Date()
                    }
                }
            );

            return totalAmount;
        } catch (error) {
            console.error('Errore calcolo amount transazione:', error);
            return 0;
        }
    }

    async addAdminNote(transactionId, note, adminUserId) {
        try {
            const adminNote = {
                note,
                adminUserId,
                timestamp: new Date()
            };

            await this.transactions.updateOne(
                { transactionId },
                { 
                    $push: { adminNotes: adminNote },
                    $set: { updatedAt: new Date() }
                }
            );

            return true;
        } catch (error) {
            console.error('Errore aggiunta nota admin:', error);
            return false;
        }
    }

    async getTransactionStats() {
        try {
            const pipeline = [
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        totalKwh: { $sum: '$actualKwh' },
                        totalAmount: { $sum: '$totalAmount' }
                    }
                }
            ];

            const statusStats = await this.transactions.aggregate(pipeline).toArray();
            
            const overallPipeline = [
                {
                    $group: {
                        _id: null,
                        totalTransactions: { $sum: 1 },
                        completedTransactions: {
                            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                        },
                        totalKwh: { $sum: '$actualKwh' },
                        totalRevenue: { $sum: '$totalAmount' },
                        avgKwhPerTransaction: { $avg: '$actualKwh' },
                        avgAmountPerTransaction: { $avg: '$totalAmount' }
                    }
                }
            ];

            const overallStats = await this.transactions.aggregate(overallPipeline).toArray();

            return {
                byStatus: statusStats,
                overall: overallStats[0] || {}
            };
        } catch (error) {
            console.error('Errore get stats transazioni:', error);
            return null;
        }
    }

    async cancelTransaction(transactionId, reason, cancelledBy) {
        try {
            await this.updateTransactionStatus(transactionId, 'cancelled', {
                cancellationReason: reason,
                cancelledBy: cancelledBy,
                cancelledAt: new Date()
            });

            return true;
        } catch (error) {
            console.error('Errore cancellazione transazione:', error);
            return false;
        }
    }

    async createFeedback(transactionId, fromUserId, toUserId, rating, comment = '') {
        try {
            const feedback = {
                transactionId,
                fromUserId,
                toUserId,
                rating, // 1-5
                comment,
                createdAt: new Date()
            };

            const result = await this.feedback.insertOne(feedback);
            
            // Aggiorna il conteggio feedback dell'utente ricevente
            await this.updateUserFeedbackStats(toUserId);
            
            return { ...feedback, _id: result.insertedId };
        } catch (error) {
            console.error('Errore creazione feedback:', error);
            throw error;
        }
    }

    async updateUserFeedbackStats(userId) {
        try {
            const pipeline = [
                { $match: { toUserId: userId } },
                {
                    $group: {
                        _id: null,
                        totalFeedback: { $sum: 1 },
                        averageRating: { $avg: '$rating' },
                        positiveCount: {
                            $sum: { $cond: [{ $gte: ['$rating', 4] }, 1, 0] }
                        }
                    }
                }
            ];

            const stats = await this.feedback.aggregate(pipeline).toArray();
            
            if (stats.length > 0) {
                const { totalFeedback, averageRating, positiveCount } = stats[0];
                const positivePercentage = (positiveCount / totalFeedback) * 100;

                // Aggiorna le statistiche utente nella collezione users
                await this.db.getCollection('users').updateOne(
                    { userId },
                    {
                        $set: {
                            feedbackCount: totalFeedback,
                            rating: Math.round(averageRating * 10) / 10,
                            positivePercentage: Math.round(positivePercentage * 10) / 10,
                            updatedAt: new Date()
                        }
                    }
                );
            }
        } catch (error) {
            console.error('Errore update feedback stats:', error);
        }
    }
}

module.exports = TransactionService;
