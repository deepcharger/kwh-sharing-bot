const mongoose = require('mongoose');
const AnnouncementModel = require('../models/AnnouncementModel');
const User = require('../models/UserModel');
const logger = require('../utils/logger');

class AnnouncementService {
    static async createAnnouncement(data) {
        try {
            // Validazione dati obbligatori
            if (!data.userId || !data.location || !data.description) {
                throw new Error('Dati obbligatori mancanti');
            }

            // Validazione pricing
            if (!data.pricingType || !['fixed', 'graduated'].includes(data.pricingType)) {
                throw new Error('Tipo di prezzo non valido');
            }

            if (data.pricingType === 'fixed' && (!data.basePrice || data.basePrice <= 0)) {
                throw new Error('Prezzo fisso non valido');
            }

            if (data.pricingType === 'graduated') {
                if (!data.pricingTiers || !Array.isArray(data.pricingTiers) || data.pricingTiers.length === 0) {
                    throw new Error('Fasce di prezzo non valide');
                }

                // Validazione fasce
                for (let i = 0; i < data.pricingTiers.length; i++) {
                    const tier = data.pricingTiers[i];
                    if (!tier.price || tier.price <= 0) {
                        throw new Error(`Prezzo fascia ${i + 1} non valido`);
                    }
                    if (i < data.pricingTiers.length - 1 && (!tier.limit || tier.limit <= 0)) {
                        throw new Error(`Limite fascia ${i + 1} non valido`);
                    }
                    if (i === data.pricingTiers.length - 1 && tier.limit !== null) {
                        throw new Error('L\'ultima fascia deve avere limite null');
                    }
                }

                // Ordinamento fasce per limite crescente
                data.pricingTiers.sort((a, b) => {
                    if (a.limit === null) return 1;
                    if (b.limit === null) return -1;
                    return a.limit - b.limit;
                });
            }

            // Validazione KWH minimi
            if (data.minimumKwh && (isNaN(data.minimumKwh) || data.minimumKwh <= 0)) {
                throw new Error('KWH minimi non validi');
            }

            const announcement = new AnnouncementModel({
                userId: data.userId,
                location: data.location,
                description: data.description,
                availability: data.availability || 'Sempre disponibile',
                contactInfo: data.contactInfo,
                
                // Nuovo sistema prezzi
                pricingType: data.pricingType,
                basePrice: data.pricingType === 'fixed' ? data.basePrice : undefined,
                pricingTiers: data.pricingType === 'graduated' ? data.pricingTiers : undefined,
                minimumKwh: data.minimumKwh || null,
                
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            await announcement.save();
            logger.info(`Annuncio creato con ID: ${announcement._id}`);
            return announcement;
        } catch (error) {
            logger.error('Errore nella creazione dell\'annuncio:', error);
            throw error;
        }
    }

    static async getActiveAnnouncements(limit = 10, skip = 0) {
        try {
            const announcements = await AnnouncementModel
                .find({ isActive: true })
                .populate('userId', 'username firstName lastName')
                .sort({ createdAt: -1 })
                .limit(limit)
                .skip(skip);

            return announcements;
        } catch (error) {
            logger.error('Errore nel recupero degli annunci:', error);
            throw error;
        }
    }

    static async getAnnouncementById(id) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw new Error('ID annuncio non valido');
            }

            const announcement = await AnnouncementModel
                .findById(id)
                .populate('userId', 'username firstName lastName');

            return announcement;
        } catch (error) {
            logger.error('Errore nel recupero dell\'annuncio:', error);
            throw error;
        }
    }

    static async getUserAnnouncements(userId) {
        try {
            const announcements = await AnnouncementModel
                .find({ userId })
                .sort({ createdAt: -1 });

            return announcements;
        } catch (error) {
            logger.error('Errore nel recupero degli annunci utente:', error);
            throw error;
        }
    }

    static async updateAnnouncement(id, data) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw new Error('ID annuncio non valido');
            }

            // Validazione pricing se modificato
            if (data.pricingType) {
                if (!['fixed', 'graduated'].includes(data.pricingType)) {
                    throw new Error('Tipo di prezzo non valido');
                }

                if (data.pricingType === 'fixed' && (!data.basePrice || data.basePrice <= 0)) {
                    throw new Error('Prezzo fisso non valido');
                }

                if (data.pricingType === 'graduated') {
                    if (!data.pricingTiers || !Array.isArray(data.pricingTiers) || data.pricingTiers.length === 0) {
                        throw new Error('Fasce di prezzo non valide');
                    }
                }
            }

            const announcement = await AnnouncementModel.findByIdAndUpdate(
                id,
                { ...data, updatedAt: new Date() },
                { new: true }
            );

            if (!announcement) {
                throw new Error('Annuncio non trovato');
            }

            logger.info(`Annuncio aggiornato: ${id}`);
            return announcement;
        } catch (error) {
            logger.error('Errore nell\'aggiornamento dell\'annuncio:', error);
            throw error;
        }
    }

    static async deleteAnnouncement(id, userId) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw new Error('ID annuncio non valido');
            }

            const announcement = await AnnouncementModel.findOneAndUpdate(
                { _id: id, userId },
                { isActive: false, updatedAt: new Date() },
                { new: true }
            );

            if (!announcement) {
                throw new Error('Annuncio non trovato o non autorizzato');
            }

            logger.info(`Annuncio eliminato: ${id}`);
            return announcement;
        } catch (error) {
            logger.error('Errore nell\'eliminazione dell\'annuncio:', error);
            throw error;
        }
    }

    static async searchAnnouncements(filters) {
        try {
            const query = { isActive: true };

            if (filters.location) {
                query.location = { $regex: filters.location, $options: 'i' };
            }

            if (filters.maxPrice) {
                // Per la ricerca, consideriamo il prezzo base o il primo tier
                query.$or = [
                    { pricingType: 'fixed', basePrice: { $lte: filters.maxPrice } },
                    { 
                        pricingType: 'graduated', 
                        'pricingTiers.0.price': { $lte: filters.maxPrice } 
                    }
                ];
            }

            const announcements = await AnnouncementModel
                .find(query)
                .populate('userId', 'username firstName lastName')
                .sort({ createdAt: -1 });

            return announcements;
        } catch (error) {
            logger.error('Errore nella ricerca degli annunci:', error);
            throw error;
        }
    }

    // Nuova funzione per calcolare il prezzo basato sui KWH
    static calculatePrice(announcement, kwhAmount) {
        try {
            if (!announcement || !kwhAmount || kwhAmount <= 0) {
                throw new Error('Parametri non validi per il calcolo del prezzo');
            }

            // Applica minimo se presente
            const finalKwh = Math.max(kwhAmount, announcement.minimumKwh || 0);

            if (announcement.pricingType === 'fixed') {
                return {
                    totalAmount: finalKwh * announcement.basePrice,
                    kwhUsed: finalKwh,
                    pricePerKwh: announcement.basePrice,
                    appliedMinimum: finalKwh > kwhAmount
                };
            }

            if (announcement.pricingType === 'graduated') {
                // Trova la fascia appropriata
                let applicableTier = announcement.pricingTiers[announcement.pricingTiers.length - 1]; // Default ultima fascia
                
                for (let tier of announcement.pricingTiers) {
                    if (tier.limit === null || finalKwh <= tier.limit) {
                        applicableTier = tier;
                        break;
                    }
                }

                return {
                    totalAmount: finalKwh * applicableTier.price,
                    kwhUsed: finalKwh,
                    pricePerKwh: applicableTier.price,
                    appliedTier: applicableTier,
                    appliedMinimum: finalKwh > kwhAmount
                };
            }

            throw new Error('Tipo di prezzo non supportato');
        } catch (error) {
            logger.error('Errore nel calcolo del prezzo:', error);
            throw error;
        }
    }

    // Funzione per ottenere statistiche annunci
    static async getAnnouncementStats(userId) {
        try {
            const stats = await AnnouncementModel.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId) } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        active: { $sum: { $cond: ['$isActive', 1, 0] } },
                        inactive: { $sum: { $cond: ['$isActive', 0, 1] } }
                    }
                }
            ]);

            return stats[0] || { total: 0, active: 0, inactive: 0 };
        } catch (error) {
            logger.error('Errore nel calcolo delle statistiche:', error);
            throw error;
        }
    }
}

module.exports = AnnouncementService;
