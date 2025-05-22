const axios = require('axios');

class UserService {
    constructor(database) {
        this.db = database;
        this.users = database.getCollection('users');
        this.feedback = database.getCollection('feedback');
    }

    async upsertUser(userData) {
        try {
            const result = await this.users.updateOne(
                { userId: userData.userId },
                { 
                    $set: {
                        ...userData,
                        updatedAt: new Date()
                    },
                    $setOnInsert: {
                        createdAt: new Date(),
                        totalTransactions: 0,
                        totalKwhSold: 0,
                        totalKwhBought: 0,
                        rating: 0,
                        feedbackCount: 0
                    }
                },
                { upsert: true }
            );
            
            return result;
        } catch (error) {
            console.error('Errore upsert utente:', error);
            throw error;
        }
    }

    async getUser(userId) {
        try {
            return await this.users.findOne({ userId });
        } catch (error) {
            console.error('Errore get utente:', error);
            return null;
        }
    }

    async isUserInGroup(userId, groupId) {
        try {
            // Verifica se l'utente è membro del gruppo tramite API Telegram
            const botToken = process.env.BOT_TOKEN;
            const response = await axios.get(
                `https://api.telegram.org/bot${botToken}/getChatMember`,
                {
                    params: {
                        chat_id: groupId,
                        user_id: userId
                    }
                }
            );

            const status = response.data.result.status;
            return ['creator', 'administrator', 'member'].includes(status);
            
        } catch (error) {
            // Se la chiamata API fallisce, assumiamo che l'utente non sia nel gruppo
            console.log(`Utente ${userId} non trovato nel gruppo o errore API:`, error.response?.data?.description);
            return false;
        }
    }

    async getUserStats(userId) {
        try {
            const user = await this.getUser(userId);
            if (!user) return null;

            // Calcola statistiche feedback
            const feedbackStats = await this.calculateFeedbackStats(userId);
            
            return {
                ...user,
                ...feedbackStats
            };
        } catch (error) {
            console.error('Errore get stats utente:', error);
            return null;
        }
    }

    async calculateFeedbackStats(userId) {
        try {
            const pipeline = [
                { $match: { toUserId: userId } }, // Fix: era userId invece di toUserId
                {
                    $group: {
                        _id: null,
                        totalFeedback: { $sum: 1 },
                        totalRating: { $sum: '$rating' },
                        positiveCount: {
                            $sum: { $cond: [{ $gte: ['$rating', 4] }, 1, 0] }
                        },
                        negativeCount: {
                            $sum: { $cond: [{ $lte: ['$rating', 2] }, 1, 0] }
                        }
                    }
                }
            ];

            const result = await this.feedback.aggregate(pipeline).toArray();
            
            if (result.length === 0) {
                return {
                    totalFeedback: 0,
                    averageRating: 0,
                    positivePercentage: 0,
                    sellerBadge: null
                };
            }

            const stats = result[0];
            const averageRating = stats.totalRating / stats.totalFeedback;
            const positivePercentage = (stats.positiveCount / stats.totalFeedback) * 100;

            // Determina badge venditore
            let sellerBadge = null;
            if (stats.totalFeedback >= 5) {
                if (positivePercentage >= 95) {
                    sellerBadge = 'TOP';
                } else if (positivePercentage >= 90) {
                    sellerBadge = 'AFFIDABILE';
                }
            }

            return {
                totalFeedback: stats.totalFeedback,
                averageRating: Math.round(averageRating * 10) / 10,
                positivePercentage: Math.round(positivePercentage * 10) / 10,
                sellerBadge,
                positiveCount: stats.positiveCount,
                negativeCount: stats.negativeCount
            };
            
        } catch (error) {
            console.error('Errore calcolo stats feedback:', error);
            return {
                totalFeedback: 0,
                averageRating: 0,
                positivePercentage: 0,
                sellerBadge: null
            };
        }
    }

    async updateUserTransactionStats(userId, kwhAmount, type = 'sell') {
        try {
            const updateField = type === 'sell' ? 'totalKwhSold' : 'totalKwhBought';
            
            await this.users.updateOne(
                { userId },
                { 
                    $inc: { 
                        totalTransactions: 1,
                        [updateField]: kwhAmount
                    },
                    $set: { updatedAt: new Date() }
                }
            );
        } catch (error) {
            console.error('Errore update stats transazione:', error);
        }
    }

    async getSellerBadgeText(userId) {
        const stats = await this.calculateFeedbackStats(userId);
        
        if (!stats.sellerBadge) {
            return '';
        }

        const badgeEmojis = {
            'TOP': '🌟🟢 VENDITORE TOP',
            'AFFIDABILE': '✅🟢 VENDITORE AFFIDABILE'
        };

        const percentage = stats.positivePercentage.toFixed(1);
        return `${badgeEmojis[stats.sellerBadge]} (${percentage}% positivi)`;
    }

    async getAllUsersWithStats() {
        try {
            const users = await this.users.find({}).toArray();
            const usersWithStats = [];

            for (const user of users) {
                const stats = await this.calculateFeedbackStats(user.userId);
                usersWithStats.push({
                    ...user,
                    ...stats
                });
            }

            return usersWithStats;
        } catch (error) {
            console.error('Errore get all users:', error);
            return [];
        }
    }
}

module.exports = UserService;
