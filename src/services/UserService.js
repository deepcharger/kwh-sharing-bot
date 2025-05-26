const mongoose = require('mongoose');
const UserModel = require('../models/UserModel');
const logger = require('../utils/logger');

class UserService {
    static async createUser(userData) {
        try {
            const existingUser = await UserModel.findByUserId(userData.userId);
            
            if (existingUser) {
                // Aggiorna dati esistenti
                existingUser.username = userData.username;
                existingUser.firstName = userData.firstName;
                existingUser.lastName = userData.lastName;
                existingUser.lastActivity = new Date();
                
                await existingUser.save();
                logger.info(`User updated: ${userData.userId}`);
                return existingUser;
            }
            
            // Crea nuovo utente
            const newUser = new UserModel({
                userId: userData.userId,
                username: userData.username,
                firstName: userData.firstName,
                lastName: userData.lastName
            });
            
            await newUser.save();
            logger.info(`New user created: ${userData.userId}`);
            return newUser;
            
        } catch (error) {
            logger.error('Error in createUser:', error);
            throw error;
        }
    }

    static async getUserById(userId) {
        try {
            return await UserModel.findByUserId(userId);
        } catch (error) {
            logger.error('Error in getUserById:', error);
            throw error;
        }
    }

    static async updateUserActivity(userId) {
        try {
            const user = await UserModel.findByUserId(userId);
            if (user) {
                await user.updateActivity();
            }
        } catch (error) {
            logger.error('Error in updateUserActivity:', error);
        }
    }

    static async updateUserStats(userId, transactionData) {
        try {
            const user = await UserModel.findByUserId(userId);
            if (!user) return;

            // Aggiorna statistiche
            user.totalTransactions += 1;
            
            if (transactionData.type === 'buy') {
                user.totalKwhBought += transactionData.kwh;
                user.totalSpent += transactionData.amount;
            } else if (transactionData.type === 'sell') {
                user.totalKwhSold += transactionData.kwh;
                user.totalEarned += transactionData.amount;
            }

            await user.save();
            logger.info(`User stats updated: ${userId}`);
            
        } catch (error) {
            logger.error('Error in updateUserStats:', error);
            throw error;
        }
    }

    static async updateUserRating(userId, newRating) {
        try {
            const user = await UserModel.findByUserId(userId);
            if (!user) return;

            // Calcola nuovo rating medio
            const totalPoints = (user.averageRating * user.totalRatings) + newRating;
            user.totalRatings += 1;
            user.averageRating = totalPoints / user.totalRatings;

            await user.save();
            logger.info(`User rating updated: ${userId} - New avg: ${user.averageRating}`);
            
        } catch (error) {
            logger.error('Error in updateUserRating:', error);
            throw error;
        }
    }

    static async getUsersStats() {
        try {
            const stats = await UserModel.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        activeUsers: { 
                            $sum: { $cond: ['$isActive', 1, 0] } 
                        },
                        avgRating: { $avg: '$averageRating' },
                        totalKwhTraded: { 
                            $sum: { $add: ['$totalKwhBought', '$totalKwhSold'] } 
                        }
                    }
                }
            ]);

            return stats[0] || {
                totalUsers: 0,
                activeUsers: 0,
                avgRating: 0,
                totalKwhTraded: 0
            };
            
        } catch (error) {
            logger.error('Error in getUsersStats:', error);
            throw error;
        }
    }

    static async getTopUsers(limit = 10) {
        try {
            return await UserModel
                .find({ 
                    isActive: true,
                    totalRatings: { $gte: 5 } // Almeno 5 recensioni
                })
                .sort({ averageRating: -1, totalRatings: -1 })
                .limit(limit)
                .select('userId username firstName averageRating totalRatings totalKwhSold');
                
        } catch (error) {
            logger.error('Error in getTopUsers:', error);
            throw error;
        }
    }
}

module.exports = UserService;
