const { MongoClient } = require('mongodb');

class Database {
    constructor(uri) {
        this.uri = uri;
        this.client = null;
        this.db = null;
    }

    async connect() {
        try {
            this.client = new MongoClient(this.uri, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            
            await this.client.connect();
            this.db = this.client.db('kwh_bot');
            
            // Create collections and indexes
            await this.createCollections();
            await this.createIndexes();
            
            console.log('✅ Database MongoDB connesso con successo');
            return this.db;
            
        } catch (error) {
            console.error('❌ Errore connessione database:', error);
            throw error;
        }
    }

    async createCollections() {
        const collections = [
            'users',
            'announcements', 
            'transactions',
            'feedback',
            'archived_messages',
            'admin_actions'
        ];
        
        for (const collectionName of collections) {
            const exists = await this.db.listCollections({ name: collectionName }).hasNext();
            if (!exists) {
                await this.db.createCollection(collectionName);
                console.log(`📝 Collezione '${collectionName}' creata`);
            }
        }
    }

    async createIndexes() {
        try {
            // Users indexes
            await this.db.collection('users').createIndex({ userId: 1 }, { unique: true });
            await this.db.collection('users').createIndex({ username: 1 });
            
            // Announcements indexes  
            await this.db.collection('announcements').createIndex({ userId: 1 });
            await this.db.collection('announcements').createIndex({ announcementId: 1 }, { unique: true });
            await this.db.collection('announcements').createIndex({ active: 1 });
            await this.db.collection('announcements').createIndex({ createdAt: -1 });
            
            // Transactions indexes
            await this.db.collection('transactions').createIndex({ transactionId: 1 }, { unique: true });
            await this.db.collection('transactions').createIndex({ sellerId: 1 });
            await this.db.collection('transactions').createIndex({ buyerId: 1 });
            await this.db.collection('transactions').createIndex({ announcementId: 1 });
            await this.db.collection('transactions').createIndex({ status: 1 });
            await this.db.collection('transactions').createIndex({ createdAt: -1 });
            
            // Feedback indexes
            await this.db.collection('feedback').createIndex({ userId: 1 });
            await this.db.collection('feedback').createIndex({ transactionId: 1 });
            await this.db.collection('feedback').createIndex({ rating: 1 });
            
            console.log('🔍 Indici database creati con successo');
            
        } catch (error) {
            console.error('❌ Errore creazione indici:', error);
        }
    }

    getCollection(name) {
        if (!this.db) {
            throw new Error('Database non connesso');
        }
        return this.db.collection(name);
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            console.log('📴 Database disconnesso');
        }
    }

    // Health check
    async isConnected() {
        try {
            await this.db.admin().ping();
            return true;
        } catch (error) {
            return false;
        }
    }
}

module.exports = Database;
