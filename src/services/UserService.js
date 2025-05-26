class UserService {
    constructor(db) {
        this.db = db;
        this.collection = db.getCollection('users');
    }

    async upsertUser(userData) {
        try {
            const user = {
                userId: userData.userId,
                username: userData.username,
                firstName: userData.firstName,
                lastName: userData.lastName,
                lastActivity: new Date(),
                updatedAt: new Date()
            };

            const result = await this.collection.updateOne(
                { userId: userData.userId },
                { 
                    $set: user,
                    $setOnInsert: {
                        createdAt: new Date(),
                        totalKwhSold: 0,
                        totalKwhBought: 0,
                        totalTransactions: 0,
                        totalFeedback: 0,
                        avgRating: 0,
                        positivePercentage: 0,
                        sellerBadge: null
                    }
                },
                { upsert: true }
            );

            console.log(`User ${userData.userId} upserted`);
            return result;
        } catch (error) {
            console.error('Error upserting user:', error);
            throw error;
        }
    }

    async getUser(userId) {
        try {
            return await this.collection.findOne({ userId: userId });
        } catch (error) {
            console.error('Error getting user:', error);
            throw error;
        }
    }

    async getUserStats(userId) {
        try {
            const user = await this.getUser(userId);
            if (!user) {
                return {
                    totalFeedback: 0,
                    avgRating: 0,
                    positivePercentage: 0,
                    sellerBadge: null
                };
            }

            return {
                totalFeedback: user.totalFeedback || 0,
                avgRating: user.avgRating || 0,
                positivePercentage: user.positivePercentage || 0,
                sellerBadge: user.sellerBadge || null
            };
        } catch (error) {
            console.error('Error getting user stats:', error);
            throw error;
        }
    }

    async updateUserTransactionStats(userId, kwhAmount, type) {
        try {
            const updateData = {
                $inc: {
                    totalTransactions: 1
                }
            };

            if (type === 'sell') {
                updateData.$inc.totalKwhSold = kwhAmount;
            } else if (type === 'buy') {
                updateData.$inc.totalKwhBought = kwhAmount;
            }

            await this.collection.updateOne(
                { userId: userId },
                updateData
            );

        } catch (error) {
            console.error('Error updating user stats:', error);
            throw error;
        }
    }

    async isUserInGroup(userId, groupId) {
        try {
            // Per ora assumiamo che tutti gli utenti registrati siano nel gruppo
            // In futuro si può implementare una verifica reale
            const user = await this.getUser(userId);
            return !!user;
        } catch (error) {
            console.error('Error checking user in group:', error);
            return false;
        }
    }

    async getAllUsersWithStats() {
        try {
            return await this.collection
                .find({})
                .sort({ positivePercentage: -1 })
                .toArray();
        } catch (error) {
            console.error('Error getting all users:', error);
            throw error;
        }
    }
}

module.exports = UserService;
