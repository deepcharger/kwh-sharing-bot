// src/handlers/cron/jobs/StatsJob.js
const logger = require('../../../utils/logger');

class StatsJob {
    constructor(bot) {
        this.bot = bot;
        this.db = bot.db;
    }

    /**
     * Generate and send daily statistics report
     */
    async runDailyReport() {
        try {
            logger.info('📊 Generating daily report...');
            
            const stats = await this.generateDailyStats();
            const report = this.formatDailyReport(stats);
            
            // Send to admin
            await this.bot.bot.telegram.sendMessage(
                this.bot.adminUserId,
                report,
                { parse_mode: 'Markdown' }
            );
            
            // Store in database
            await this.storeDailyStats(stats);
            
            logger.info('✅ Daily report sent successfully');
            
        } catch (error) {
            logger.error('Error generating daily report:', error);
        }
    }

    /**
     * Generate weekly summary
     */
    async runWeeklySummary() {
        try {
            logger.info('📊 Generating weekly summary...');
            
            const stats = await this.generateWeeklyStats();
            const summary = this.formatWeeklySummary(stats);
            
            // Send to admin
            await this.bot.bot.telegram.sendMessage(
                this.bot.adminUserId,
                summary,
                { parse_mode: 'Markdown' }
            );
            
            logger.info('✅ Weekly summary sent successfully');
            
        } catch (error) {
            logger.error('Error generating weekly summary:', error);
        }
    }

    /**
     * Update real-time statistics cache
     */
    async updateRealtimeStats() {
        try {
            const stats = {
                activeUsers: await this.getActiveUsersCount(),
                activeAnnouncements: await this.getActiveAnnouncementsCount(),
                pendingTransactions: await this.getPendingTransactionsCount(),
                todayTransactions: await this.getTodayTransactionsCount(),
                todayVolume: await this.getTodayVolume()
            };
            
            // Store in cache for API endpoints
            await this.db.getCollection('stats_cache').replaceOne(
                { type: 'realtime' },
                {
                    type: 'realtime',
                    data: stats,
                    updatedAt: new Date()
                },
                { upsert: true }
            );
            
        } catch (error) {
            logger.error('Error updating realtime stats:', error);
        }
    }

    async generateDailyStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Transaction stats
        const transactions = await this.db.getCollection('transactions')
            .find({
                createdAt: { $gte: today, $lt: tomorrow }
            })
            .toArray();
        
        const completed = transactions.filter(t => t.status === 'completed');
        const cancelled = transactions.filter(t => t.status === 'cancelled');
        
        // Announcement stats
        const newAnnouncements = await this.db.getCollection('announcements')
            .countDocuments({
                createdAt: { $gte: today, $lt: tomorrow }
            });
        
        // User stats
        const activeUsers = await this.db.getCollection('users')
            .countDocuments({
                lastActivity: { $gte: today }
            });
        
        // Financial stats
        const totalVolume = completed.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
        const totalKwh = completed.reduce((sum, t) => sum + (t.actualKwh || t.declaredKwh || 0), 0);
        
        // Feedback stats
        const feedbackToday = await this.db.getCollection('feedback')
            .find({
                createdAt: { $gte: today, $lt: tomorrow }
            })
            .toArray();
        
        const avgRating = feedbackToday.length > 0 ?
            feedbackToday.reduce((sum, f) => sum + f.rating, 0) / feedbackToday.length : 0;
        
        return {
            date: today,
            transactions: {
                total: transactions.length,
                completed: completed.length,
                cancelled: cancelled.length,
                successRate: transactions.length > 0 ? 
                    (completed.length / transactions.length * 100).toFixed(1) : 0
            },
            announcements: {
                new: newAnnouncements,
                active: await this.getActiveAnnouncementsCount()
            },
            users: {
                active: activeUsers,
                new: await this.getNewUsersCount(today, tomorrow)
            },
            financial: {
                volume: totalVolume,
                kwh: totalKwh,
                avgTransactionValue: completed.length > 0 ? 
                    (totalVolume / completed.length).toFixed(2) : 0
            },
            feedback: {
                count: feedbackToday.length,
                avgRating: avgRating.toFixed(1)
            }
        };
    }

    async generateWeeklyStats() {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);
        
        // Get daily stats for the week
        const dailyStats = await this.db.getCollection('daily_stats')
            .find({
                date: { $gte: weekAgo }
            })
            .sort({ date: 1 })
            .toArray();
        
        // Aggregate weekly data
        const weeklyData = {
            transactions: {
                total: 0,
                completed: 0,
                cancelled: 0
            },
            financial: {
                totalVolume: 0,
                totalKwh: 0
            },
            users: {
                totalActive: new Set(),
                newUsers: 0
            },
            topSellers: await this.getTopSellers(weekAgo),
            topBuyers: await this.getTopBuyers(weekAgo)
        };
        
        // Aggregate daily stats
        for (const day of dailyStats) {
            weeklyData.transactions.total += day.transactions.total;
            weeklyData.transactions.completed += day.transactions.completed;
            weeklyData.transactions.cancelled += day.transactions.cancelled;
            weeklyData.financial.totalVolume += day.financial.volume;
            weeklyData.financial.totalKwh += day.financial.kwh;
            weeklyData.users.newUsers += day.users.new;
        }
        
        return weeklyData;
    }

    formatDailyReport(stats) {
        return `📊 **REPORT GIORNALIERO**\n` +
            `📅 ${stats.date.toLocaleDateString('it-IT')}\n\n` +
            
            `🔄 **Transazioni:**\n` +
            `• Totali: ${stats.transactions.total}\n` +
            `• Completate: ${stats.transactions.completed}\n` +
            `• Annullate: ${stats.transactions.cancelled}\n` +
            `• Tasso successo: ${stats.transactions.successRate}%\n\n` +
            
            `📋 **Annunci:**\n` +
            `• Nuovi oggi: ${stats.announcements.new}\n` +
            `• Attivi totali: ${stats.announcements.active}\n\n` +
            
            `👥 **Utenti:**\n` +
            `• Attivi oggi: ${stats.users.active}\n` +
            `• Nuovi iscritti: ${stats.users.new}\n\n` +
            
            `💰 **Finanziario:**\n` +
            `• Volume totale: €${stats.financial.volume.toFixed(2)}\n` +
            `• KWH totali: ${stats.financial.kwh.toFixed(1)}\n` +
            `• Valore medio: €${stats.financial.avgTransactionValue}\n\n` +
            
            `⭐ **Feedback:**\n` +
            `• Ricevuti oggi: ${stats.feedback.count}\n` +
            `• Valutazione media: ${stats.feedback.avgRating}/5`;
    }

    formatWeeklySummary(stats) {
        return `📊 **RIEPILOGO SETTIMANALE**\n\n` +
            
            `🔄 **Transazioni:**\n` +
            `• Totali: ${stats.transactions.total}\n` +
            `• Completate: ${stats.transactions.completed}\n` +
            `• Tasso successo: ${stats.transactions.total > 0 ? 
                (stats.transactions.completed / stats.transactions.total * 100).toFixed(1) : 0}%\n\n` +
            
            `💰 **Volume:**\n` +
            `• Totale: €${stats.financial.totalVolume.toFixed(2)}\n` +
            `• KWH: ${stats.financial.totalKwh.toFixed(1)}\n\n` +
            
            `👥 **Utenti:**\n` +
            `• Nuovi utenti: ${stats.users.newUsers}\n\n` +
            
            `🏆 **Top Venditori:**\n` +
            stats.topSellers.map((seller, i) => 
                `${i + 1}. @${seller.username || 'utente'} - ${seller.totalKwh.toFixed(1)} KWH`
            ).join('\n') + '\n\n' +
            
            `🛒 **Top Acquirenti:**\n` +
            stats.topBuyers.map((buyer, i) => 
                `${i + 1}. @${buyer.username || 'utente'} - ${buyer.totalKwh.toFixed(1)} KWH`
            ).join('\n');
    }

    // Helper methods

    async getActiveUsersCount() {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return await this.db.getCollection('users').countDocuments({
            lastActivity: { $gte: oneDayAgo }
        });
    }

    async getActiveAnnouncementsCount() {
        return await this.db.getCollection('announcements').countDocuments({
            active: true
        });
    }

    async getPendingTransactionsCount() {
        return await this.db.getCollection('transactions').countDocuments({
            status: { $nin: ['completed', 'cancelled'] }
        });
    }

    async getTodayTransactionsCount() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return await this.db.getCollection('transactions').countDocuments({
            createdAt: { $gte: today }
        });
    }

    async getTodayVolume() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const result = await this.db.getCollection('transactions').aggregate([
            {
                $match: {
                    status: 'completed',
                    completedAt: { $gte: today }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$totalAmount' }
                }
            }
        ]).toArray();
        
        return result[0]?.total || 0;
    }

    async getNewUsersCount(from, to) {
        return await this.db.getCollection('users').countDocuments({
            createdAt: { $gte: from, $lt: to }
        });
    }

    async getTopSellers(since) {
        const result = await this.db.getCollection('transactions').aggregate([
            {
                $match: {
                    status: 'completed',
                    completedAt: { $gte: since }
                }
            },
            {
                $group: {
                    _id: '$sellerId',
                    totalKwh: { $sum: '$actualKwh' },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { totalKwh: -1 }
            },
            {
                $limit: 5
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: 'userId',
                    as: 'user'
                }
            },
            {
                $unwind: '$user'
            },
            {
                $project: {
                    userId: '$_id',
                    username: '$user.username',
                    totalKwh: 1,
                    count: 1
                }
            }
        ]).toArray();
        
        return result;
    }

    async getTopBuyers(since) {
        const result = await this.db.getCollection('transactions').aggregate([
            {
                $match: {
                    status: 'completed',
                    completedAt: { $gte: since }
                }
            },
            {
                $group: {
                    _id: '$buyerId',
                    totalKwh: { $sum: '$actualKwh' },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { totalKwh: -1 }
            },
            {
                $limit: 5
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: 'userId',
                    as: 'user'
                }
            },
            {
                $unwind: '$user'
            },
            {
                $project: {
                    userId: '$_id',
                    username: '$user.username',
                    totalKwh: 1,
                    count: 1
                }
            }
        ]).toArray();
        
        return result;
    }

    async storeDailyStats(stats) {
        await this.db.getCollection('daily_stats').replaceOne(
            { date: stats.date },
            stats,
            { upsert: true }
        );
    }
}

module.exports = StatsJob;
