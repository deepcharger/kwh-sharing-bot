// src/handlers/webhook/ApiRoutes.js
const express = require('express');
const logger = require('../../utils/logger');

class ApiRoutes {
    constructor(bot) {
        this.bot = bot;
        this.router = express.Router();
        this.setupRoutes();
    }

    setupRoutes() {
        // Middleware for API authentication
        this.router.use('/api/admin', this.authenticateAdmin.bind(this));
        
        // Public API routes
        this.router.get('/api/status', this.getStatus.bind(this));
        this.router.get('/api/stats', this.getPublicStats.bind(this));
        this.router.get('/api/announcements', this.getAnnouncements.bind(this));
        
        // Admin API routes
        this.router.get('/api/admin/stats', this.getAdminStats.bind(this));
        this.router.get('/api/admin/users', this.getUsers.bind(this));
        this.router.get('/api/admin/transactions', this.getTransactions.bind(this));
        this.router.post('/api/admin/broadcast', this.broadcastMessage.bind(this));
        this.router.post('/api/admin/trigger-job', this.triggerCronJob.bind(this));
        
        // Webhook endpoints
        this.router.post('/webhook/payment/:provider', this.handlePaymentWebhook.bind(this));
        
        // Error handling
        this.router.use(this.errorHandler.bind(this));
    }

    // Middleware
    authenticateAdmin(req, res, next) {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || token !== process.env.ADMIN_API_TOKEN) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        next();
    }

    // Public endpoints
    async getStatus(req, res) {
        try {
            const stats = await this.bot.services.transaction.getTransactionStats();
            const announcementStats = await this.bot.services.announcement.getAnnouncementStats();
            const pendingTransactions = await this.bot.services.transaction.getPendingTransactions();
            
            res.json({
                status: 'online',
                version: require('../../../package.json').version,
                timestamp: new Date().toISOString(),
                transactions: {
                    total: stats?.overall?.totalTransactions || 0,
                    completed: stats?.overall?.completedTransactions || 0,
                    pending: pendingTransactions.length
                },
                announcements: {
                    active: announcementStats?.totalActive || 0,
                    avgPrice: announcementStats?.avgPrice || 0
                }
            });
        } catch (error) {
            logger.error('Error in getStatus:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async getPublicStats(req, res) {
        try {
            // Get cached stats
            const cachedStats = await this.bot.db.getCollection('stats_cache')
                .findOne({ type: 'realtime' });
            
            if (cachedStats && (Date.now() - cachedStats.updatedAt.getTime()) < 5 * 60 * 1000) {
                return res.json(cachedStats.data);
            }
            
            // Generate fresh stats
            const stats = {
                activeUsers: await this.getActiveUsersCount(),
                activeAnnouncements: await this.bot.services.announcement.getActiveAnnouncements().length,
                completedToday: await this.getTodayCompletedCount(),
                volumeToday: await this.getTodayVolume()
            };
            
            res.json(stats);
        } catch (error) {
            logger.error('Error in getPublicStats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async getAnnouncements(req, res) {
        try {
            const { limit = 20, offset = 0, sortBy = 'createdAt', order = 'desc' } = req.query;
            
            const announcements = await this.bot.db.getCollection('announcements')
                .find({ active: true })
                .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
                .skip(parseInt(offset))
                .limit(parseInt(limit))
                .toArray();
            
            // Remove sensitive data
            const publicAnnouncements = announcements.map(ann => ({
                id: ann.announcementId,
                location: ann.location,
                zones: ann.zones,
                price: ann.price || ann.basePrice,
                pricingType: ann.pricingType,
                pricingTiers: ann.pricingTiers,
                currentType: ann.currentType,
                networks: ann.networks,
                availability: ann.availability,
                createdAt: ann.createdAt,
                expiresAt: ann.expiresAt
            }));
            
            res.json({
                announcements: publicAnnouncements,
                total: await this.bot.db.getCollection('announcements').countDocuments({ active: true }),
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        } catch (error) {
            logger.error('Error in getAnnouncements:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Admin endpoints
    async getAdminStats(req, res) {
        try {
            const { period = 'day' } = req.query;
            
            const stats = await this.generateAdminStats(period);
            res.json(stats);
        } catch (error) {
            logger.error('Error in getAdminStats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async getUsers(req, res) {
        try {
            const { limit = 50, offset = 0, sortBy = 'createdAt', order = 'desc' } = req.query;
            
            const users = await this.bot.db.getCollection('users')
                .find({})
                .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
                .skip(parseInt(offset))
                .limit(parseInt(limit))
                .toArray();
            
            res.json({
                users,
                total: await this.bot.db.getCollection('users').countDocuments(),
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        } catch (error) {
            logger.error('Error in getUsers:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async getTransactions(req, res) {
        try {
            const { 
                limit = 50, 
                offset = 0, 
                status,
                userId,
                from,
                to,
                sortBy = 'createdAt', 
                order = 'desc' 
            } = req.query;
            
            const filter = {};
            
            if (status) filter.status = status;
            if (userId) filter.$or = [{ sellerId: parseInt(userId) }, { buyerId: parseInt(userId) }];
            if (from || to) {
                filter.createdAt = {};
                if (from) filter.createdAt.$gte = new Date(from);
                if (to) filter.createdAt.$lte = new Date(to);
            }
            
            const transactions = await this.bot.db.getCollection('transactions')
                .find(filter)
                .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
                .skip(parseInt(offset))
                .limit(parseInt(limit))
                .toArray();
            
            res.json({
                transactions,
                total: await this.bot.db.getCollection('transactions').countDocuments(filter),
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        } catch (error) {
            logger.error('Error in getTransactions:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async broadcastMessage(req, res) {
        try {
            const { message, targetUsers = 'all' } = req.body;
            
            if (!message) {
                return res.status(400).json({ error: 'Message is required' });
            }
            
            let users;
            if (targetUsers === 'all') {
                users = await this.bot.db.getCollection('users').find({}).toArray();
            } else if (Array.isArray(targetUsers)) {
                users = await this.bot.db.getCollection('users')
                    .find({ userId: { $in: targetUsers } })
                    .toArray();
            } else {
                return res.status(400).json({ error: 'Invalid targetUsers' });
            }
            
            const results = {
                total: users.length,
                success: 0,
                failed: 0
            };
            
            for (const user of users) {
                try {
                    await this.bot.bot.telegram.sendMessage(
                        user.userId,
                        `📢 **COMUNICAZIONE AMMINISTRATORE**\n\n${message}`,
                        { parse_mode: 'Markdown' }
                    );
                    results.success++;
                } catch (error) {
                    results.failed++;
                    logger.debug(`Failed to send broadcast to ${user.userId}:`, error.message);
                }
            }
            
            res.json(results);
        } catch (error) {
            logger.error('Error in broadcastMessage:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async triggerCronJob(req, res) {
        try {
            const { job } = req.body;
            
            if (!job) {
                return res.status(400).json({ error: 'Job name is required' });
            }
            
            const cronHandler = this.bot.handlerRegistry.get('cron');
            const success = await cronHandler.triggerJob(job);
            
            if (success) {
                res.json({ message: `Job ${job} triggered successfully` });
            } else {
                res.status(404).json({ error: 'Job not found' });
            }
        } catch (error) {
            logger.error('Error in triggerCronJob:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Payment webhook handler
    async handlePaymentWebhook(req, res) {
        try {
            const { provider } = req.params;
            const payload = req.body;
            
            logger.info(`Payment webhook received from ${provider}:`, payload);
            
            // Validate webhook signature based on provider
            if (!this.validateWebhookSignature(provider, req)) {
                return res.status(401).json({ error: 'Invalid signature' });
            }
            
            // Process payment update
            await this.processPaymentUpdate(provider, payload);
            
            res.json({ success: true });
        } catch (error) {
            logger.error('Error in handlePaymentWebhook:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Helper methods
    async generateAdminStats(period) {
        const now = new Date();
        let startDate;
        
        switch (period) {
            case 'hour':
                startDate = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case 'day':
                startDate = new Date(now);
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate = new Date(now);
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            default:
                startDate = new Date(now);
                startDate.setHours(0, 0, 0, 0);
        }
        
        const transactions = await this.bot.db.getCollection('transactions')
            .find({ createdAt: { $gte: startDate } })
            .toArray();
        
        const announcements = await this.bot.db.getCollection('announcements')
            .find({ createdAt: { $gte: startDate } })
            .toArray();
        
        const users = await this.bot.db.getCollection('users')
            .find({ createdAt: { $gte: startDate } })
            .toArray();
        
        return {
            period,
            startDate,
            endDate: now,
            transactions: {
                total: transactions.length,
                completed: transactions.filter(t => t.status === 'completed').length,
                cancelled: transactions.filter(t => t.status === 'cancelled').length,
                volume: transactions
                    .filter(t => t.status === 'completed')
                    .reduce((sum, t) => sum + (t.totalAmount || 0), 0),
                avgValue: transactions.length > 0 ?
                    transactions
                        .filter(t => t.status === 'completed' && t.totalAmount)
                        .reduce((sum, t, _, arr) => sum + t.totalAmount / arr.length, 0) : 0
            },
            announcements: {
                created: announcements.length,
                active: announcements.filter(a => a.active).length,
                expired: announcements.filter(a => !a.active).length
            },
            users: {
                new: users.length,
                active: await this.getActiveUsersCount()
            }
        };
    }

    async getActiveUsersCount() {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return await this.bot.db.getCollection('users').countDocuments({
            lastActivity: { $gte: oneDayAgo }
        });
    }

    async getTodayCompletedCount() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return await this.bot.db.getCollection('transactions').countDocuments({
            status: 'completed',
            completedAt: { $gte: today }
        });
    }

    async getTodayVolume() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const result = await this.bot.db.getCollection('transactions').aggregate([
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

    validateWebhookSignature(provider, req) {
        // Implement signature validation based on provider
        // This is a placeholder - implement actual validation
        switch (provider) {
            case 'paypal':
                // Validate PayPal webhook signature
                return true;
            case 'stripe':
                // Validate Stripe webhook signature
                return true;
            default:
                return false;
        }
    }

    async processPaymentUpdate(provider, payload) {
        // Process payment update based on provider
        // This is a placeholder - implement actual processing
        logger.info(`Processing payment update from ${provider}`);
    }

    errorHandler(err, req, res, next) {
        logger.error('API Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = ApiRoutes;
