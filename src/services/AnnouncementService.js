class AnnouncementService {
    constructor(db) {
        this.db = db;
        this.collection = db.getCollection('announcements');
    }

    async createAnnouncement(data) {
        try {
            // Validazione dati
            if (!data.userId || !data.location || !data.description) {
                throw new Error('Dati obbligatori mancanti');
            }

            // Validazione pricing
            const errors = this.validatePricingData(data);
            if (errors.length > 0) {
                throw new Error(errors.join(', '));
            }

            const announcement = {
                announcementId: `A${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                userId: data.userId,
                location: data.location,
                description: data.description,
                availability: data.availability || 'Sempre disponibile',
                contactInfo: data.contactInfo,
                
                // Sistema prezzi
                pricingType: data.pricingType,
                basePrice: data.pricingType === 'fixed' ? data.basePrice : undefined,
                pricingTiers: data.pricingType === 'graduated' ? data.pricingTiers : undefined,
                minimumKwh: data.minimumKwh || null,
                
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await this.collection.insertOne(announcement);
            announcement._id = result.insertedId;
            
            console.log(`Annuncio creato: ${announcement.announcementId}`);
            return announcement;

        } catch (error) {
            console.error('Errore nella creazione dell\'annuncio:', error);
            throw error;
        }
    }

    async getActiveAnnouncements(limit = 10) {
        try {
            const announcements = await this.collection
                .find({ isActive: true })
                .sort({ createdAt: -1 })
                .limit(limit)
                .toArray();

            // Popola user info
            const userIds = [...new Set(announcements.map(a => a.userId))];
            const users = await this.db.getCollection('users')
                .find({ userId: { $in: userIds } })
                .toArray();
            
            const userMap = users.reduce((map, user) => {
                map[user.userId] = user;
                return map;
            }, {});

            announcements.forEach(ann => {
                ann.userId = userMap[ann.userId] || { userId: ann.userId };
            });

            return announcements;
        } catch (error) {
            console.error('Errore nel recupero degli annunci:', error);
            throw error;
        }
    }

    async getAnnouncement(announcementId) {
        try {
            const announcement = await this.collection.findOne({ 
                announcementId: announcementId 
            });
            
            if (announcement) {
                // Popola user info
                const user = await this.db.getCollection('users').findOne({ 
                    userId: announcement.userId 
                });
                announcement.userId = user || { userId: announcement.userId };
            }
            
            return announcement;
        } catch (error) {
            console.error('Errore nel recupero dell\'annuncio:', error);
            throw error;
        }
    }

    async getUserAnnouncements(userId) {
        try {
            return await this.collection
                .find({ userId: userId })
                .sort({ createdAt: -1 })
                .toArray();
        } catch (error) {
            console.error('Errore nel recupero annunci utente:', error);
            throw error;
        }
    }

    async deleteAnnouncement(announcementId, userId) {
        try {
            const result = await this.collection.updateOne(
                { announcementId: announcementId, userId: userId },
                { 
                    $set: { 
                        isActive: false, 
                        updatedAt: new Date() 
                    } 
                }
            );

            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Errore nell\'eliminazione dell\'annuncio:', error);
            throw error;
        }
    }

    async getAnnouncementStats() {
        try {
            const stats = await this.collection.aggregate([
                { $match: { isActive: true } },
                {
                    $group: {
                        _id: null,
                        totalActive: { $sum: 1 },
                        avgPrice: { 
                            $avg: {
                                $cond: [
                                    { $eq: ['$pricingType', 'fixed'] },
                                    '$basePrice',
                                    { $arrayElemAt: ['$pricingTiers.price', 0] }
                                ]
                            }
                        },
                        minPrice: { 
                            $min: {
                                $cond: [
                                    { $eq: ['$pricingType', 'fixed'] },
                                    '$basePrice',
                                    { $arrayElemAt: ['$pricingTiers.price', 0] }
                                ]
                            }
                        },
                        maxPrice: { 
                            $max: {
                                $cond: [
                                    { $eq: ['$pricingType', 'fixed'] },
                                    '$basePrice',
                                    { $arrayElemAt: ['$pricingTiers.price', -1] }
                                ]
                            }
                        }
                    }
                }
            ]).toArray();

            return stats[0] || {
                totalActive: 0,
                avgPrice: 0,
                minPrice: 0,
                maxPrice: 0
            };
        } catch (error) {
            console.error('Errore nel calcolo delle statistiche:', error);
            throw error;
        }
    }

    validatePricingData(data) {
        const errors = [];
        
        if (!data.pricingType || !['fixed', 'graduated'].includes(data.pricingType)) {
            errors.push('Tipo di prezzo non valido');
        }
        
        if (data.pricingType === 'fixed') {
            if (!data.basePrice || data.basePrice <= 0) {
                errors.push('Prezzo fisso deve essere maggiore di 0');
            }
        }
        
        if (data.pricingType === 'graduated') {
            if (!data.pricingTiers || !Array.isArray(data.pricingTiers) || data.pricingTiers.length === 0) {
                errors.push('Almeno una fascia di prezzo è richiesta');
            } else {
                // Validazione fasce
                for (let i = 0; i < data.pricingTiers.length; i++) {
                    const tier = data.pricingTiers[i];
                    
                    if (!tier.price || tier.price <= 0) {
                        errors.push(`Prezzo fascia ${i + 1} deve essere maggiore di 0`);
                    }
                    
                    if (i < data.pricingTiers.length - 1) {
                        if (!tier.limit || tier.limit <= 0) {
                            errors.push(`Limite fascia ${i + 1} deve essere maggiore di 0`);
                        }
                        
                        if (i > 0 && tier.limit <= data.pricingTiers[i-1].limit) {
                            errors.push(`Limite fascia ${i + 1} deve essere maggiore del precedente`);
                        }
                    }
                    
                    if (i === data.pricingTiers.length - 1 && tier.limit !== null) {
                        errors.push('L\'ultima fascia deve avere limite null');
                    }
                }
            }
        }
        
        if (data.minimumKwh && (isNaN(data.minimumKwh) || data.minimumKwh <= 0)) {
            errors.push('KWH minimi devono essere maggiori di 0');
        }
        
        return errors;
    }

    // Metodo helper per formattare annunci
    async formatAnnouncementMessage(announcement, userStats) {
        let message = `🔋 **OFFERTA ENERGIA**\n\n`;
        
        const user = announcement.userId;
        const username = user.username || user.firstName || 'Utente';
        message += `👤 **Venditore:** @${username}\n`;
        
        // Badge venditore
        if (userStats && userStats.totalFeedback >= 5) {
            if (userStats.positivePercentage >= 95) {
                message += `🌟 **VENDITORE TOP** (${userStats.positivePercentage}% positivi)\n`;
            } else if (userStats.positivePercentage >= 90) {
                message += `✅ **VENDITORE AFFIDABILE** (${userStats.positivePercentage}% positivi)\n`;
            }
        }
        
        message += `\n📍 **Posizione:** ${announcement.location}\n`;
        message += `📝 **Descrizione:** ${announcement.description}\n`;
        message += `⏰ **Disponibilità:** ${announcement.availability}\n`;
        
        // Pricing
        message += `\n${this.formatPricing(announcement)}\n`;
        
        if (announcement.contactInfo) {
            message += `📞 **Contatti:** ${announcement.contactInfo}\n`;
        }
        
        return message;
    }

    formatPricing(announcement) {
        if (announcement.pricingType === 'fixed') {
            let text = `💰 **Prezzo:** ${announcement.basePrice}€/KWH`;
            if (announcement.minimumKwh) {
                text += `\n🎯 **Minimo garantito:** ${announcement.minimumKwh} KWH`;
            }
            return text;
        }
        
        if (announcement.pricingType === 'graduated') {
            let text = `📊 **Prezzi graduati:**\n`;
            
            for (let i = 0; i < announcement.pricingTiers.length; i++) {
                const tier = announcement.pricingTiers[i];
                const prevLimit = i > 0 ? announcement.pricingTiers[i-1].limit : 0;
                
                if (tier.limit === null) {
                    text += `• Oltre ${prevLimit} KWH: TUTTO a ${tier.price}€/KWH\n`;
                } else {
                    text += `• ${prevLimit + 1}-${tier.limit} KWH: TUTTO a ${tier.price}€/KWH\n`;
                }
            }
            
            if (announcement.minimumKwh) {
                text += `🎯 **Minimo garantito:** ${announcement.minimumKwh} KWH`;
            }
            
            return text.trim();
        }
        
        return 'Prezzo non configurato';
    }
}

module.exports = AnnouncementService;
