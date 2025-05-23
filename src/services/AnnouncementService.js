const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

class AnnouncementService {
    constructor(database) {
        this.db = database;
        this.announcements = database.getCollection('announcements');
        this.archivedMessages = database.getCollection('archived_messages');
    }

    async createAnnouncement(userId, announcementData) {
        try {
            // Genera ID univoco per l'annuncio - USA TRATTINO INVECE DI UNDERSCORE
            const timestamp = moment().format('YYYYMMDDHHmmss');
            const announcementId = `A${userId}-${timestamp}`;
            
            const announcement = {
                announcementId,
                userId,
                type: 'sell', // Per ora solo vendita
                price: announcementData.price,
                currentType: announcementData.currentType,
                zones: announcementData.zones,
                networks: announcementData.networks,
                networksList: announcementData.networksList || [],
                availability: announcementData.availability,
                paymentMethods: announcementData.paymentMethods,
                conditions: announcementData.conditions || '',
                active: true,
                messageId: null, // Sarà aggiornato dopo la pubblicazione
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await this.announcements.insertOne(announcement);
            return { ...announcement, _id: result.insertedId };
            
        } catch (error) {
            console.error('Errore creazione annuncio:', error);
            throw error;
        }
    }

    async getAnnouncement(announcementId) {
        try {
            return await this.announcements.findOne({ 
                announcementId,
                active: true 
            });
        } catch (error) {
            console.error('Errore get annuncio:', error);
            return null;
        }
    }

    async getUserAnnouncements(userId) {
        try {
            return await this.announcements
                .find({ userId, active: true })
                .sort({ createdAt: -1 })
                .toArray();
        } catch (error) {
            console.error('Errore get annunci utente:', error);
            return [];
        }
    }

    async updateAnnouncementMessageId(announcementId, messageId) {
        try {
            await this.announcements.updateOne(
                { announcementId },
                { 
                    $set: { 
                        messageId,
                        updatedAt: new Date()
                    }
                }
            );
        } catch (error) {
            console.error('Errore update message ID:', error);
        }
    }

    async archiveUserPreviousAnnouncement(userId) {
        try {
            // Trova l'annuncio attivo precedente dell'utente
            const previousAnnouncement = await this.announcements.findOne({
                userId,
                active: true
            });

            if (previousAnnouncement && previousAnnouncement.messageId) {
                // Archivia il messaggio precedente
                await this.archivedMessages.insertOne({
                    ...previousAnnouncement,
                    archivedAt: new Date(),
                    reason: 'new_announcement'
                });

                // Disattiva l'annuncio precedente
                await this.announcements.updateOne(
                    { _id: previousAnnouncement._id },
                    { 
                        $set: { 
                            active: false,
                            archivedAt: new Date()
                        }
                    }
                );

                return previousAnnouncement.messageId;
            }

            return null;
        } catch (error) {
            console.error('Errore archiviazione annuncio precedente:', error);
            return null;
        }
    }

    async formatAnnouncementMessage(announcement, userStats) {
        try {
            const currentTypeText = this.formatCurrentType(announcement.currentType);
            const networksText = this.formatNetworks(announcement.networksList || announcement.networks);
            const sellerBadge = this.formatSellerBadge(userStats);
            
            let message = `🔋 Vendita kWh sharing\n`;
            message += `📱 ID annuncio: ${announcement.announcementId}\n`;
            message += `👤 Venditore: @${announcement.username || 'utente'}\n`;
            
            if (sellerBadge) {
                message += `⭐ ${sellerBadge}\n`;
            }
            
            message += `\n💰 Prezzo: ${announcement.price}€ AL KWH\n`;
            message += `⚡ Corrente: ${currentTypeText}\n`;
            message += `🌍 Reti attivabili: ${networksText}\n`;
            message += `⏰ Disponibilità: ${announcement.availability}\n`;
            message += `💳 Pagamento: ${announcement.paymentMethods}\n`;
            
            if (announcement.conditions) {
                message += `📋 Condizioni: ${announcement.conditions}\n`;
            }
            
            message += `\n📞 Dopo la compravendita, il venditore inviterà l'acquirente a esprimere un giudizio sulla transazione.`;
            
            return message;
        } catch (error) {
            console.error('Errore formattazione messaggio:', error);
            return 'Errore nella formattazione dell\'annuncio';
        }
    }

    formatCurrentType(currentType) {
        const types = {
            'dc_only': 'SOLO DC',
            'ac_only': 'SOLO AC',
            'both': 'DC E AC',
            'dc_min_30': 'SOLO DC E MINIMO 30 KW'
        };
        return types[currentType] || currentType;
    }

    formatNetworks(networks) {
        if (networks === 'all') {
            return 'TUTTE LE COLONNINE';
        }
        if (Array.isArray(networks)) {
            return networks.length > 5 ? 'TUTTE LE COLONNINE' : networks.join(', ');
        }
        return networks || 'TUTTE LE COLONNINE';
    }

    formatSellerBadge(userStats) {
        if (!userStats || userStats.totalFeedback < 5) {
            return null;
        }

        const percentage = userStats.positivePercentage;
        
        if (percentage >= 95) {
            return `🌟🟢 VENDITORE TOP (${percentage.toFixed(1)}% positivi)`;
        } else if (percentage >= 90) {
            return `✅🟢 VENDITORE AFFIDABILE (${percentage.toFixed(1)}% positivi)`;
        }
        
        return null;
    }

    async deleteAnnouncement(announcementId, userId) {
        try {
            const result = await this.announcements.updateOne(
                { announcementId, userId },
                { 
                    $set: { 
                        active: false,
                        deletedAt: new Date()
                    }
                }
            );
            
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Errore eliminazione annuncio:', error);
            return false;
        }
    }

    async getActiveAnnouncements(limit = 50) {
        try {
            return await this.announcements
                .find({ active: true })
                .sort({ createdAt: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('Errore get annunci attivi:', error);
            return [];
        }
    }

    async updateAnnouncementData(announcementId, updateData) {
        try {
            const result = await this.announcements.updateOne(
                { announcementId, active: true },
                { 
                    $set: {
                        ...updateData,
                        updatedAt: new Date()
                    }
                }
            );
            
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Errore update annuncio:', error);
            return false;
        }
    }

    async getAnnouncementStats() {
        try {
            const pipeline = [
                { $match: { active: true } },
                {
                    $group: {
                        _id: null,
                        totalActive: { $sum: 1 },
                        avgPrice: { $avg: '$price' },
                        minPrice: { $min: '$price' },
                        maxPrice: { $max: '$price' }
                    }
                }
            ];

            const result = await this.announcements.aggregate(pipeline).toArray();
            return result[0] || {
                totalActive: 0,
                avgPrice: 0,
                minPrice: 0,
                maxPrice: 0
            };
        } catch (error) {
            console.error('Errore get stats annunci:', error);
            return null;
        }
    }
}

module.exports = AnnouncementService;
