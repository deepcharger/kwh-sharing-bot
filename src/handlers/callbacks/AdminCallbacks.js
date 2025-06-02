// src/handlers/callbacks/AdminCallbacks.js - NUOVO FILE
const BaseHandler = require('../base/BaseHandler');
const Keyboards = require('../../utils/keyboards/Keyboards');
const MarkdownEscape = require('../../utils/MarkdownEscape');

class AdminCallbacks extends BaseHandler {
    constructor(bot) {
        super(bot);
    }

    /**
     * Main handler method
     */
    async handle(ctx, callbackData) {
        // Check admin authorization
        if (ctx.from.id != this.bot.adminUserId) {
            await this.answerCallback(ctx, '❌ Non autorizzato', true);
            return;
        }
        
        await this.answerCallback(ctx);
        
        // Route to specific handler
        if (callbackData === 'admin_general_stats') {
            await this.handleGeneralStats(ctx);
        } else if (callbackData === 'admin_pending_transactions') {
            await this.handlePendingTransactions(ctx);
        } else if (callbackData === 'admin_open_disputes') {
            await this.handleOpenDisputes(ctx);
        } else if (callbackData === 'admin_manage_users') {
            await this.handleManageUsers(ctx);
        } else if (callbackData === 'admin_active_announcements') {
            await this.handleActiveAnnouncements(ctx);
        }
    }

    /**
     * Handle general statistics
     */
    async handleGeneralStats(ctx) {
        const transactionStats = await this.services.transaction.getTransactionStats();
        const announcementStats = await this.services.announcement.getAnnouncementStats();
        
        let statsText = '📊 **STATISTICHE DETTAGLIATE**\n\n';
        
        if (transactionStats && transactionStats.overall) {
            statsText += `🔄 **Transazioni:**\n`;
            statsText += `• Totali: ${transactionStats.overall.totalTransactions || 0}\n`;
            statsText += `• Completate: ${transactionStats.overall.completedTransactions || 0}\n`;
            statsText += `• Tasso successo: ${transactionStats.overall.totalTransactions > 0 ? 
                ((transactionStats.overall.completedTransactions / transactionStats.overall.totalTransactions) * 100).toFixed(1) : 0}%\n`;
            statsText += `• KWH totali: ${(transactionStats.overall.totalKwh || 0).toFixed(1)}\n`;
            statsText += `• Volume totale: €${(transactionStats.overall.totalAmount || 0).toFixed(2)}\n\n`;
        }
        
        if (announcementStats) {
            statsText += `📋 **Annunci:**\n`;
            statsText += `• Attivi: ${announcementStats.totalActive || 0}\n`;
            statsText += `• Prezzo medio: €${(announcementStats.avgPrice || 0).toFixed(3)}/KWH\n`;
            statsText += `• Range prezzi: €${(announcementStats.minPrice || 0).toFixed(2)} - €${(announcementStats.maxPrice || 0).toFixed(2)}\n`;
        }
        
        await ctx.editMessageText(statsText, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
        });
    }

    /**
     * Handle pending transactions
     */
    async handlePendingTransactions(ctx) {
        const pendingTransactions = await this.services.transaction.getPendingTransactions();
        
        if (pendingTransactions.length === 0) {
            await ctx.editMessageText(
                '✅ **Nessuna transazione in sospeso**\n\nTutte le transazioni sono aggiornate!',
                { 
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
                }
            );
            return;
        }
        
        let message = '⏳ **TRANSAZIONI IN SOSPESO:**\n\n';
        for (const tx of pendingTransactions.slice(0, 10)) {
            message += `🆔 \`${tx.transactionId}\`\n`;
            message += `📊 Status: ${MarkdownEscape.escape(tx.status)}\n`;
            message += `📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n`;
            
            // Calculate time pending
            const hoursPending = Math.floor((new Date() - tx.createdAt) / (1000 * 60 * 60));
            if (hoursPending > 24) {
                message += `⚠️ *In sospeso da ${Math.floor(hoursPending / 24)} giorni*\n`;
            } else if (hoursPending > 2) {
                message += `⏰ *In sospeso da ${hoursPending} ore*\n`;
            }
            
            message += '\n';
        }
        
        if (pendingTransactions.length > 10) {
            message += `\n... e altre ${pendingTransactions.length - 10} transazioni`;
        }
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
        });
    }

    /**
     * Handle open disputes
     */
    async handleOpenDisputes(ctx) {
        const disputedTransactions = await this.services.transaction.getUserTransactions(null, 'all');
        const disputes = disputedTransactions.filter(tx => tx.status === 'disputed' || tx.issues?.length > 0);
        
        if (disputes.length === 0) {
            await ctx.editMessageText(
                '✅ **Nessuna disputa aperta**\n\nTutte le transazioni procedono regolarmente!',
                { 
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
                }
            );
            return;
        }
        
        let message = '⚠️ **DISPUTE APERTE:**\n\n';
        for (const dispute of disputes.slice(0, 5)) {
            message += `🆔 \`${dispute.transactionId}\`\n`;
            message += `⚠️ Issues: ${dispute.issues?.length || 0}\n`;
            
            if (dispute.issues && dispute.issues.length > 0) {
                const lastIssue = dispute.issues[dispute.issues.length - 1];
                message += `📝 Ultimo problema: ${MarkdownEscape.escape(lastIssue.description)}\n`;
                message += `👤 Segnalato da: ${lastIssue.reportedBy}\n`;
            }
            
            message += `📅 ${dispute.createdAt.toLocaleDateString('it-IT')}\n\n`;
        }
        
        if (disputes.length > 5) {
            message += `\n... e altre ${disputes.length - 5} dispute`;
        }
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
        });
    }

    /**
     * Handle manage users
     */
    async handleManageUsers(ctx) {
        const allUsers = await this.services.user.getAllUsersWithStats();
        
        let message = '👥 **GESTIONE UTENTI**\n\n';
        message += `📊 **Statistiche generali:**\n`;
        message += `• Utenti totali: ${allUsers.length}\n`;
        message += `• Venditori TOP: ${allUsers.filter(u => u.sellerBadge === 'TOP').length}\n`;
        message += `• Venditori AFFIDABILI: ${allUsers.filter(u => u.sellerBadge === 'AFFIDABILE').length}\n\n`;
        
        // Calculate activity stats
        const activeUsers = allUsers.filter(u => {
            const daysSinceActive = (new Date() - new Date(u.lastActivity)) / (1000 * 60 * 60 * 24);
            return daysSinceActive < 30;
        });
        
        message += `📈 **Attività:**\n`;
        message += `• Attivi ultimi 30gg: ${activeUsers.length}\n`;
        message += `• Inattivi: ${allUsers.length - activeUsers.length}\n\n`;
        
        const topUsers = allUsers
            .filter(u => u.totalFeedback > 0)
            .sort((a, b) => b.positivePercentage - a.positivePercentage)
            .slice(0, 5);
            
        if (topUsers.length > 0) {
            message += `🏆 **Top 5 venditori:**\n`;
            topUsers.forEach((user, index) => {
                message += `${index + 1}. @${MarkdownEscape.escape(user.username || 'utente')} `;
                message += `(${user.positivePercentage}% - ${user.totalFeedback} recensioni)\n`;
            });
        }
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
        });
    }

    /**
     * Handle active announcements
     */
    async handleActiveAnnouncements(ctx) {
        const activeAnnouncements = await this.services.announcement.getActiveAnnouncements(20);
        
        if (activeAnnouncements.length === 0) {
            await ctx.editMessageText(
                '📭 **Nessun annuncio attivo**\n\nIl marketplace è vuoto al momento.',
                { 
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
                }
            );
            return;
        }
        
        let message = '📋 **ANNUNCI ATTIVI:**\n\n';
        
        // Group by price range
        const priceRanges = {
            low: activeAnnouncements.filter(a => (a.price || a.basePrice) < 0.30),
            medium: activeAnnouncements.filter(a => {
                const price = a.price || a.basePrice;
                return price >= 0.30 && price <= 0.40;
            }),
            high: activeAnnouncements.filter(a => (a.price || a.basePrice) > 0.40)
        };
        
        message += `💰 **Distribuzione prezzi:**\n`;
        message += `• Economici (<0.30€): ${priceRanges.low.length}\n`;
        message += `• Medi (0.30-0.40€): ${priceRanges.medium.length}\n`;
        message += `• Premium (>0.40€): ${priceRanges.high.length}\n\n`;
        
        message += `📍 **Ultimi 10 annunci:**\n`;
        for (const ann of activeAnnouncements.slice(0, 10)) {
            const price = ann.price || ann.basePrice;
            const hoursActive = Math.floor((new Date() - ann.createdAt) / (1000 * 60 * 60));
            
            message += `• ${price}€/KWH - ${MarkdownEscape.escape(ann.zones || ann.location)}\n`;
            message += `  📅 Attivo da ${hoursActive}h - @${MarkdownEscape.escape(ann.userId?.username || 'utente')}\n`;
        }
        
        if (activeAnnouncements.length > 10) {
            message += `\n... e altri ${activeAnnouncements.length - 10} annunci`;
        }
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
        });
    }
}

module.exports = AdminCallbacks;
