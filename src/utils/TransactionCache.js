class TransactionCache {
    constructor() {
        this.transactionCache = new Map();
        this.announcementCache = new Map();
        this.maxSize = 100; // Maximum entries to prevent memory leaks
    }

    // Transaction ID caching methods
    set(shortId, fullId) {
        this.transactionCache.set(shortId, fullId);
        this.cleanupCache(this.transactionCache);
    }

    get(shortId) {
        return this.transactionCache.get(shortId);
    }

    // Announcement ID caching methods
    setAnnouncement(shortId, fullId) {
        this.announcementCache.set(shortId, fullId);
        this.cleanupCache(this.announcementCache);
    }

    getAnnouncement(shortId) {
        return this.announcementCache.get(shortId);
    }

    // Helper method to find transaction by short ID
    async findTransactionByShortId(shortId, userId, transactionService) {
        // Check cache first
        let transactionId = this.get(shortId);
        
        if (transactionId) {
            const transaction = await transactionService.getTransaction(transactionId);
            if (transaction && this.userCanAccessTransaction(transaction, userId)) {
                return transaction;
            }
        }
        
        // If not in cache or not accessible, search in database
        const allTransactions = await transactionService.getUserTransactions(userId, 'all');
        const transaction = allTransactions.find(t => t.transactionId.endsWith(shortId));
        
        if (transaction) {
            this.set(shortId, transaction.transactionId);
            return transaction;
        }
        
        return null;
    }

    // Helper method to find announcement by short ID
    async findAnnouncementByShortId(shortId, userId, announcementService) {
        let announcementId = this.getAnnouncement(shortId);
        
        if (announcementId) {
            const announcement = await announcementService.getAnnouncement(announcementId);
            if (announcement && announcement.userId === userId) {
                return announcement;
            }
        }
        
        const announcements = await announcementService.getUserAnnouncements(userId);
        const announcement = announcements.find(a => a.announcementId.endsWith(shortId));
        
        if (announcement) {
            this.setAnnouncement(shortId, announcement.announcementId);
            return announcement;
        }
        
        return null;
    }

    // Helper method to check if user can access transaction
    userCanAccessTransaction(transaction, userId) {
        return transaction.sellerId === userId || transaction.buyerId === userId;
    }

    // Cleanup method to prevent memory leaks
    cleanupCache(cache) {
        if (cache.size > this.maxSize) {
            // Remove oldest entries (FIFO)
            const entriesToRemove = cache.size - this.maxSize;
            const keys = Array.from(cache.keys());
            
            for (let i = 0; i < entriesToRemove; i++) {
                cache.delete(keys[i]);
            }
        }
    }

    // Clear all caches
    clearAll() {
        this.transactionCache.clear();
        this.announcementCache.clear();
    }

    // Get cache statistics
    getStats() {
        return {
            transactionCache: {
                size: this.transactionCache.size,
                maxSize: this.maxSize
            },
            announcementCache: {
                size: this.announcementCache.size,
                maxSize: this.maxSize
            }
        };
    }

    // Method to preload frequently accessed items
    async preloadUserData(userId, transactionService, announcementService) {
        try {
            // Preload user's recent transactions
            const transactions = await transactionService.getUserTransactions(userId, 'all');
            transactions.slice(0, 10).forEach(tx => {
                const shortId = tx.transactionId.slice(-10);
                this.set(shortId, tx.transactionId);
            });

            // Preload user's announcements
            const announcements = await announcementService.getUserAnnouncements(userId);
            announcements.forEach(ann => {
                const shortId = ann.announcementId.slice(-10);
                this.setAnnouncement(shortId, ann.announcementId);
            });

        } catch (error) {
            console.error('Error preloading user data:', error);
        }
    }

    // Method to generate short ID consistently
    static generateShortId(fullId, length = 10) {
        if (!fullId || fullId.length <= length) {
            return fullId;
        }
        return fullId.slice(-length);
    }

    // Method to validate short ID format
    static isValidShortId(shortId) {
        return typeof shortId === 'string' && 
               shortId.length >= 6 && 
               shortId.length <= 15 &&
               /^[A-Za-z0-9_-]+$/.test(shortId);
    }
}

module.exports = { TransactionCache };
