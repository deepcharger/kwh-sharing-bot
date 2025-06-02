// src/utils/cache/SessionCache.js - Cache per sessioni utente
const logger = require('../logger');
const { CACHE, LIMITS } = require('../../config/constants');

class SessionCache {
    constructor(maxSize = CACHE.SESSION_CACHE_SIZE, ttl = CACHE.CACHE_TTL_HOURS * 60 * 60 * 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl; // Time to live in milliseconds
        this.lastCleanup = Date.now();
        this.cleanupInterval = CACHE.CLEANUP_INTERVAL_MINUTES * 60 * 1000;
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            cleanups: 0
        };
    }

    /**
     * Get session data
     */
    get(userId) {
        this.periodicCleanup();
        
        const session = this.cache.get(userId);
        
        if (!session) {
            this.stats.misses++;
            return null;
        }
        
        // Check if expired
        if (this.isExpired(session)) {
            this.cache.delete(userId);
            this.stats.misses++;
            return null;
        }
        
        // Update last access
        session.lastAccess = Date.now();
        this.stats.hits++;
        
        return session.data;
    }

    /**
     * Set session data
     */
    set(userId, data) {
        this.periodicCleanup();
        
        // Ensure cache size limit
        if (this.cache.size >= this.maxSize && !this.cache.has(userId)) {
            this.evictOldest();
        }
        
        const session = {
            userId,
            data: this.cloneData(data),
            createdAt: Date.now(),
            lastAccess: Date.now(),
            version: 1
        };
        
        this.cache.set(userId, session);
        this.stats.sets++;
        
        logger.debug(`Session set for user ${userId}`);
    }

    /**
     * Update session data (merge with existing)
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
        const deleted = this.cache.delete(userId);
        if (deleted) {
            this.stats.deletes++;
            logger.debug(`Session deleted for user ${userId}`);
        }
        return deleted;
    }

    /**
     * Clear all sessions
     */
    clear() {
        const count = this.cache.size;
        this.cache.clear();
        this.stats.deletes += count;
        logger.info(`Cleared ${count} sessions from cache`);
    }

    /**
     * Check if session exists
     */
    has(userId) {
        const session = this.cache.get(userId);
        return session && !this.isExpired(session);
    }

    /**
     * Get session metadata
     */
    getMetadata(userId) {
        const session = this.cache.get(userId);
        if (!session || this.isExpired(session)) {
            return null;
        }

        return {
            userId: session.userId,
            createdAt: new Date(session.createdAt),
            lastAccess: new Date(session.lastAccess),
            version: session.version,
            size: this.estimateSize(session.data)
        };
    }

    /**
     * Touch session (update last access without changing data)
     */
    touch(userId) {
        const session = this.cache.get(userId);
        if (session && !this.isExpired(session)) {
            session.lastAccess = Date.now();
            return true;
        }
        return false;
    }

    /**
     * Check if session is expired
     */
    isExpired(session) {
        return Date.now() - session.lastAccess > this.ttl;
    }

    /**
     * Periodic cleanup (called automatically)
     */
    periodicCleanup() {
        // Check if cleanup is needed
        if (Date.now() - this.lastCleanup < this.cleanupInterval) {
            return;
        }
        
        this.cleanup();
    }

    /**
     * Cleanup expired sessions
     */
    cleanup() {
        this.lastCleanup = Date.now();
        
        let removed = 0;
        const now = Date.now();
        
        for (const [userId, session] of this.cache.entries()) {
            if (now - session.lastAccess > this.ttl) {
                this.cache.delete(userId);
                removed++;
            }
        }
        
        if (removed > 0) {
            this.stats.cleanups++;
            logger.debug(`Session cleanup: removed ${removed} expired sessions`);
        }
    }

    /**
     * Force cleanup of all expired sessions
     */
    forceCleanup() {
        this.cleanup();
    }

    /**
     * Evict oldest session to make room
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
            logger.debug(`Evicted oldest session for user ${oldest}`);
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
            newest: null,
            hitRate: this.stats.hits + this.stats.misses > 0 ? 
                (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%' : '0%',
            operations: { ...this.stats },
            memoryUsage: this.getMemoryUsage()
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
                    lastAccess: session.lastAccess,
                    version: session.version
                });
            }
        }
        
        logger.info(`Exported ${data.length} sessions`);
        return data;
    }

    /**
     * Import sessions from backup
     */
    import(data) {
        if (!Array.isArray(data)) {
            throw new Error('Invalid import data: expected array');
        }
        
        let imported = 0;
        let skipped = 0;
        
        for (const item of data) {
            if (this.validateImportItem(item)) {
                this.cache.set(item.userId, {
                    userId: item.userId,
                    data: this.cloneData(item.data),
                    createdAt: item.createdAt || Date.now(),
                    lastAccess: item.lastAccess || Date.now(),
                    version: item.version || 1
                });
                imported++;
            } else {
                skipped++;
            }
        }
        
        logger.info(`Imported ${imported} sessions, skipped ${skipped}`);
        return { imported, skipped };
    }

    /**
     * Validate import item
     */
    validateImportItem(item) {
        return item && 
               typeof item.userId !== 'undefined' && 
               item.data && 
               typeof item.data === 'object';
    }

    /**
     * Get active sessions count
     */
    getActiveCount(timeWindowMs = 60 * 60 * 1000) { // Default: 1 hour
        const cutoff = Date.now() - timeWindowMs;
        let count = 0;
        
        for (const session of this.cache.values()) {
            if (session.lastAccess > cutoff) {
                count++;
            }
        }
        
        return count;
    }

    /**
     * Get memory usage estimate
     */
    getMemoryUsage() {
        let totalSize = 0;
        
        for (const session of this.cache.values()) {
            totalSize += this.estimateSize(session);
        }
        
        return {
            bytes: totalSize,
            kilobytes: (totalSize / 1024).toFixed(2),
            megabytes: (totalSize / 1024 / 1024).toFixed(2)
        };
    }

    /**
     * Estimate size of an object
     */
    estimateSize(obj) {
        // Simple size estimation
        try {
            return JSON.stringify(obj).length * 2; // Rough estimate for Unicode
        } catch (error) {
            return 1024; // Default estimate if stringification fails
        }
    }

    /**
     * Clone data to prevent external mutations
     */
    cloneData(data) {
        try {
            return JSON.parse(JSON.stringify(data));
        } catch (error) {
            logger.warn('Failed to clone session data:', error);
            return data; // Return original if cloning fails
        }
    }

    /**
     * Get sessions by criteria
     */
    findSessions(criteria = {}) {
        const results = [];
        
        for (const [userId, session] of this.cache.entries()) {
            if (this.isExpired(session)) continue;
            
            let matches = true;
            
            if (criteria.olderThan && session.lastAccess > Date.now() - criteria.olderThan) {
                matches = false;
            }
            
            if (criteria.newerThan && session.lastAccess < Date.now() - criteria.newerThan) {
                matches = false;
            }
            
            if (criteria.hasKey && !session.data.hasOwnProperty(criteria.hasKey)) {
                matches = false;
            }
            
            if (criteria.keyValue) {
                for (const [key, value] of Object.entries(criteria.keyValue)) {
                    if (session.data[key] !== value) {
                        matches = false;
                        break;
                    }
                }
            }
            
            if (matches) {
                results.push({
                    userId,
                    data: session.data,
                    metadata: this.getMetadata(userId)
                });
            }
        }
        
        return results;
    }

    /**
     * Cleanup sessions by criteria
     */
    cleanupBy(criteria = {}) {
        const toDelete = [];
        
        for (const [userId, session] of this.cache.entries()) {
            let shouldDelete = false;
            
            if (criteria.olderThan && session.lastAccess < Date.now() - criteria.olderThan) {
                shouldDelete = true;
            }
            
            if (criteria.expired && this.isExpired(session)) {
                shouldDelete = true;
            }
            
            if (criteria.hasKey && session.data.hasOwnProperty(criteria.hasKey)) {
                shouldDelete = true;
            }
            
            if (shouldDelete) {
                toDelete.push(userId);
            }
        }
        
        for (const userId of toDelete) {
            this.cache.delete(userId);
        }
        
        logger.info(`Cleaned up ${toDelete.length} sessions by criteria`);
        return toDelete.length;
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            cleanups: 0
        };
        logger.info('Session cache statistics reset');
    }

    /**
     * Optimize cache performance
     */
    optimize() {
        // Remove expired sessions
        this.cleanup();
        
        // If still too many sessions, remove oldest inactive ones
        while (this.cache.size > this.maxSize * 0.8) {
            this.evictOldest();
        }
        
        logger.info('Session cache optimized');
    }
}

module.exports = SessionCache;
