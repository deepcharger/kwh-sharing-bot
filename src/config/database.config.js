// src/config/database.config.js
const settings = require('./settings');

module.exports = {
    uri: settings.DATABASE.URI,
    options: {
        ...settings.DATABASE.OPTIONS,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    },
    
    collections: {
        users: {
            name: 'users',
            indexes: [
                { key: { userId: 1 }, unique: true },
                { key: { username: 1 } },
                { key: { lastActivity: -1 } }
            ]
        },
        announcements: {
            name: 'announcements',
            indexes: [
                { key: { announcementId: 1 }, unique: true },
                { key: { userId: 1 } },
                { key: { active: 1 } },
                { key: { createdAt: -1 } },
                { key: { expiresAt: 1 } }
            ]
        },
        transactions: {
            name: 'transactions',
            indexes: [
                { key: { transactionId: 1 }, unique: true },
                { key: { sellerId: 1 } },
                { key: { buyerId: 1 } },
                { key: { announcementId: 1 } },
                { key: { status: 1 } },
                { key: { createdAt: -1 } }
            ]
        },
        feedback: {
            name: 'feedback',
            indexes: [
                { key: { transactionId: 1 } },
                { key: { fromUserId: 1 } },
                { key: { toUserId: 1 } },
                { key: { rating: 1 } },
                { key: { createdAt: -1 } }
            ]
        },
        archived_messages: {
            name: 'archived_messages',
            indexes: [
                { key: { userId: 1 } },
                { key: { archivedAt: -1 } }
            ]
        }
    }
};
