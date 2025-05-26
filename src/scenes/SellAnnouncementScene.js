class AnnouncementService {
    constructor(db) {
        this.db = db;
        this.collection = db.getCollection('announcements');
    }

    async createAnnouncement(data) {
        try {
            const announcement = {
                announcementId: `A${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                userId: data.userId,
                location: data.location,
                price: data.price,
                currentType: data.currentType,
                zones: data.zones,
                networks: data.networks,
                paymentMethods: data.paymentMethods,
                active: true,
                messageId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                
                // Nuovi campi per sistema prezzi
                description: data.description || '',
                availability: data.availability || 'Sempre disponibile',
                contactInfo: data.contactInfo || '',
                pricingType: data.pricingType || 'fixed',
                basePrice: data.basePrice || data.price,
                pricingTiers: data.pricingTiers || null,
                minimumKwh: data.minimumKwh || null
            };

            const result = await this.collection.insertOne(announcement);
            return announcement;
        } catch (error) {
            console.error('Error creating announcement:', error);
            throw error;
        }
    }

    async getAnnouncement(announcementId) {
        try {
            return await this.collection.findOne({ 
                announcementId: announcementId 
            });
        } catch (error) {
            console.error('Error getting announcement:', error);
            throw error;
        }
    }

    async getActiveAnnouncements(limit = 20) {
        try {
            return await this.collection
                .find({ active: true })
                .sort({ createdAt: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('Error getting active announcements:', error);
            throw error;
        }
    }

    async getUserAnnouncements(userId) {
        try {
            return await this.collection
                .find({ 
                    userId: userId,
                    active: true 
                })
                .sort({ createdAt: -1 })
                .toArray();
        } catch (error) {
            console.error('Error getting user announcements:', error);
            throw error;
        }
    }

    async deleteAnnouncement(announcementId, userId) {
        try {
            const result = await this.collection.updateOne(
                { 
                    announcementId: announcementId, 
                    userId: userId 
                },
                { 
                    $set: { 
                        active: false,
                        updatedAt: new Date()
                    } 
                }
            );
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error deleting announcement:', error);
            throw error;
        }
    }

    async updateAnnouncement(announcementId, updateData) {
        try {
            const result = await this.collection.updateOne(
                { announcementId: announcementId },
                { 
                    $set: {
                        ...updateData,
                        updatedAt: new Date()
                    }
                }
            );
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error updating announcement:', error);
            throw error;
        }
    }

    async getAnnouncementStats() {
        try {
            const stats = await this.collection.aggregate([
                { $match: { active: true } },
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
            console.error('Error getting announcement stats:', error);
            throw error;
        }
    }

    // Metodo per formattare annuncio con posizione copiabile (per chat privata)
    async formatAnnouncementMessage(announcement, userStats) {
        let message = `🔋 **OFFERTA ENERGIA**\n\n`;
        
        if (announcement.userId) {
            const username = announcement.userId.username || announcement.userId.firstName || 'Utente';
            message += `👤 **Venditore:** @${username}\n`;
        }
        
        // Badge venditore
        if (userStats && userStats.totalFeedback >= 5) {
            if (userStats.positivePercentage >= 95) {
                message += `🌟 **VENDITORE TOP** (${userStats.positivePercentage}% positivi)\n`;
            } else if (userStats.positivePercentage >= 90) {
                message += `✅ **VENDITORE AFFIDABILE** (${userStats.positivePercentage}% positivi)\n`;
            }
        }
        
        // Posizione copiabile
        message += `\n📍 **Posizione:** \`${announcement.location}\`\n`;
        
        if (announcement.description) {
            message += `📝 **Descrizione:** ${announcement.description}\n`;
        }
        
        if (announcement.availability) {
            message += `⏰ **Disponibilità:** ${announcement.availability}\n`;
        }
        
        // Pricing
        message += `\n${this.formatPricing(announcement)}\n`;
        
        if (announcement.currentType) {
            message += `\n⚡ **Tipo corrente:** ${announcement.currentType}\n`;
        }
        
        if (announcement.zones) {
            message += `📍 **Zone:** ${announcement.zones}\n`;
        }
        
        if (announcement.networks) {
            message += `🌐 **Reti:** ${announcement.networks}\n`;
        }
        
        if (announcement.paymentMethods) {
            message += `💳 **Pagamenti:** ${announcement.paymentMethods}\n`;
        }
        
        if (announcement.contactInfo) {
            message += `📞 **Contatti:** ${announcement.contactInfo}\n`;
        }
        
        // ID copiabile
        message += `\n🆔 **ID:** \`${announcement.announcementId}\``;
        
        return message;
    }

    // METODO CHIAVE: Formatta annuncio per pubblicazione nel gruppo con posizione copiabile
    formatAnnouncementForGroup(announcement, userStats) {
        let message = `🔋 **Vendita kWh sharing**\n\n`;
        
        // Venditore con eventuale badge
        let sellerInfo = `👤 Venditore: @${announcement.userId?.username || announcement.contactInfo || 'utente'}`;
        
        if (userStats && userStats.totalFeedback >= 5) {
            if (userStats.positivePercentage >= 95) {
                sellerInfo += ` 🌟 TOP`;
            } else if (userStats.positivePercentage >= 90) {
                sellerInfo += ` ✅ AFFIDABILE`;
            }
        }
        
        message += sellerInfo + '\n';
        
        // IMPORTANTE: Posizione copiabile con backtick
        message += `📍 Posizione: \`${announcement.location}\`\n`;
        
        // Pricing compatto
        if (announcement.pricingType === 'fixed') {
            message += `💰 Prezzo: ${announcement.basePrice || announcement.price}€/KWH`;
            if (announcement.minimumKwh) {
                message += ` (min ${announcement.minimumKwh} KWH)`;
            }
        } else if (announcement.pricingType === 'graduated' && announcement.pricingTiers) {
            message += `💰 Prezzi: `;
            const tiers = announcement.pricingTiers;
            if (tiers.length > 0) {
                message += `da ${tiers[0].price}€/KWH`;
                if (tiers.length > 1) {
                    const lastTier = tiers[tiers.length - 1];
                    message += ` a ${lastTier.price}€/KWH`;
                }
            }
        } else {
            message += `💰 Prezzo: ${announcement.price || announcement.basePrice}€/KWH`;
        }
        
        message += '\n';
        
        // Tipo corrente
        if (announcement.currentType) {
            message += `⚡ Corrente: ${announcement.currentType}\n`;
        }
        
        // Zone (compatte)
        if (announcement.zones) {
            message += `📍 Zone: ${announcement.zones}\n`;
        }
        
        // Reti
        if (announcement.networks) {
            message += `🌐 Reti: ${announcement.networks}\n`;
        }
        
        // AGGIUNGIAMO LA DESCRIZIONE SE PRESENTE
        if (announcement.description && announcement.description.trim() !== '') {
            message += `📝 Descrizione: ${announcement.description}\n`;
        }
        
        // Disponibilità (solo se diversa da sempre)
        if (announcement.availability && announcement.availability !== 'Sempre disponibile') {
            message += `⏰ Disponibilità: ${announcement.availability}\n`;
        }
        
        // Pagamenti
        if (announcement.paymentMethods) {
            message += `💳 Pagamenti: ${announcement.paymentMethods}\n`;
        }
        
        // ID copiabile
        message += `\n🆔 ID: \`${announcement.announcementId}\``;
        
        return message;
    }

    formatPricing(announcement) {
        if (announcement.pricingType === 'fixed') {
            let text = `💰 **Prezzo:** ${announcement.basePrice || announcement.price}€/KWH`;
            if (announcement.minimumKwh) {
                text += `\n🎯 **Minimo garantito:** ${announcement.minimumKwh} KWH`;
            }
            return text;
        }
        
        if (announcement.pricingType === 'graduated' && announcement.pricingTiers) {
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
        
        return `💰 **Prezzo:** ${announcement.price || announcement.basePrice || 'Non specificato'}€/KWH`;
    }
}

module.exports = AnnouncementService;
