// src/utils/helpers/SessionCache.js
const logger = require('../logger');

class SessionCache {
    constructor(maxSize = 1000, ttl = 6 * 60 * 60 * 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl; // Time to live in milliseconds
        this.lastCleanup = Date.now();
        this.cleanupInterval = 60 * 60 * 1000; // Cleanup every hour
    }

    /**
     * Get session data
     */
    get(userId) {
        this.cleanup();
        
        const session = this.cache.get(userId);
        
        if (!session) {
            return null;
        }
        
        // Check if expired
        if (this.isExpired(session)) {
            this.cache.delete(userId);
            return null;
        }
        
        // Update last access
        session.lastAccess = Date.now();
        
        return session.data;
    }

    /**
     * Set session data
     */
    set(userId, data) {
        this.cleanup();
        
        // Ensure cache size limit
        if (this.cache.size >= this.maxSize && !this.cache.has(userId)) {
            this.evictOldest();
        }
        
        const session = {
            userId,
            data,
            createdAt: Date.now(),
            lastAccess: Date.now()
        };
        
        this.cache.set(userId, session);
    }

    /**
     * Update session data
     */
    update(userId, updates) {
        const current = this.get(userId) || {};
        const updated = { ...current, ...updates };
        this.set(userId, updated);
    }

    /**
     * Delete session
     */
    delete(userId) {
        return this.cache.delete(userId);
    }

    /**
     * Clear all sessions
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Check if session is expired
     */
    isExpired(session) {
        return Date.now() - session.lastAccess > this.ttl;
    }

    /**
     * Cleanup expired sessions
     */
    cleanup() {
        // Check if cleanup is needed
        if (Date.now() - this.lastCleanup < this.cleanupInterval) {
            return;
        }
        
        this.lastCleanup = Date.now();
        
        let removed = 0;
        
        for (const [userId, session] of this.cache.entries()) {
            if (this.isExpired(session)) {
                this.cache.delete(userId);
                removed++;
            }
        }
        
        if (removed > 0) {
            logger.debug(`Session cleanup: removed ${removed} expired sessions`);
        }
    }

    /**
     * Evict oldest session
     */
    evictOldest() {
        let oldest = null;
        let oldestTime = Date.now();
        
        for (const [userId, session] of this.cache.entries()) {
            if (session.lastAccess < oldestTime) {
                oldest = userId;
                oldestTime = session.lastAccess;
            }
        }
        
        if (oldest) {
            this.cache.delete(oldest);
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const sessions = Array.from(this.cache.values());
        const now = Date.now();
        
        const stats = {
            total: this.cache.size,
            maxSize: this.maxSize,
            expired: sessions.filter(s => this.isExpired(s)).length,
            active: sessions.filter(s => now - s.lastAccess < 60 * 60 * 1000).length, // Active in last hour
            oldest: null,
            newest: null
        };
        
        if (sessions.length > 0) {
            sessions.sort((a, b) => a.createdAt - b.createdAt);
            stats.oldest = new Date(sessions[0].createdAt);
            stats.newest = new Date(sessions[sessions.length - 1].createdAt);
        }
        
        return stats;
    }

    /**
     * Export sessions for backup
     */
    export() {
        const data = [];
        
        for (const [userId, session] of this.cache.entries()) {
            if (!this.isExpired(session)) {
                data.push({
                    userId,
                    data: session.data,
                    createdAt: session.createdAt,
                    lastAccess: session.lastAccess
                });
            }
        }
        
        return data;
    }

    /**
     * Import sessions from backup
     */
    import(data) {
        if (!Array.isArray(data)) {
            throw new Error('Invalid import data');
        }
        
        let imported = 0;
        
        for (const item of data) {
            if (item.userId && item.data) {
                this.cache.set(item.userId, {
                    userId: item.userId,
                    data: item.data,
                    createdAt: item.createdAt || Date.now(),
                    lastAccess: item.lastAccess || Date.now()
                });
                imported++;
            }
        }
        
        logger.info(`Imported ${imported} sessions`);
        return imported;
    }

    /**
     * Get active sessions count
     */
    getActiveCount() {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        let count = 0;
        
        for (const session of this.cache.values()) {
            if (session.lastAccess > oneHourAgo) {
                count++;
            }
        }
        
        return count;
    }

    /**
     * Get memory usage estimate
     */
    getMemoryUsage() {
        // Rough estimate: assume average 1KB per session
        return {
            bytes: this.cache.size * 1024,
            megabytes: (this.cache.size * 1024 / 1024 / 1024).toFixed(2)
        };
    }
}

module.exports = SessionCache;
