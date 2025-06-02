// src/handlers/cron/CronJobHandler.js
const cron = require('node-cron');
const logger = require('../../utils/logger');
const CleanupJob = require('./jobs/CleanupJob');
const NotificationJob = require('./jobs/NotificationJob');
const StatsJob = require('./jobs/StatsJob');
const { CRON } = require('../../config/constants');

class CronJobHandler {
    constructor(bot) {
        this.bot = bot;
        this.jobs = {
            cleanup: new CleanupJob(bot),
            notification: new NotificationJob(bot),
            stats: new StatsJob(bot)
        };
        this.scheduledTasks = [];
    }

    setupCronJobs() {
        logger.info('⏰ Setting up cron jobs...');
        
        // Cleanup jobs
        this.scheduleTask(CRON.CLEANUP_SCHEDULE, 
            () => this.jobs.cleanup.runHourlyCleanup(),
            'Hourly cleanup'
        );
        
        this.scheduleTask(CRON.DEEP_CLEANUP_SCHEDULE,
            () => this.jobs.cleanup.runDailyCleanup(),
            'Daily cleanup'
        );
        
        this.scheduleTask('0 2 * * 0', // Weekly on Sunday at 2 AM
            () => this.jobs.cleanup.runWeeklyCleanup(),
            'Weekly cleanup'
        );
        
        // Notification jobs
        this.scheduleTask('*/30 * * * *', // Every 30 minutes
            () => this.jobs.notification.runPendingReminders(),
            'Pending reminders'
        );
        
        this.scheduleTask('*/5 * * * *', // Every 5 minutes
            () => this.jobs.notification.runScheduledNotifications(),
            'Scheduled notifications'
        );
        
        // Stats jobs
        this.scheduleTask(CRON.STATS_REPORT_SCHEDULE,
            () => this.jobs.stats.runDailyReport(),
            'Daily stats report'
        );
        
        this.scheduleTask('0 10 * * 1', // Monday at 10 AM
            () => this.jobs.stats.runWeeklySummary(),
            'Weekly summary'
        );
        
        this.scheduleTask('*/15 * * * *', // Every 15 minutes
            () => this.jobs.stats.updateRealtimeStats(),
            'Realtime stats update'
        );
        
        // Announcement management
        this.scheduleTask(CRON.ANNOUNCEMENT_CHECK_SCHEDULE,
            () => this.handleExpiredAnnouncements(),
            'Expired announcements check'
        );
        
        this.scheduleTask(CRON.ANNOUNCEMENT_REFRESH_SCHEDULE,
            () => this.refreshAnnouncementTimers(),
            'Announcement timer refresh'
        );
        
        // Keep-alive ping (for free tier services)
        if (process.env.NODE_ENV === 'production' && process.env.KEEP_ALIVE_URL) {
            this.scheduleTask(CRON.KEEP_ALIVE_SCHEDULE,
                () => this.keepAlivePing(),
                'Keep-alive ping'
            );
        }
        
        logger.info(`✅ ${this.scheduledTasks.length} cron jobs configured successfully`);
    }

    scheduleTask(schedule, task, name) {
        const scheduledTask = cron.schedule(schedule, async () => {
            try {
                logger.debug(`Running cron job: ${name}`);
                await task();
            } catch (error) {
                logger.error(`Error in cron job ${name}:`, error);
            }
        });
        
        this.scheduledTasks.push({ name, schedule, task: scheduledTask });
    }

    // Legacy methods for compatibility
    async handleExpiredAnnouncements() {
        const expiredAnnouncements = await this.bot.services.announcement.getExpiredAnnouncements();
        
        for (const announcement of expiredAnnouncements) {
            try {
                // Disattiva l'annuncio
                await this.bot.services.announcement.updateAnnouncement(
                    announcement.announcementId,
                    { active: false }
                );
                
                // Elimina dal gruppo
                if (announcement.messageId) {
                    try {
                        await this.bot.bot.telegram.deleteMessage(
                            this.bot.groupId, 
                            announcement.messageId
                        );
                    } catch (deleteError) {
                        logger.debug(`Could not delete message ${announcement.messageId}:`, deleteError.description);
                    }
                }
                
                // Notifica il venditore
                await this.bot.services.notification.notifyUser(
                    announcement.userId,
                    `⏰ **ANNUNCIO SCADUTO**\n\n` +
                    `Il tuo annuncio \`${announcement.announcementId}\` è scaduto dopo 24 ore ed è stato rimosso.\n\n` +
                    `Puoi pubblicarne uno nuovo quando vuoi dal menu principale.`,
                    { parse_mode: 'Markdown' }
                );
                
                logger.info(`Expired announcement ${announcement.announcementId} removed`);
            } catch (error) {
                logger.error(`Error handling expired announcement ${announcement.announcementId}:`, error);
            }
        }
    }

    async refreshAnnouncementTimers() {
        const activeAnnouncements = await this.bot.services.announcement.getActiveAnnouncements(50);
        let refreshedCount = 0;
        
        for (const announcement of activeAnnouncements) {
            try {
                const lastRefresh = announcement.lastRefreshedAt || announcement.createdAt;
                const now = new Date();
                const timeSinceRefresh = now - lastRefresh;
                
                if (timeSinceRefresh >= 15 * 60 * 1000 && announcement.messageId) {
                    const userStats = await this.bot.services.user.getUserStats(announcement.userId);
                    const updatedMessage = this.bot.services.announcement.formatAnnouncementForGroup(
                        announcement, 
                        userStats
                    );
                    
                    try {
                        await this.bot.bot.telegram.editMessageText(
                            this.bot.groupId,
                            announcement.messageId,
                            null,
                            updatedMessage,
                            {
                                parse_mode: 'Markdown',
                                message_thread_id: parseInt(this.bot.topicId),
                                reply_markup: {
                                    inline_keyboard: [[
                                        { 
                                            text: '🛒 Contatta venditore', 
                                            url: `t.me/${process.env.BOT_USERNAME}?start=contact_${announcement.announcementId}` 
                                        }
                                    ]]
                                }
                            }
                        );
                        
                        await this.bot.services.announcement.updateAnnouncement(
                            announcement.announcementId,
                            { lastRefreshedAt: now }
                        );
                        
                        refreshedCount++;
                        
                    } catch (editError) {
                        if (!editError.message?.includes('message is not modified')) {
                            logger.error(`Error updating announcement ${announcement.announcementId}:`, editError);
                        }
                    }
                }
            } catch (error) {
                logger.error(`Error refreshing announcement ${announcement.announcementId}:`, error);
            }
        }
        
        if (refreshedCount > 0) {
            logger.info(`Refreshed ${refreshedCount} announcement timers`);
        }
    }

    async keepAlivePing() {
        const axios = require('axios');
        const keepAliveUrl = process.env.KEEP_ALIVE_URL;
        
        try {
            const response = await axios.get(keepAliveUrl, {
                timeout: 10000
            });
            
            if (response.status === 200) {
                logger.debug('Keep-alive ping successful');
            } else {
                logger.warn(`Keep-alive ping returned status: ${response.status}`);
            }
        } catch (error) {
            logger.error('Keep-alive ping failed:', error.message);
            
            if (!this.keepAliveFailCount) {
                this.keepAliveFailCount = 0;
            }
            this.keepAliveFailCount++;
            
            if (this.keepAliveFailCount >= 5) {
                await this.bot.services.notification.notifyAdmin(
                    `Il servizio keep-alive ha fallito ${this.keepAliveFailCount} volte consecutive.\n` +
                    `Ultimo errore: ${error.message}`
                );
                this.keepAliveFailCount = 0;
            }
        }
    }

    // Manual trigger methods for testing
    async triggerJob(jobName) {
        const jobMap = {
            'cleanup': () => this.jobs.cleanup.runHourlyCleanup(),
            'daily-cleanup': () => this.jobs.cleanup.runDailyCleanup(),
            'weekly-cleanup': () => this.jobs.cleanup.runWeeklyCleanup(),
            'reminders': () => this.jobs.notification.runPendingReminders(),
            'daily-report': () => this.jobs.stats.runDailyReport(),
            'weekly-summary': () => this.jobs.stats.runWeeklySummary()
        };
        
        const job = jobMap[jobName];
        if (job) {
            await job();
            return true;
        }
        return false;
    }

    // Cleanup method
    stopAll() {
        for (const { name, task } of this.scheduledTasks) {
            task.stop();
            logger.info(`Stopped cron job: ${name}`);
        }
        this.scheduledTasks = [];
    }
}

module.exports = CronJobHandler;
