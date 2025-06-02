// src/utils/messages/formatters/index.js - Formatters centralizzati
const MarkdownEscape = require('../../MarkdownEscape');
const PriceFormatter = require('./PriceFormatter');
const DateFormatter = require('./DateFormatter');

class TransactionFormatter {
    /**
     * Format transaction list header
     */
    static listHeader(pendingCount, completedCount) {
        let message = `💼 **LE TUE TRANSAZIONI**\n\n`;
        message += `📊 **Riepilogo:**\n`;
        message += `• In corso: ${pendingCount}\n`;
        message += `• Completate: ${completedCount}\n\n`;
        
        if (pendingCount > 0) {
            message += `🔄 **TRANSAZIONI IN CORSO:**\n\n`;
        } else {
            message += `✅ Non hai transazioni in corso.\n\n`;
        }
        
        return message;
    }

    /**
     * Format pending transactions list
     */
    static pendingList(transactions, getStatusEmoji, getStatusText) {
        let message = '';
        
        transactions.forEach((tx, index) => {
            const statusEmoji = getStatusEmoji(tx.status);
            const statusText = getStatusText(tx.status);
            const displayId = tx.transactionId.length > 15 ? 
                tx.transactionId.substring(2, 12) + '...' : 
                tx.transactionId;
            
            message += `${statusEmoji} \`${MarkdownEscape.escape(displayId)}\`\n`;
            message += `📊 ${MarkdownEscape.escape(statusText)}\n`;
            message += `📅 ${DateFormatter.formatDate(tx.createdAt)}\n\n`;
        });
        
        return message;
    }

    /**
     * Format transaction details
     */
    static details(transaction, role, statusText, statusEmoji, announcement) {
        let detailText = MarkdownEscape.formatTransactionDetails(transaction, role, statusText, statusEmoji);
        
        if (announcement) {
            detailText += `💰 Prezzo: ${PriceFormatter.formatPricePerKwh(announcement.price || announcement.basePrice)}\n`;
        }
        
        if (transaction.locationCoords && transaction.locationCoords.latitude && transaction.locationCoords.longitude) {
            const lat = transaction.locationCoords.latitude;
            const lng = transaction.locationCoords.longitude;
            detailText += `\n📍 **Posizione:** [Apri in Google Maps](https://www.google.com/maps?q=${lat},${lng})\n`;
            detailText += `🧭 Coordinate: \`${lat}, ${lng}\`\n`;
        } else if (transaction.location) {
            detailText += `\n📍 Posizione: \`${transaction.location}\`\n`;
        }
        
        return detailText;
    }

    /**
     * Format full transaction details
     */
    static async fullDetails(transaction, announcement, isSeller, getStatusText) {
        const role = isSeller ? 'VENDITORE' : 'ACQUIRENTE';
        
        let detailText = `📋 **DETTAGLI TRANSAZIONE**\n\n`;
        detailText += `🆔 ID: \`${transaction.transactionId}\`\n`;
        detailText += `📊 Stato: ${getStatusText(transaction.status)}\n`;
        detailText += `👤 Ruolo: ${role}\n\n`;
        
        detailText += `📅 Data creazione: ${DateFormatter.formatDate(transaction.createdAt)}\n`;
        if (transaction.completedAt) {
            detailText += `✅ Completata: ${DateFormatter.formatDateTime(transaction.completedAt)}\n`;
        }
        
        if (transaction.locationCoords && transaction.locationCoords.latitude && transaction.locationCoords.longitude) {
            const lat = transaction.locationCoords.latitude;
            const lng = transaction.locationCoords.longitude;
            detailText += `\n📍 **Posizione:** [Apri in Google Maps](https://www.google.com/maps?q=${lat},${lng})\n`;
            detailText += `🧭 Coordinate: \`${lat}, ${lng}\`\n`;
        } else if (transaction.location) {
            detailText += `\n📍 Luogo: ${MarkdownEscape.escape(transaction.location)}\n`;
        }
        
        detailText += `🏢 Brand: ${MarkdownEscape.escape(transaction.brand)}\n`;
        detailText += `🔌 Connettore: ${MarkdownEscape.escape(transaction.connector)}\n`;
        
        if (transaction.declaredKwh || transaction.actualKwh) {
            detailText += `\n⚡ **Energia:**\n`;
            if (transaction.actualKwh && transaction.actualKwh !== transaction.declaredKwh) {
                detailText += `• Ricaricati: ${transaction.actualKwh} KWH\n`;
                detailText += `• Fatturati: ${transaction.declaredKwh} KWH (minimo applicato)\n`;
            } else {
                detailText += `• KWH: ${transaction.declaredKwh || transaction.actualKwh}\n`;
            }
        }
        
        if (announcement && transaction.declaredKwh) {
            const price = announcement.price || announcement.basePrice;
            const amount = PriceFormatter.formatTotal(transaction.declaredKwh, price);
            detailText += `\n💰 **Pagamento:**\n`;
            detailText += `• Prezzo: ${PriceFormatter.formatPricePerKwh(price)}\n`;
            detailText += `• Totale: ${amount}\n`;
        }
        
        return detailText;
    }

    /**
     * Format history section
     */
    static historySection(title, transactions, userId, cacheFunction) {
        let message = `✅ **${title} (${transactions.length}):**\n\n`;
        
        transactions.forEach((tx, index) => {
            const date = DateFormatter.formatDate(tx.completedAt || tx.createdAt);
            const time = tx.completedAt ? DateFormatter.formatTime(tx.completedAt) : '';
            
            const kwh = tx.declaredKwh || tx.actualKwh || '?';
            const role = tx.sellerId === userId ? '📤' : '📥';
            
            const shortId = tx.transactionId.slice(-10);
            cacheFunction(shortId, tx.transactionId);
            
            message += `${role} ${date}${time ? ` ${time}` : ''} - ${kwh} KWH\n`;
        });
        
        if (transactions.length > 10) {
            message += `\n_...e altre ${transactions.length - 10} transazioni completate_\n`;
        }
        
        return message;
    }

    /**
     * Format cancelled section
     */
    static cancelledSection(transactions, cacheFunction) {
        let message = `\n❌ **ANNULLATE (${transactions.length}):**\n\n`;
        
        transactions.forEach((tx, index) => {
            const date = DateFormatter.formatDate(tx.createdAt);
            const reason = tx.cancellationReason ? ' - ' + tx.cancellationReason.substring(0, 20) : '';
            
            const shortId = tx.transactionId.slice(-10);
            cacheFunction(shortId, tx.transactionId);
            
            message += `❌ ${date}${reason}\n`;
        });
        
        if (transactions.length > 5) {
            message += `\n_...e altre ${transactions.length - 5} transazioni annullate_\n`;
        }
        
        return message;
    }
}

class AnnouncementFormatter {
    /**
     * Format user announcements list
     */
    static userList(announcements, announcementService) {
        let message = '📊 **I TUOI ANNUNCI ATTIVI:**\n\n';
        
        for (const ann of announcements) {
            message += MarkdownEscape.formatAnnouncement(ann);
            message += `📅 Pubblicato: ${DateFormatter.formatDate(ann.createdAt)}\n`;
            
            if (announcementService.needsGroupRefresh && announcementService.needsGroupRefresh(ann)) {
                message += '🔄 *Timer da aggiornare*\n';
            }
            
            message += '\n';
        }
        
        return message;
    }

    /**
     * Format announcement button text
     */
    static buttonText(ann) {
        let buttonText = `📍 ${ann.location ? ann.location.substring(0, 20) : ann.zones.substring(0, 20)}`;
        if ((ann.location || ann.zones).length > 20) buttonText += '...';
        
        if (ann.pricingType === 'fixed') {
            buttonText += ` - ${PriceFormatter.formatPricePerKwh(ann.basePrice || ann.price)}`;
        } else if (ann.pricingTiers && ann.pricingTiers.length > 0) {
            buttonText += ` - da ${PriceFormatter.formatPricePerKwh(ann.pricingTiers[0].price)}`;
        }
        
        return buttonText;
    }

    /**
     * Format announcement statistics
     */
    static statistics(announcement, annTransactions) {
        let statsText = `📊 **STATISTICHE ANNUNCIO**\n\n`;
        statsText += `🆔 ID: \`${announcement.announcementId}\`\n\n`;
        statsText += `📈 **Transazioni:**\n`;
        statsText += `• Totali: ${annTransactions.length}\n`;
        statsText += `• Completate: ${annTransactions.filter(t => t.status === 'completed').length}\n`;
        statsText += `• In corso: ${annTransactions.filter(t => !['completed', 'cancelled'].includes(t.status)).length}\n`;
        statsText += `• Annullate: ${annTransactions.filter(t => t.status === 'cancelled').length}\n\n`;
        
        const completedTx = annTransactions.filter(t => t.status === 'completed');
        if (completedTx.length > 0) {
            const totalKwh = completedTx.reduce((sum, t) => sum + (t.actualKwh || 0), 0);
            statsText += `⚡ **KWH venduti:** ${totalKwh.toFixed(1)}\n`;
        }
        
        return statsText;
    }
}

class PaymentFormatter {
    /**
     * Format pending payments list
     */
    static async pendingList(paymentPending, announcements, session) {
        let message = `💳 **PAGAMENTI IN SOSPESO**\n\n`;
        message += `Hai ${paymentPending.length} pagamenti da effettuare:\n\n`;
        
        const keyboard = [];
        
        for (let i = 0; i < paymentPending.length; i++) {
            const tx = paymentPending[i];
            const announcement = announcements[i];
            
            const amount = announcement && tx.declaredKwh ? 
                PriceFormatter.formatTotal(tx.declaredKwh, announcement.price || announcement.basePrice) : 'N/A';
            
            const displayId = tx.transactionId.slice(-10);
            message += `🆔 \`${displayId}\`\n`;
            message += `⚡ KWH: ${tx.declaredKwh || 'N/A'}\n`;
            message += `💰 Importo: ${amount}\n\n`;
            
            keyboard.push([{
                text: `💳 Paga ${amount} - ID ${displayId}`,
                callback_data: `select_payment_${tx.transactionId}`
            }]);
        }
        
        keyboard.push([{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]);
        
        return {
            message,
            keyboard: { inline_keyboard: keyboard }
        };
    }
}

class FeedbackFormatter {
    /**
     * Format missing feedback list
     */
    static missingList(missingFeedback, userId) {
        let message = `⭐ **FEEDBACK MANCANTI**\n\n`;
        message += `Hai ${missingFeedback.length} transazioni senza feedback:\n\n`;
        
        missingFeedback.slice(0, 5).forEach((tx, index) => {
            const role = tx.sellerId === userId ? '📤 Vendita' : '📥 Acquisto';
            const date = tx.completedAt || tx.createdAt;
            const kwh = tx.declaredKwh || tx.actualKwh || '?';
            
            message += `${index + 1}. ${role} del ${DateFormatter.formatDate(date)} - ${kwh} KWH\n`;
        });
        
        if (missingFeedback.length > 5) {
            message += `\n... e altre ${missingFeedback.length - 5} transazioni`;
        }
        
        return message;
    }
}

class AdminFormatter {
    /**
     * Format general statistics for admin
     */
    static generalStats(stats, announcementStats) {
        let statsText = '📊 **STATISTICHE DETTAGLIATE**\n\n';
        
        if (stats && stats.overall) {
            statsText += `🔄 **Transazioni:**\n`;
            statsText += `• Totali: ${stats.overall.totalTransactions || 0}\n`;
            statsText += `• Completate: ${stats.overall.completedTransactions || 0}\n`;
            statsText += `• Tasso successo: ${stats.overall.totalTransactions > 0 ? 
                ((stats.overall.completedTransactions / stats.overall.totalTransactions) * 100).toFixed(1) : 0}%\n`;
            statsText += `• KWH totali: ${(stats.overall.totalKwh || 0).toFixed(1)}\n`;
            
            if (stats.overall.totalAmount) {
                statsText += `• Volume totale: ${PriceFormatter.formatPrice(stats.overall.totalAmount)}\n`;
            }
            
            statsText += '\n';
        }
        
        if (announcementStats) {
            statsText += `📋 **Annunci:**\n`;
            statsText += `• Attivi: ${announcementStats.totalActive || 0}\n`;
            statsText += `• Prezzo medio: ${PriceFormatter.formatPricePerKwh(announcementStats.avgPrice || 0)}\n`;
            
            if (announcementStats.minPrice && announcementStats.maxPrice) {
                statsText += `• Range prezzi: ${PriceFormatter.formatPriceRange(announcementStats.minPrice, announcementStats.maxPrice)}\n`;
            }
            
            statsText += '\n';
        }
        
        statsText += `🕐 **Aggiornato:** ${DateFormatter.formatDateTime(new Date())}`;
        
        return statsText;
    }

    /**
     * Format user statistics
     */
    static userStats(userStats) {
        if (!userStats) return 'Statistiche non disponibili.';
        
        let message = `📊 **STATISTICHE UTENTE**\n\n`;
        
        // Transazioni
        message += `🔄 **Transazioni:**\n`;
        message += `• Come venditore: ${userStats.sellerTransactions || 0}\n`;
        message += `• Come acquirente: ${userStats.buyerTransactions || 0}\n`;
        message += `• Totali: ${(userStats.sellerTransactions || 0) + (userStats.buyerTransactions || 0)}\n\n`;
        
        // KWH
        if (userStats.totalKwhSold || userStats.totalKwhBought) {
            message += `⚡ **Energia:**\n`;
            if (userStats.totalKwhSold) {
                message += `• KWH venduti: ${userStats.totalKwhSold.toFixed(1)}\n`;
            }
            if (userStats.totalKwhBought) {
                message += `• KWH acquistati: ${userStats.totalKwhBought.toFixed(1)}\n`;
            }
            message += '\n';
        }
        
        // Feedback
        if (userStats.totalFeedback > 0) {
            message += `⭐ **Feedback:**\n`;
            message += `• Totali ricevuti: ${userStats.totalFeedback}\n`;
            message += `• Valutazione media: ${userStats.averageRating.toFixed(1)}/5\n`;
            message += `• Feedback positivi: ${userStats.positivePercentage}%\n`;
            
            // Badge
            if (userStats.sellerBadge) {
                const badgeEmoji = userStats.sellerBadge === 'TOP' ? '🌟' : '✅';
                message += `• Badge: ${badgeEmoji} VENDITORE ${userStats.sellerBadge}\n`;
            }
            message += '\n';
        }
        
        // Volume finanziario
        if (userStats.totalVolumeEur) {
            message += `💰 **Volume transazioni:** ${PriceFormatter.formatPrice(userStats.totalVolumeEur)}\n\n`;
        }
        
        // Data iscrizione
        if (userStats.memberSince) {
            message += `📅 **Membro dal:** ${DateFormatter.formatDate(userStats.memberSince)}`;
        }
        
        return message;
    }
}

// Main formatters export
const formatters = {
    transaction: TransactionFormatter,
    announcement: AnnouncementFormatter,
    payment: PaymentFormatter,
    feedback: FeedbackFormatter,
    admin: AdminFormatter
};

module.exports = formatters;
