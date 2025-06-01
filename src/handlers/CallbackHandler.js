const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');
const MarkdownEscape = require('../utils/MarkdownEscape');

class CallbackHandler {
    constructor(bot) {
        this.bot = bot;
    }

    setupCallbacks() {
        // Navigation callbacks con pulizia
        this.setupNavigationCallbacks();
        
        // Admin callbacks
        this.setupAdminCallbacks();
        
        // Transaction management callbacks
        this.setupTransactionCallbacks();
        
        // Payment callbacks
        this.setupPaymentCallbacks();
        
        // Announcement callbacks
        this.setupAnnouncementCallbacks();
        
        // Charging callbacks
        this.setupChargingCallbacks();
        
        // Feedback callbacks
        this.setupFeedbackCallbacks();
        
        // Help callbacks
        this.setupHelpCallbacks();
        
        // Buy energy callbacks
        this.setupBuyEnergyCallbacks();
    }

    setupNavigationCallbacks() {
        // Menu principale con pulizia completa
        this.bot.bot.action('back_to_main', async (ctx) => {
            await ctx.answerCbQuery();
            
            if (ctx.scene) {
                await ctx.scene.leave();
            }
            
            // Pulisci completamente la chat e torna al menu
            await this.bot.chatCleaner.resetUserChat(ctx);
        });

        this.bot.bot.action('back_to_txs', async (ctx) => {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const allTransactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
            const pending = allTransactions.filter(t => !['completed', 'cancelled'].includes(t.status));
            const completed = allTransactions.filter(t => t.status === 'completed');

            let message = '💼 **LE TUE TRANSAZIONI**\n\n';
            
            if (pending.length > 0) {
                message += `⏳ **IN CORSO (${pending.length}):**\n`;
                message += MarkdownEscape.formatTransactionList(
                    pending.slice(0, 5),
                    this.bot.getStatusEmoji.bind(this.bot),
                    this.bot.getStatusText.bind(this.bot)
                );
            }
            
            message += `✅ **Completate:** ${completed.length}`;
            
            await this.bot.chatCleaner.editOrReplace(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getTransactionsKeyboard(pending, completed).reply_markup,
                messageType: 'navigation'
            });
        });

        this.bot.bot.action('my_announcements', async (ctx) => {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            const announcements = await this.bot.announcementService.getUserAnnouncements(userId);
            
            if (announcements.length === 0) {
                await this.bot.chatCleaner.sendTemporaryMessage(
                    ctx, 
                    '📭 Non hai ancora pubblicato annunci.',
                    {},
                    3000
                );
                
                setTimeout(async () => {
                    await this.bot.chatCleaner.resetUserChat(ctx);
                }, 3000);
                return;
            }

            let message = '📊 **I TUOI ANNUNCI ATTIVI:**\n\n';
            for (const ann of announcements) {
                message += MarkdownEscape.formatAnnouncement(ann);
                message += `📅 Pubblicato: ${ann.createdAt.toLocaleDateString('it-IT')}\n`;
                
                // Aggiungi indicatore se necessita refresh
                if (this.needsGroupRefresh(ann)) {
                    message += '🔄 *Timer da aggiornare*\n';
                }
                
                message += '\n';
            }
            
            await this.bot.chatCleaner.editOrReplace(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getUserAnnouncementsKeyboard(announcements).reply_markup,
                messageType: 'navigation'
            });
        });

        this.bot.bot.action('tx_history', async (ctx) => {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const transactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
            const completed = transactions.filter(t => t.status === 'completed');
            const cancelled = transactions.filter(t => t.status === 'cancelled');
            
            let message = '📜 **CRONOLOGIA TRANSAZIONI**\n\n';
            const keyboard = [];
            
            if (completed.length > 0) {
                message += `✅ **COMPLETATE (${completed.length}):**\n\n`;
                
                // Mostra le ultime 10 transazioni completate con bottoni
                completed.slice(-10).reverse().forEach((tx, index) => {
                    const date = tx.completedAt ? tx.completedAt.toLocaleDateString('it-IT') : tx.createdAt.toLocaleDateString('it-IT');
                    const time = tx.completedAt ? tx.completedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
                    
                    // Ottieni info aggiuntive se disponibili
                    const kwh = tx.declaredKwh || tx.actualKwh || '?';
                    const role = tx.sellerId === userId ? '📤' : '📥'; // Vendita o Acquisto
                    
                    // Crea short ID e cachelo
                    const shortId = tx.transactionId.slice(-10);
                    this.bot.cacheTransactionId(shortId, tx.transactionId);
                    
                    // Aggiungi bottone per questa transazione
                    keyboard.push([{
                        text: `${role} ${date} ${time} - ${kwh} KWH`,
                        callback_data: `view_tx_detail_${shortId}`
                    }]);
                });
                
                if (completed.length > 10) {
                    message += `\n_...e altre ${completed.length - 10} transazioni completate_\n`;
                }
            }
            
            if (cancelled.length > 0) {
                message += `\n❌ **ANNULLATE (${cancelled.length}):**\n\n`;
                
                // Mostra le ultime 5 transazioni annullate con bottoni
                cancelled.slice(-5).reverse().forEach((tx, index) => {
                    const date = tx.createdAt.toLocaleDateString('it-IT');
                    const reason = tx.cancellationReason ? ' - ' + tx.cancellationReason.substring(0, 20) : '';
                    
                    // Crea short ID e cachelo
                    const shortId = tx.transactionId.slice(-10);
                    this.bot.cacheTransactionId(shortId, tx.transactionId);
                    
                    // Aggiungi bottone per questa transazione
                    keyboard.push([{
                        text: `❌ ${date}${reason}`,
                        callback_data: `view_tx_detail_${shortId}`
                    }]);
                });
                
                if (cancelled.length > 5) {
                    message += `\n_...e altre ${cancelled.length - 5} transazioni annullate_\n`;
                }
            }
            
            if (completed.length === 0 && cancelled.length === 0) {
                message += '_Nessuna transazione nella cronologia_';
            }
            
            // Aggiungi bottone per tornare al menu
            keyboard.push([{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]);
            
            await this.bot.chatCleaner.editOrReplace(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard },
                messageType: 'navigation'
            });
        });
        
        // Aggiungi nuovo callback per visualizzare i dettagli della transazione dalla cronologia
        this.bot.bot.action(/^view_tx_detail_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const transaction = await this.bot.findTransactionByShortId(shortId, ctx.from.id);
            if (!transaction) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
                return;
            }
            
            const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);
            const userId = ctx.from.id;
            const isSeller = userId === transaction.sellerId;
            const role = isSeller ? 'VENDITORE' : 'ACQUIRENTE';
            
            let detailText = `📋 **DETTAGLI TRANSAZIONE**\n\n`;
            detailText += `🆔 ID: \`${transaction.transactionId}\`\n`;
            detailText += `📊 Stato: ${this.bot.getStatusText(transaction.status)}\n`;
            detailText += `👤 Ruolo: ${role}\n\n`;
            
            detailText += `📅 Data creazione: ${transaction.createdAt.toLocaleDateString('it-IT')}\n`;
            if (transaction.completedAt) {
                detailText += `✅ Completata il: ${transaction.completedAt.toLocaleDateString('it-IT')} alle ${transaction.completedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}\n`;
            }
            
            // Gestione posizione con Google Maps
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
                const amount = (transaction.declaredKwh * price).toFixed(2);
                detailText += `\n💰 **Pagamento:**\n`;
                detailText += `• Prezzo: ${price}€/KWH\n`;
                detailText += `• Totale: €${amount}\n`;
            }
            
            // Controlla se manca il feedback
            const feedbacks = await this.bot.db.getCollection('feedback')
                .find({ 
                    transactionId: transaction.transactionId,
                    fromUserId: userId
                }).toArray();
            
            const keyboard = [];
            
            if (feedbacks.length === 0 && transaction.status === 'completed') {
                keyboard.push([{ 
                    text: '⭐ Lascia feedback', 
                    callback_data: `feedback_tx_${transaction.transactionId}` 
                }]);
            }
            
            keyboard.push([{ text: '🔙 Torna alla cronologia', callback_data: 'tx_history' }]);
            keyboard.push([{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]);
            
            await ctx.editMessageText(detailText, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
        });
    }

    setupAdminCallbacks() {
        this.bot.bot.action('admin_general_stats', async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionStats = await this.bot.transactionService.getTransactionStats();
            const announcementStats = await this.bot.announcementService.getAnnouncementStats();
            
            let statsText = '📊 **STATISTICHE DETTAGLIATE**\n\n';
            
            if (transactionStats && transactionStats.overall) {
                statsText += `🔄 **Transazioni:**\n`;
                statsText += `• Totali: ${transactionStats.overall.totalTransactions || 0}\n`;
                statsText += `• Completate: ${transactionStats.overall.completedTransactions || 0}\n`;
                statsText += `• Tasso successo: ${transactionStats.overall.totalTransactions > 0 ? 
                    ((transactionStats.overall.completedTransactions / transactionStats.overall.totalTransactions) * 100).toFixed(1) : 0}%\n`;
                statsText += `• KWH totali: ${(transactionStats.overall.totalKwh || 0).toFixed(1)}\n\n`;
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
        });

        this.bot.bot.action('admin_pending_transactions', async (ctx) => {
            await ctx.answerCbQuery();
            const pendingTransactions = await this.bot.transactionService.getPendingTransactions();
            
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
                message += `📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            if (pendingTransactions.length > 10) {
                message += `\n... e altre ${pendingTransactions.length - 10} transazioni`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
            });
        });

        this.bot.bot.action('admin_open_disputes', async (ctx) => {
            await ctx.answerCbQuery();
            const disputedTransactions = await this.bot.transactionService.getUserTransactions(null, 'all');
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
                message += `📅 ${dispute.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
            });
        });

        this.bot.bot.action('admin_manage_users', async (ctx) => {
            await ctx.answerCbQuery();
            const allUsers = await this.bot.userService.getAllUsersWithStats();
            
            let message = '👥 **GESTIONE UTENTI**\n\n';
            message += `📊 **Statistiche generali:**\n`;
            message += `• Utenti totali: ${allUsers.length}\n`;
            message += `• Venditori TOP: ${allUsers.filter(u => u.sellerBadge === 'TOP').length}\n`;
            message += `• Venditori AFFIDABILI: ${allUsers.filter(u => u.sellerBadge === 'AFFIDABILE').length}\n\n`;
            
            const topUsers = allUsers
                .filter(u => u.totalFeedback > 0)
                .sort((a, b) => b.positivePercentage - a.positivePercentage)
                .slice(0, 5);
                
            if (topUsers.length > 0) {
                message += `🏆 **Top 5 venditori:**\n`;
                topUsers.forEach((user, index) => {
                    message += `${index + 1}. @${MarkdownEscape.escape(user.username || 'utente')} (${user.positivePercentage}%)\n`;
                });
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
            });
        });

        this.bot.bot.action('admin_active_announcements', async (ctx) => {
            await ctx.answerCbQuery();
            const activeAnnouncements = await this.bot.announcementService.getActiveAnnouncements(20);
            
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
            for (const ann of activeAnnouncements.slice(0, 10)) {
                message += `💰 ${ann.price || ann.basePrice}€/KWH - ${MarkdownEscape.escape(ann.zones)}\n`;
                message += `📅 ${ann.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            if (activeAnnouncements.length > 10) {
                message += `\n... e altri ${activeAnnouncements.length - 10} annunci`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
            });
        });
    }

    setupTransactionCallbacks() {
        // Transaction requests handling - VERSIONE AGGIORNATA
        this.bot.bot.action(/^accept_request_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            await this.bot.transactionService.updateTransactionStatus(
                transactionId,
                'confirmed'
            );

            try {
                // Notifica l'acquirente con il nuovo messaggio e bottone
                let buyerMessage = `✅ **RICHIESTA ACCETTATA!**\n\n` +
                    `Il venditore ha confermato la tua richiesta per ${MarkdownEscape.escape(transaction.scheduledDate)}.\n\n`;
                
                // Aggiungi link Google Maps se ci sono coordinate
                if (transaction.locationCoords && transaction.locationCoords.latitude && transaction.locationCoords.longitude) {
                    const lat = transaction.locationCoords.latitude;
                    const lng = transaction.locationCoords.longitude;
                    buyerMessage += `📍 **Posizione:** [Apri in Google Maps](https://www.google.com/maps?q=${lat},${lng})\n`;
                    buyerMessage += `🧭 Coordinate: \`${lat}, ${lng}\`\n`;
                } else if (transaction.location) {
                    buyerMessage += `📍 **Posizione:** \`${transaction.location}\`\n`;
                }
                
                buyerMessage += `🏢 **Brand:** ${MarkdownEscape.escape(transaction.brand)}\n` +
                    `🔌 **Connettore:** ${MarkdownEscape.escape(transaction.connector)}\n\n` +
                    `⚠️ **IMPORTANTE:** Quando arrivi alla colonnina e sei pronto per ricaricare, premi il bottone sotto per avvisare il venditore.\n\n` +
                    `🔍 ID Transazione: \`${transactionId}\``;
                
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                    buyerMessage,
                    { 
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📍 Sono arrivato alla colonnina', callback_data: `arrived_at_station_${transactionId}` }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await this.bot.chatCleaner.sendConfirmationMessage(ctx,
                '✅ Richiesta accettata! L\'acquirente è stato notificato.\n\n' +
                'Riceverai una notifica quando l\'acquirente sarà arrivato alla colonnina.'
            );
            
            // Imposta un reminder dopo 30 minuti se l'acquirente non ha confermato l'arrivo
            setTimeout(async () => {
                const updatedTransaction = await this.bot.transactionService.getTransaction(transactionId);
                
                // Se lo stato è ancora 'confirmed' (non è arrivato), invia reminder
                if (updatedTransaction && updatedTransaction.status === 'confirmed') {
                    try {
                        await this.bot.chatCleaner.sendPersistentMessage(
                            { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                            `⏰ **PROMEMORIA**\n\n` +
                            `La tua ricarica è prevista per ${MarkdownEscape.escape(transaction.scheduledDate)}.\n\n` +
                            `Quando arrivi alla colonnina, ricordati di premere il bottone per avvisare il venditore!\n\n` +
                            `🔍 ID Transazione: \`${transactionId}\``,
                            { 
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: '📍 Sono arrivato alla colonnina', callback_data: `arrived_at_station_${transactionId}` }]
                                    ]
                                }
                            }
                        );
                    } catch (error) {
                        console.error('Error sending arrival reminder:', error);
                    }
                }
            }, 30 * 60 * 1000); // 30 minuti
        });

        // NUOVO CALLBACK: Gestione arrivo dell'acquirente
        this.bot.bot.action(/^arrived_at_station_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Verifica che sia l'acquirente
            if (ctx.from.id !== transaction.buyerId) {
                await ctx.answerCbQuery('❌ Non sei autorizzato.', { show_alert: true });
                return;
            }
            
            // Aggiorna lo stato a "buyer_arrived"
            await this.bot.transactionService.updateTransactionStatus(
                transactionId,
                'buyer_arrived'
            );
            
            // Conferma all'acquirente
            let confirmMessage = `✅ **CONFERMATO!**\n\n` +
                `Il venditore è stato avvisato che sei arrivato alla colonnina.\n\n`;
            
            // Aggiungi link Google Maps se ci sono coordinate
            if (transaction.locationCoords && transaction.locationCoords.latitude && transaction.locationCoords.longitude) {
                const lat = transaction.locationCoords.latitude;
                const lng = transaction.locationCoords.longitude;
                confirmMessage += `📍 **Posizione:** [Apri in Google Maps](https://www.google.com/maps?q=${lat},${lng})\n`;
                confirmMessage += `🧭 Coordinate: \`${lat}, ${lng}\`\n\n`;
            } else if (transaction.location) {
                confirmMessage += `📍 **Posizione:** \`${transaction.location}\`\n\n`;
            }
            
            confirmMessage += `⏳ Attendi che il venditore attivi la ricarica.\n\n` +
                `💡 **Suggerimenti:**\n` +
                `• Verifica che il connettore sia quello giusto\n` +
                `• Assicurati che l'auto sia pronta per ricevere la ricarica\n` +
                `• Tieni il cavo a portata di mano\n\n` +
                `🔍 ID Transazione: \`${transactionId}\``;
            
            await ctx.editMessageText(confirmMessage, { 
                parse_mode: 'Markdown',
                disable_web_page_preview: true 
            });
            
            // Notifica il venditore
            try {
                let sellerMessage = `⏰ **L'ACQUIRENTE È ARRIVATO!**\n\n` +
                    `L'acquirente @${MarkdownEscape.escape(ctx.from.username || ctx.from.first_name)} è arrivato alla colonnina ed è pronto per ricaricare.\n\n`;
                
                // Aggiungi link Google Maps se ci sono coordinate
                if (transaction.locationCoords && transaction.locationCoords.latitude && transaction.locationCoords.longitude) {
                    const lat = transaction.locationCoords.latitude;
                    const lng = transaction.locationCoords.longitude;
                    sellerMessage += `📍 **Posizione:** [Apri in Google Maps](https://www.google.com/maps?q=${lat},${lng})\n`;
                    sellerMessage += `🧭 Coordinate: \`${lat}, ${lng}\`\n`;
                } else if (transaction.location) {
                    sellerMessage += `📍 **Posizione:** \`${transaction.location}\`\n`;
                }
                
                sellerMessage += `🏢 **Colonnina:** ${MarkdownEscape.escape(transaction.brand)}\n` +
                    `🔌 **Connettore:** ${MarkdownEscape.escape(transaction.connector)}\n` +
                    `🔍 **ID Transazione:** \`${transactionId}\`\n\n` +
                    `È il momento di attivare la ricarica!`;
                
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.sellerId } },
                    sellerMessage,
                    {
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⚡ Attiva ricarica ORA', callback_data: `activate_charging_${transactionId}` }],
                                [{ text: '⏸️ Ritarda di 5 min', callback_data: `delay_charging_${transactionId}` }],
                                [{ text: '❌ Problemi tecnici', callback_data: `technical_issues_${transactionId}` }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Error notifying seller:', error);
            }
        });

        this.bot.bot.action(/^reject_request_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            ctx.session.rejectingTransactionId = transactionId;
            
            await ctx.editMessageText(
                '📝 *Motivo del rifiuto:*\n\n' +
                'Scrivi brevemente il motivo per cui rifiuti questa richiesta:',
                { parse_mode: 'Markdown' }
            );
            
            ctx.session.waitingForRejectionReason = true;
        });

        this.bot.bot.action(/^contact_buyer_(\d+)_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const buyerId = ctx.match[1];
            const buyerUsername = ctx.match[2];
            
            const telegramLink = buyerUsername !== 'user' ? 
                `https://t.me/${buyerUsername}` : 
                `tg://user?id=${buyerId}`;
            
            const message = `💬 **Contatta l'acquirente**\n\n`;
            
            if (buyerUsername !== 'user') {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    message +
                    `Puoi contattare direttamente @${MarkdownEscape.escape(buyerUsername)} cliccando qui:\n` +
                    `${telegramLink}\n\n` +
                    `📝 **Suggerimenti per la conversazione:**\n` +
                    `• Conferma i dettagli della ricarica\n` +
                    `• Chiarisci eventuali dubbi sulla colonnina\n` +
                    `• Coordina l'orario se necessario\n` +
                    `• Discuti il metodo di pagamento preferito\n\n` +
                    `⚠️ **Importante:** Dopo aver chiarito tutti i dettagli, torna qui per accettare o rifiutare la richiesta.`,
                    { 
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true 
                    },
                    10000
                );
            } else {
                await this.bot.chatCleaner.sendTemporaryMessage(ctx,
                    message +
                    `L'utente non ha un username pubblico.\n` +
                    `ID Utente: \`${buyerId}\`\n\n` +
                    `Puoi provare a contattarlo tramite il link:\n${telegramLink}\n\n` +
                    `Oppure attendi che ti contatti lui.`,
                    { 
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true 
                    },
                    10000
                );
            }
        });

        // Transaction management
        this.bot.bot.action(/^view_tx_(\d+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const index = parseInt(ctx.match[1]);
            const userId = ctx.from.id;
            
            const allTransactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
            const pending = allTransactions.filter(t => !['completed', 'cancelled'].includes(t.status));
            
            if (index >= pending.length) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
                return;
            }
            
            const transaction = pending[index];
            const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);
            
            const statusText = this.bot.getStatusText(transaction.status);
            const statusEmoji = this.bot.getStatusEmoji(transaction.status);
            const role = userId === transaction.sellerId ? 'VENDITORE' : 'ACQUIRENTE';
            
            let detailText = MarkdownEscape.formatTransactionDetails(transaction, role, statusText, statusEmoji);
            
            // Aggiungi informazioni aggiuntive se presenti
            if (announcement) {
                detailText += `💰 Prezzo: ${announcement.price || announcement.basePrice}€/KWH\n`;
            }
            
            // Gestione posizione con Google Maps
            if (transaction.locationCoords && transaction.locationCoords.latitude && transaction.locationCoords.longitude) {
                const lat = transaction.locationCoords.latitude;
                const lng = transaction.locationCoords.longitude;
                detailText += `\n📍 **Posizione:** [Apri in Google Maps](https://www.google.com/maps?q=${lat},${lng})\n`;
                detailText += `🧭 Coordinate: \`${lat}, ${lng}\`\n`;
            } else if (transaction.location) {
                detailText += `\n📍 Posizione: \`${transaction.location}\`\n`;
            }
            
            const shortId = transaction.transactionId.slice(-10);
            this.bot.cacheTransactionId(shortId, transaction.transactionId);
            
            await this.bot.chatCleaner.editOrReplace(ctx, detailText, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
                reply_markup: Keyboards.getTransactionActionsKeyboard(transaction.transactionId, transaction.status, userId === transaction.sellerId).reply_markup,
                messageType: 'transaction_details'
            });
        });

        this.bot.bot.action(/^manage_tx_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const transaction = await this.bot.findTransactionByShortId(shortId, ctx.from.id);
            
            if (!transaction) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
                return;
            }
            
            ctx.session.transactionId = transaction.transactionId;
            await this.bot.chatCleaner.enterScene(ctx, 'transactionScene');
        });

        // IMPORTANTE: Callback per "Ho pagato" dal messaggio esterno
        this.bot.bot.action(/^payment_done_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Verifica che sia l'acquirente
            if (ctx.from.id !== transaction.buyerId) {
                await ctx.answerCbQuery('❌ Non sei autorizzato.', { show_alert: true });
                return;
            }
            
            await this.bot.transactionService.updateTransactionStatus(
                transactionId,
                'payment_declared'
            );

            try {
                const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);
                const amount = announcement && transaction.declaredKwh ? 
                    (transaction.declaredKwh * (announcement.price || announcement.basePrice)).toFixed(2) : 'N/A';
                
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.sellerId } },
                    `💳 **PAGAMENTO DICHIARATO**\n\n` +
                    `L'acquirente @${MarkdownEscape.escape(ctx.from.username || ctx.from.first_name)} dichiara di aver pagato.\n\n` +
                    `💰 Importo dichiarato: €${amount}\n` +
                    `⚡ KWH forniti: ${transaction.declaredKwh || 'N/A'}\n` +
                    `🔍 ID Transazione: \`${transactionId}\`\n\n` +
                    `Hai ricevuto il pagamento?`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: Keyboards.getSellerPaymentConfirmKeyboard().reply_markup
                    }
                );
            } catch (error) {
                console.error('Error notifying seller:', error);
            }

            await ctx.editMessageText(
                `✅ **DICHIARAZIONE PAGAMENTO INVIATA!**\n\n` +
                `Il venditore è stato notificato e dovrà confermare la ricezione del pagamento.\n\n` +
                `Riceverai aggiornamenti sullo stato della transazione.`,
                { parse_mode: 'Markdown' }
            );
        });
    }

    setupPaymentCallbacks() {
        // Payment confirmation con pulizia migliorata
        this.bot.bot.action('payment_completed', async (ctx) => {
            await ctx.answerCbQuery();
            
            // Prova a estrarre l'ID transazione dal messaggio corrente
            const messageText = ctx.callbackQuery.message.text || '';
            let transactionId = null;
            
            // Cerca l'ID nel testo del messaggio
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s\n]+)`?/);
            if (transactionIdMatch) {
                transactionId = transactionIdMatch[1];
            }
            
            // Se non trovato nel messaggio, cerca nella sessione
            if (!transactionId && ctx.session.currentTransactionId) {
                transactionId = ctx.session.currentTransactionId;
            }
            
            // Se ancora non trovato, cerca nei messaggi precedenti della conversazione
            if (!transactionId) {
                const userId = ctx.from.id;
                const transactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
                const paymentPending = transactions.filter(t => 
                    t.status === 'payment_requested' && t.buyerId === userId
                );
                
                if (paymentPending.length === 1) {
                    transactionId = paymentPending[0].transactionId;
                } else if (paymentPending.length > 1) {
                    // Mostra lista pulita per scegliere
                    await ctx.editMessageText(
                        '💳 **HAI PIÙ PAGAMENTI IN SOSPESO**\n\n' +
                        'Seleziona la transazione per cui hai effettuato il pagamento:',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: paymentPending.map((tx, index) => [{
                                    text: `💰 \`${tx.transactionId.slice(-10)}\` - ${tx.declaredKwh || '?'} KWH`,
                                    callback_data: `confirm_payment_${tx.transactionId}`
                                }])
                            }
                        }
                    );
                    return;
                }
            }
            
            if (!transactionId) {
                await this.bot.chatCleaner.editOrReplace(ctx,
                    '❌ **Errore: transazione non identificata**\n\n' +
                    'Non riesco a trovare la transazione per cui confermare il pagamento.\n' +
                    'Usa il comando /pagamenti per riprovare.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🏠 Menu principale', callback_data: 'back_to_main' }
                            ]]
                        },
                        messageType: 'error'
                    }
                );
                return;
            }
            
            await this.processPaymentConfirmation(ctx, transactionId);
        });

        this.bot.bot.action(/^confirm_payment_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            await this.processPaymentConfirmation(ctx, transactionId);
        });

        this.bot.bot.action('payment_issues', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                '⚠️ *Problemi con il pagamento?*\n\nScegli un\'opzione:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getPaymentIssuesKeyboard().reply_markup
                }
            );
        });

        this.bot.bot.action('payment_in_progress', async (ctx) => {
            await ctx.answerCbQuery();
            
            await ctx.editMessageText(
                '⏰ **PAGAMENTO IN CORSO**\n\n' +
                'Hai indicato che stai ancora effettuando il pagamento.\n\n' +
                'Una volta completato, torna qui e premi "Ho effettuato il pagamento".',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Ora ho completato il pagamento', callback_data: 'payment_completed' }],
                            [{ text: '❌ Ho ancora problemi', callback_data: 'payment_issues' }],
                            [{ text: '🏠 Torna al menu', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );
        });

        this.bot.bot.action('payment_received', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1].replace(/\\/g, ''); // Rimuovi escape
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            await this.bot.transactionService.updateTransactionStatus(
                transactionId,
                'completed'
            );

            await this.bot.userService.updateUserTransactionStats(
                transaction.sellerId,
                transaction.actualKwh || transaction.declaredKwh,
                'sell'
            );
            await this.bot.userService.updateUserTransactionStats(
                transaction.buyerId,
                transaction.actualKwh || transaction.declaredKwh,
                'buy'
            );

            // NOTIFICA ENTRAMBI GLI UTENTI PER IL FEEDBACK
            
            // 1. Notifica persistente all'ACQUIRENTE
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                    `🎉 **TRANSAZIONE COMPLETATA!**\n\n` +
                    `Il venditore ha confermato la ricezione del pagamento.\n\n` +
                    `⭐ **Lascia un feedback**\n` +
                    `La tua valutazione aiuta la community a crescere.\n\n` +
                    `🔍 ID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⭐ Valuta il venditore', callback_data: `feedback_tx_${transactionId}` }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Error notifying buyer for feedback:', error);
            }

            // 2. Notifica persistente anche al VENDITORE (NUOVO!)
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.sellerId } },
                    `🎉 **TRANSAZIONE COMPLETATA!**\n\n` +
                    `Hai confermato la ricezione del pagamento.\n\n` +
                    `⭐ **Lascia un feedback**\n` +
                    `Valuta l'acquirente per aiutare la community.\n\n` +
                    `🔍 ID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⭐ Valuta l\'acquirente', callback_data: `feedback_tx_${transactionId}` }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Error notifying seller for feedback:', error);
            }

            // 3. Messaggio di conferma nel messaggio corrente
            await ctx.editMessageText(
                '✅ **Pagamento confermato!**\n\n' +
                'La transazione è stata completata con successo.\n' +
                'Entrambi riceverete una notifica per lasciare il feedback reciproco.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );
        });

        this.bot.bot.action('payment_not_received', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1].replace(/\\/g, ''); // Rimuovi escape
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            await this.bot.transactionService.addTransactionIssue(
                transactionId,
                'Pagamento non ricevuto',
                transaction.sellerId
            );
            
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                    '⚠️ *Problema pagamento segnalato*\n\n' +
                    'Il venditore non conferma la ricezione del pagamento.\n\n' +
                    'Cosa vuoi fare?',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: Keyboards.getPaymentIssuesKeyboard().reply_markup
                    }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.editMessageText(
                '⚠️ Problema pagamento segnalato. L\'acquirente riceverà opzioni per risolvere.',
                { reply_markup: undefined }
            );
        });

        this.bot.bot.action('retry_payment', async (ctx) => {
            await ctx.answerCbQuery();
            
            await ctx.editMessageText(
                '💳 *Riprova il pagamento*\n\n' +
                'Effettua nuovamente il pagamento secondo gli accordi presi con il venditore.\n\n' +
                'Una volta completato, usa il pulsante per confermare.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getPaymentConfirmationKeyboard().reply_markup
                }
            );
        });

        this.bot.bot.action('send_payment_proof', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                '📷 *Invia screenshot del pagamento*\n\n' +
                'Scatta uno screenshot che mostri chiaramente:\n' +
                '• Importo inviato\n' +
                '• Data/ora transazione\n' +
                '• Destinatario\n\n' +
                'Invia la foto ora:',
                { parse_mode: 'Markdown', reply_markup: undefined }
            );
            ctx.session.waitingFor = 'payment_proof';
        });

        // Nuovo callback per gestione selezione pagamento specifico
        this.bot.bot.action(/^select_payment_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Transazione non trovata.');
                return;
            }
            
            if (transaction.buyerId !== ctx.from.id) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Non sei autorizzato per questa transazione.');
                return;
            }
            
            const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);
            const amount = announcement && transaction.declaredKwh ? 
                (transaction.declaredKwh * (announcement.price || announcement.basePrice)).toFixed(2) : 'N/A';
            
            // Salva l'ID nella sessione
            ctx.session.currentTransactionId = transactionId;
            
            await ctx.editMessageText(
                `💳 **PROCEDI CON IL PAGAMENTO**\n\n` +
                `🆔 Transazione: \`${transactionId}\`\n` +
                `⚡ KWH confermati: ${transaction.declaredKwh || 'N/A'}\n` +
                `💰 Importo: €${amount}\n` +
                `💳 Metodi accettati: ${MarkdownEscape.escape(announcement?.paymentMethods || 'Come concordato')}\n\n` +
                `Effettua il pagamento secondo i metodi concordati, poi conferma.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getPaymentConfirmationKeyboard().reply_markup
                }
            );
        });

        // CALLBACK PER CONFERME PAGAMENTO DEL VENDITORE
        this.bot.bot.action(/^payment_ok_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Verifica che sia il venditore
            if (ctx.from.id !== transaction.sellerId) {
                await ctx.answerCbQuery('❌ Non sei autorizzato.', { show_alert: true });
                return;
            }
            
            await this.bot.transactionService.updateTransactionStatus(
                transactionId,
                'completed'
            );

            await this.bot.userService.updateUserTransactionStats(
                transaction.sellerId,
                transaction.actualKwh || transaction.declaredKwh,
                'sell'
            );
            await this.bot.userService.updateUserTransactionStats(
                transaction.buyerId,
                transaction.actualKwh || transaction.declaredKwh,
                'buy'
            );

            // Mostra i dettagli finali nel messaggio di conferma
            let completionDetails = '';
            if (transaction.totalAmount) {
                completionDetails = `\n\n💰 **Riepilogo finale:**\n`;
                completionDetails += `• KWH erogati: ${transaction.actualKwh || transaction.declaredKwh}\n`;
                completionDetails += `• Prezzo unitario: ${transaction.pricePerKwh}€/KWH\n`;
                completionDetails += `• Importo totale: €${transaction.totalAmount.toFixed(2)}`;
            }

            // NOTIFICA ENTRAMBI PER IL FEEDBACK
            
            // 1. Notifica all'acquirente
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                    `🎉 **TRANSAZIONE COMPLETATA!**\n\n` +
                    `Il venditore ha confermato la ricezione del pagamento.${completionDetails}\n\n` +
                    `⭐ **Lascia un feedback**\n` +
                    `La tua valutazione aiuta la community a crescere.\n\n` +
                    `🔍 ID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⭐ Valuta il venditore', callback_data: `feedback_tx_${transactionId}` }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Error notifying buyer for feedback:', error);
            }

            // 2. Notifica al venditore
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.sellerId } },
                    `🎉 **TRANSAZIONE COMPLETATA!**\n\n` +
                    `Hai confermato la ricezione del pagamento.${completionDetails}\n\n` +
                    `⭐ **Lascia un feedback**\n` +
                    `Valuta l'acquirente per aiutare la community.\n\n` +
                    `🔍 ID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⭐ Valuta l\'acquirente', callback_data: `feedback_tx_${transactionId}` }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Error notifying seller for feedback:', error);
            }

            // 3. Conferma nel messaggio corrente
            await ctx.editMessageText(
                '✅ **Pagamento confermato!**\n\n' +
                'La transazione è stata completata con successo.\n' +
                'Entrambi riceverete una notifica per lasciare il feedback reciproco.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                        ]
                    }
                }
            );
        });

        this.bot.bot.action(/^payment_fail_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            await this.bot.transactionService.addTransactionIssue(
                transactionId,
                'Pagamento non ricevuto dal venditore',
                transaction.sellerId
            );
            
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                    '⚠️ **PROBLEMA PAGAMENTO**\n\n' +
                    'Il venditore segnala di non aver ricevuto il pagamento.\n\n' +
                    'Controlla il metodo di pagamento e riprova, oppure contatta il venditore direttamente.',
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.editMessageText('⚠️ Problema pagamento segnalato all\'acquirente.');
        });
    }

    setupAnnouncementCallbacks() {
        this.bot.bot.action(/^view_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Annuncio non trovato.');
                return;
            }
            
            const userStats = await this.bot.userService.getUserStats(announcement.userId);
            const detailText = await this.bot.announcementService.formatAnnouncementMessage(
                announcement,
                userStats
            );
            
            // Aggiungi informazioni sulla scadenza
            let expiryInfo = '';
            if (announcement.expiresAt) {
                const timeRemaining = this.bot.announcementService.formatTimeRemaining(announcement.expiresAt);
                expiryInfo = `\n\n⏰ **Scade tra:** ${timeRemaining}`;
            }
            
            await this.bot.chatCleaner.editOrReplace(ctx,
                `📋 **DETTAGLI ANNUNCIO**\n\n${detailText}${expiryInfo}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getAnnouncementActionsKeyboard(announcement).reply_markup,
                    messageType: 'announcement_details'
                }
            );
        });

        this.bot.bot.action(/^delete_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Annuncio non trovato.');
                return;
            }
            
            await ctx.editMessageText(
                '⚠️ **Sei sicuro di voler eliminare questo annuncio?**\n\nQuesta azione è irreversibile.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getConfirmDeleteKeyboard(announcement.announcementId).reply_markup
                }
            );
        });

        this.bot.bot.action(/^confirm_del_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Annuncio non trovato.');
                return;
            }
            
            const deleted = await this.bot.announcementService.deleteAnnouncement(announcement.announcementId, ctx.from.id);
            
            if (deleted) {
                if (announcement.messageId) {
                    try {
                        await ctx.telegram.deleteMessage(this.bot.groupId, announcement.messageId);
                    } catch (error) {
                        console.log('Could not delete announcement from group:', error.description);
                    }
                }
                
                await this.bot.chatCleaner.sendConfirmationMessage(ctx, '✅ Annuncio eliminato con successo.');
                
                setTimeout(async () => {
                    await this.bot.chatCleaner.resetUserChat(ctx);
                }, 3000);
            } else {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Errore durante l\'eliminazione.');
            }
        });

        this.bot.bot.action(/^cancel_del_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Annuncio non trovato.');
                return;
            }
            
            const userStats = await this.bot.userService.getUserStats(announcement.userId);
            const detailText = await this.bot.announcementService.formatAnnouncementMessage(
                announcement,
                userStats
            );
            
            await ctx.editMessageText(
                `📋 **DETTAGLI ANNUNCIO**\n\n${detailText}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getAnnouncementActionsKeyboard(announcement).reply_markup
                }
            );
        });

        this.bot.bot.action(/^stats_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ Annuncio non trovato.');
                return;
            }
            
            const transactions = await this.bot.transactionService.getUserTransactions(ctx.from.id, 'seller');
            const annTransactions = transactions.filter(t => t.announcementId === announcement.announcementId);
            
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
            
            await ctx.editMessageText(statsText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Indietro', callback_data: `view_ann_${shortId}` }
                    ]]
                }
            });
        });

        // NUOVO: Gestione estensione annuncio
        this.bot.bot.action(/^extend_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.reply('❌ Annuncio non trovato.');
                return;
            }
            
            if (announcement.userId !== ctx.from.id) {
                await ctx.reply('❌ Non sei autorizzato.');
                return;
            }
            
            const extended = await this.bot.announcementService.extendAnnouncement(
                announcement.announcementId,
                ctx.from.id
            );
            
            if (extended) {
                await ctx.reply(
                    '✅ **ANNUNCIO ESTESO!**\n\n' +
                    `Il tuo annuncio \`${announcement.announcementId}\` è stato esteso per altre 24 ore.\n\n` +
                    'Nuova scadenza: domani alla stessa ora.',
                    { parse_mode: 'Markdown' }
                );
                
                // Aggiorna il messaggio nel gruppo se esiste
                if (announcement.messageId) {
                    const userStats = await this.bot.userService.getUserStats(announcement.userId);
                    const updatedAnnouncement = await this.bot.announcementService.getAnnouncement(announcement.announcementId);
                    const updatedMessage = this.bot.announcementService.formatAnnouncementForGroup(
                        updatedAnnouncement,
                        userStats
                    );
                    
                    try {
                        await ctx.telegram.editMessageText(
                            this.bot.groupId,
                            announcement.messageId,
                            null,
                            updatedMessage,
                            {
                                parse_mode: 'Markdown',
                                message_thread_id: parseInt(this.bot.topicId),
                                reply_markup: {
                                    inline_keyboard: [[
                                        { 
                                            text: '🛒 Contatta venditore', 
                                            url: `t.me/${process.env.BOT_USERNAME}?start=contact_${announcement.announcementId}` 
                                        }
                                    ]]
                                }
                            }
                        );
                    } catch (error) {
                        console.error('Error updating extended announcement:', error);
                    }
                }
            } else {
                await ctx.reply('❌ Errore nell\'estensione dell\'annuncio.');
            }
        });
        
        // NUOVO: Gestione estensione da notifica con refresh migliorato
        this.bot.bot.action(/^extend_ann_notify_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const announcementId = ctx.match[1];
            
            const extended = await this.bot.announcementService.extendAnnouncement(
                announcementId,
                ctx.from.id
            );
            
            if (extended) {
                // Prima prova ad aggiornare automaticamente
                const announcement = await this.bot.announcementService.getAnnouncement(announcementId);
                let updateSuccess = false;
                
                if (announcement && announcement.messageId) {
                    try {
                        const userStats = await this.bot.userService.getUserStats(announcement.userId);
                        const updatedMessage = this.bot.announcementService.formatAnnouncementForGroup(
                            announcement,
                            userStats
                        );
                        
                        await ctx.telegram.editMessageText(
                            this.bot.groupId,
                            announcement.messageId,
                            null,
                            updatedMessage,
                            {
                                parse_mode: 'Markdown',
                                message_thread_id: parseInt(this.bot.topicId),
                                reply_markup: {
                                    inline_keyboard: [[
                                        { 
                                            text: '🛒 Contatta venditore', 
                                            url: `t.me/${process.env.BOT_USERNAME}?start=contact_${announcementId}` 
                                        }
                                    ]]
                                }
                            }
                        );
                        
                        // Aggiorna lastRefreshedAt
                        await this.bot.announcementService.updateAnnouncement(
                            announcementId,
                            { lastRefreshedAt: new Date() }
                        );
                        
                        updateSuccess = true;
                        
                    } catch (error) {
                        console.error('Auto-update failed:', error);
                    }
                }
                
                // Mostra messaggio appropriato
                if (updateSuccess) {
                    await ctx.editMessageText(
                        '✅ **ANNUNCIO ESTESO E AGGIORNATO!**\n\n' +
                        'Il tuo annuncio è stato esteso per altre 24 ore e il timer nel gruppo è stato aggiornato.',
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    // Se fallisce, suggerisci di farlo dai dettagli
                    await ctx.editMessageText(
                        '✅ **ANNUNCIO ESTESO!**\n\n' +
                        'Il tuo annuncio è stato esteso per altre 24 ore.\n\n' +
                        '💡 Per aggiornare il timer nel gruppo:\n' +
                        '1. Vai in "📊 I miei annunci"\n' +
                        '2. Seleziona questo annuncio\n' +
                        '3. Clicca "🔄 Aggiorna timer" se disponibile',
                        { 
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '📊 Vai ai miei annunci', callback_data: 'my_announcements' }
                                ]]
                            }
                        }
                    );
                }
            } else {
                await ctx.editMessageText('❌ Errore nell\'estensione.');
            }
        });
        
        // NUOVO: Callback per refresh manuale timer
        this.bot.bot.action(/^refresh_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.');
                return;
            }
            
            if (!announcement.messageId) {
                await ctx.editMessageText('❌ Questo annuncio non ha un messaggio nel gruppo.');
                return;
            }
            
            // Mostra loading
            await ctx.editMessageText('🔄 **Aggiornamento timer in corso...**', { parse_mode: 'Markdown' });
            
            const userStats = await this.bot.userService.getUserStats(announcement.userId);
            const updatedMessage = this.bot.announcementService.formatAnnouncementForGroup(
                announcement,
                userStats
            );
            
            try {
                await ctx.telegram.editMessageText(
                    this.bot.groupId,
                    announcement.messageId,
                    null,
                    updatedMessage,
                    {
                        parse_mode: 'Markdown',
                        message_thread_id: parseInt(this.bot.topicId),
                        reply_markup: {
                            inline_keyboard: [[
                                { 
                                    text: '🛒 Contatta venditore', 
                                    url: `t.me/${process.env.BOT_USERNAME}?start=contact_${announcement.announcementId}` 
                                }
                            ]]
                        }
                    }
                );
                
                // Aggiorna lastRefreshedAt
                await this.bot.announcementService.updateAnnouncement(
                    announcement.announcementId,
                    { lastRefreshedAt: new Date() }
                );
                
                // Mostra successo e torna ai dettagli
                await ctx.editMessageText(
                    '✅ **Timer aggiornati!**\n\nIl tuo annuncio nel gruppo ora mostra i timer corretti.',
                    { parse_mode: 'Markdown' }
                );
                
                // Dopo 2 secondi, torna ai dettagli annuncio
                setTimeout(async () => {
                    const updatedAnn = await this.bot.announcementService.getAnnouncement(announcement.announcementId);
                    const detailText = await this.bot.announcementService.formatAnnouncementMessage(
                        updatedAnn,
                        userStats
                    );
                    
                    await ctx.editMessageText(
                        `📋 **DETTAGLI ANNUNCIO**\n\n${detailText}`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: Keyboards.getAnnouncementActionsKeyboard(updatedAnn).reply_markup
                        }
                    );
                }, 2000);
                
            } catch (error) {
                console.error('Refresh error:', error);
                
                let errorMsg = '❌ **Impossibile aggiornare**\n\n';
                if (error.description?.includes('message is not modified')) {
                    errorMsg = '✅ Il messaggio nel gruppo è già aggiornato!';
                } else {
                    errorMsg += 'Il timer verrà aggiornato automaticamente entro 15 minuti.';
                }
                
                await ctx.editMessageText(errorMsg, { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Torna ai dettagli', callback_data: `view_ann_${shortId}` }
                        ]]
                    }
                });
            }
        });
        
        this.bot.bot.action('dismiss_notification', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();
        });
    }

    setupChargingCallbacks() {
        // Gestione attivazione ricarica dal venditore
        this.bot.bot.action(/^activate_charging_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Verifica che sia il venditore
            if (ctx.from.id !== transaction.sellerId) {
                await ctx.answerCbQuery('❌ Non sei autorizzato.', { show_alert: true });
                return;
            }
            
            // Aggiorna lo stato
            await this.bot.transactionService.updateTransactionStatus(
                transactionId,
                'charging_started'
            );
            
            // Notifica l'acquirente
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                    `⚡ **RICARICA ATTIVATA!**\n\n` +
                    `Il venditore ha attivato la ricarica.\n` +
                    `Controlla il connettore e conferma se la ricarica è iniziata.\n\n` +
                    `💡 **Se non sta caricando:**\n` +
                    `• Verifica che il cavo sia inserito bene\n` +
                    `• Controlla che l'auto sia pronta\n` +
                    `• Riprova l'attivazione\n\n` +
                    `ID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ Confermo, sta caricando', callback_data: `charging_ok_${transactionId}` },
                                    { text: '❌ Non sta caricando', callback_data: `charging_fail_${transactionId}` }
                                ]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }
            
            await ctx.editMessageText(
                '⚡ **Ricarica attivata!**\n\n' +
                'Attendi la conferma dell\'acquirente che la ricarica sia iniziata correttamente.',
                { parse_mode: 'Markdown' }
            );
        });

        // Gestione ritardo attivazione
        this.bot.bot.action(/^delay_charging_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            
            setTimeout(async () => {
                try {
                    await this.bot.chatCleaner.sendPersistentMessage(
                        { telegram: ctx.telegram, from: { id: ctx.from.id } },
                        `⏰ **PROMEMORIA**\n\nÈ il momento di attivare la ricarica!\n\nID Transazione: \`${transactionId}\``,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '⚡ Attiva ricarica ORA', callback_data: `activate_charging_${transactionId}` }]
                                ]
                            }
                        }
                    );
                } catch (error) {
                    console.error('Error sending delayed reminder:', error);
                }
            }, 5 * 60 * 1000); // 5 minuti
            
            await ctx.editMessageText(
                '⏸️ **Ricarica rimandata di 5 minuti.**\n\n' +
                'Riceverai un promemoria quando sarà il momento di attivare.',
                { parse_mode: 'Markdown' }
            );
        });

        // Gestione problemi tecnici
        this.bot.bot.action(/^technical_issues_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            await this.bot.transactionService.addTransactionIssue(
                transactionId,
                'Problemi tecnici segnalati dal venditore',
                ctx.from.id
            );
            
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                    `⚠️ **PROBLEMI TECNICI**\n\n` +
                    `Il venditore segnala problemi tecnici con l'attivazione della ricarica.\n\n` +
                    `Attendere ulteriori comunicazioni o contattare il venditore direttamente.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }
            
            await ctx.editMessageText(
                '⚠️ Problema tecnico segnalato all\'acquirente.',
                { parse_mode: 'Markdown' }
            );
        });

        // CALLBACK MANCANTI - Conferma ricarica dall'acquirente
        this.bot.bot.action(/^charging_ok_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Verifica che sia l'acquirente
            if (ctx.from.id !== transaction.buyerId) {
                await ctx.answerCbQuery('❌ Non sei autorizzato.', { show_alert: true });
                return;
            }
            
            // Aggiorna lo stato
            await this.bot.transactionService.updateTransactionStatus(
                transactionId,
                'charging_in_progress'
            );
            
            // Notifica il venditore
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.sellerId } },
                    `✅ **RICARICA CONFERMATA!**\n\n` +
                    `L'acquirente @${MarkdownEscape.escape(ctx.from.username || ctx.from.first_name)} ha confermato che la ricarica è in corso.\n\n` +
                    `⚡ La ricarica sta procedendo correttamente.\n` +
                    `⏳ Attendi che l'acquirente completi la ricarica e invii la foto del display.\n\n` +
                    `🔍 ID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown'
                    }
                );
            } catch (error) {
                console.error('Error notifying seller about charging confirmation:', error);
            }
            
            // Aggiorna il messaggio dell'acquirente
            await ctx.editMessageText(
                '✅ **RICARICA IN CORSO!**\n\n' +
                'Perfetto! La ricarica sta procedendo.\n\n' +
                'Quando hai terminato, usa il bot per inviare la foto del display con i KWH erogati.\n\n' +
                '💡 **Prossimi passi:**\n' +
                '1. Completa la ricarica\n' +
                '2. Scatta foto del display\n' +
                '3. Invia tramite "Gestisci transazione"',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📋 Vai alla transazione', callback_data: `open_tx_${transactionId}` }]
                        ]
                    }
                }
            );
        });

        this.bot.bot.action(/^charging_fail_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Verifica che sia l'acquirente
            if (ctx.from.id !== transaction.buyerId) {
                await ctx.answerCbQuery('❌ Non sei autorizzato.', { show_alert: true });
                return;
            }
            
            const retryCount = await this.bot.transactionService.incrementRetryCount(transactionId);
            
            // Notifica il venditore
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.sellerId } },
                    `❌ **PROBLEMA RICARICA**\n\n` +
                    `L'acquirente segnala che la ricarica non è partita.\n\n` +
                    `🔌 Connettore: ${MarkdownEscape.escape(transaction.connector)}\n` +
                    `📍 Colonnina: ${MarkdownEscape.escape(transaction.brand)}\n` +
                    `🔍 ID Transazione: \`${transactionId}\`\n\n` +
                    `Riprova l'attivazione o verifica il problema.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: Keyboards.getRetryActivationKeyboard(retryCount).reply_markup
                    }
                );
            } catch (error) {
                console.error('Error notifying seller about charging failure:', error);
            }
            
            await ctx.editMessageText(
                '❌ **SEGNALAZIONE INVIATA**\n\n' +
                'Il venditore è stato avvisato del problema e riproverà l\'attivazione.\n\n' +
                'Attendi ulteriori istruzioni.',
                { parse_mode: 'Markdown' }
            );
        });

        // Aggiungi callback per aprire la transazione
        this.bot.bot.action(/^open_tx_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            ctx.session.transactionId = transactionId;
            await this.bot.chatCleaner.enterScene(ctx, 'transactionScene');
        });

        // Callback per gestire i retry del venditore
        this.bot.bot.action('retry_activation', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await ctx.editMessageText('❌ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1];
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Riprova l'attivazione
            await this.bot.transactionService.updateTransactionStatus(
                transactionId,
                'charging_started'
            );
            
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                    `⚡ **NUOVO TENTATIVO DI ATTIVAZIONE**\n\n` +
                    `Il venditore sta riprovando ad attivare la ricarica.\n` +
                    `Controlla se ora funziona.\n\n` +
                    `ID: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ Ora funziona!', callback_data: `charging_ok_${transactionId}` },
                                    { text: '❌ Ancora non carica', callback_data: `charging_fail_${transactionId}` }
                                ]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Error notifying buyer about retry:', error);
            }
            
            await ctx.editMessageText(
                '🔄 **RIATTIVAZIONE IN CORSO**\n\n' +
                'Nuovo tentativo inviato. L\'acquirente verificherà se ora funziona.',
                { parse_mode: 'Markdown' }
            );
        });

        this.bot.bot.action('activate_charging', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1].replace(/\\/g, ''); // Rimuovi escape
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            await this.bot.transactionService.updateTransactionStatus(
                transactionId,
                'charging_started'
            );

            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                    `⚡ *RICARICA ATTIVATA!*\n\n` +
                    `Il venditore ha attivato la ricarica.\n` +
                    `Controlla il connettore e conferma se la ricarica è iniziata.\n\n` +
                    `💡 *Se non sta caricando:*\n` +
                    `• Verifica che il cavo sia inserito bene\n` +
                    `• Controlla che l'auto sia pronta\n` +
                    `• Riprova l'attivazione\n\n` +
                    `ID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: Keyboards.getBuyerChargingConfirmKeyboard().reply_markup
                    }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await this.bot.chatCleaner.sendConfirmationMessage(ctx,
                '⚡ Ricarica attivata!\n\n' +
                'In attesa della conferma dall\'acquirente che la ricarica sia iniziata correttamente.'
            );
        });

        this.bot.bot.action('delay_charging', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            const transactionId = transactionIdMatch ? transactionIdMatch[1].replace(/\\/g, '') : null;
            
            setTimeout(async () => {
                try {
                    let message = '⏰ Promemoria: È il momento di attivare la ricarica!';
                    if (transactionId) {
                        message += `\n\nID Transazione: \`${transactionId}\``;
                    }
                    
                    await this.bot.chatCleaner.sendPersistentMessage(
                        { telegram: ctx.telegram, from: { id: ctx.from.id } },
                        message,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: Keyboards.getActivateChargingKeyboard().reply_markup
                        }
                    );
                } catch (error) {
                    console.error('Error sending delayed reminder:', error);
                }
            }, 5 * 60 * 1000); // 5 minutes

            await this.bot.chatCleaner.sendConfirmationMessage(ctx,
                '⏸️ Ricarica rimandata di 5 minuti.\n\n' +
                'Riceverai un promemoria quando sarà il momento di attivare.'
            );
        });

        this.bot.bot.action('charging_confirmed', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '⚠️ Per continuare, inserisci l\'ID della transazione.');
                return;
            }
            
            const transactionId = transactionIdMatch[1].replace(/\\/g, ''); // Rimuovi escape
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Aggiorna lo stato
            await this.bot.transactionService.updateTransactionStatus(
                transactionId,
                'charging_in_progress'
            );
            
            // Notifica il venditore che la ricarica è in corso
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.sellerId } },
                    `✅ **RICARICA CONFERMATA!**\n\n` +
                    `L'acquirente @${MarkdownEscape.escape(ctx.from.username || ctx.from.first_name)} ha confermato che la ricarica è in corso.\n\n` +
                    `⚡ La ricarica sta procedendo correttamente.\n` +
                    `⏳ Attendi che l'acquirente completi la ricarica e invii la foto del display.\n\n` +
                    `🔍 ID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown'
                    }
                );
            } catch (error) {
                console.error('Error notifying seller:', error);
            }
            
            // Mostra conferma all'acquirente e entra nella scene
            ctx.session.transactionId = transactionId;
            ctx.session.chargingConfirmed = true;
            await this.bot.chatCleaner.enterScene(ctx, 'transactionScene');
        });

        this.bot.bot.action('charging_finished', async (ctx) => {
            await ctx.answerCbQuery();
            
            // Gestisce il pulsante "Ho terminato la ricarica"
            await ctx.editMessageText(
                '📸 **INVIA FOTO DEL DISPLAY**\n\n' +
                'Scatta una foto chiara del display che mostri i KWH erogati.\n\n' +
                '📱 Suggerimenti per la foto:\n' +
                '• Inquadra bene il display\n' +
                '• Assicurati che i numeri siano leggibili\n' +
                '• Evita riflessi sullo schermo',
                { parse_mode: 'Markdown' }
            );
            
            // Imposta lo stato per aspettare la foto
            ctx.session.waitingFor = 'display_photo';
            ctx.session.waitingForDisplayPhoto = true;
        });

        this.bot.bot.action('charging_failed', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '⚠️ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1].replace(/\\/g, ''); // Rimuovi escape
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            const retryCount = await this.bot.transactionService.incrementRetryCount(transactionId);
            
            try {
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.sellerId } },
                    Messages.CHARGING_FAILED_RETRY + `\n\nID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: Keyboards.getRetryActivationKeyboard(retryCount).reply_markup
                    }
                );
            } catch (error) {
                console.error('Error notifying seller:', error);
            }

            await ctx.editMessageText(
                '❌ Segnalazione ricevuta. Il venditore proverà a risolvere il problema.',
                { reply_markup: undefined }
            );
        });

        // KWH validation callbacks - FIX PER I PREZZI GRADUATI
        this.bot.bot.action(/^kwh_ok_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const transaction = await this.bot.findTransactionByShortId(shortId, ctx.from.id);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }

            await this.bot.transactionService.updateTransactionStatus(
                transaction.transactionId,
                'payment_requested'
            );

            const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);

            try {
                // USA I VALORI GIÀ CALCOLATI NELLA TRANSAZIONE
                const amount = transaction.totalAmount ? 
                    transaction.totalAmount.toFixed(2) : 
                    'ERRORE CALCOLO';
                
                // Prepara il messaggio per l'acquirente
                let buyerMessage = `✅ **KWH CONFERMATI DAL VENDITORE**\n\n`;
                
                // Se è stato applicato il minimo, notifica chiaramente l'acquirente
                if (transaction.actualKwh && transaction.actualKwh < transaction.declaredKwh) {
                    buyerMessage += `⚠️ **ATTENZIONE:** Hai ricaricato ${transaction.actualKwh} KWH ma pagherai per il minimo garantito di ${transaction.declaredKwh} KWH come da condizioni dell'annuncio.\n\n`;
                } else {
                    buyerMessage += `Il venditore ha confermato la ricezione di ${transaction.declaredKwh} KWH.\n\n`;
                }
                
                // Aggiungi dettagli sul prezzo se disponibili
                if (transaction.pricePerKwh) {
                    buyerMessage += `💰 **Dettagli pagamento:**\n`;
                    buyerMessage += `• Prezzo unitario: ${transaction.pricePerKwh}€/KWH\n`;
                    
                    if (announcement?.pricingType === 'graduated' && transaction.appliedTier) {
                        buyerMessage += `• Fascia applicata: `;
                        if (transaction.appliedTier.limit) {
                            buyerMessage += `fino a ${transaction.appliedTier.limit} KWH\n`;
                        } else {
                            buyerMessage += `oltre ${announcement.pricingTiers[announcement.pricingTiers.length - 2].limit} KWH\n`;
                        }
                    }
                    
                    buyerMessage += `• **Totale da pagare: €${amount}**\n\n`;
                } else {
                    buyerMessage += `💰 **Importo totale: €${amount}**\n\n`;
                }
                
                buyerMessage += `💳 **Procedi con il pagamento**\n` +
                    `Metodi accettati: ${MarkdownEscape.escape(announcement?.paymentMethods || 'Come concordato')}\n\n` +
                    `Una volta effettuato il pagamento, premi il pulsante qui sotto.\n\n` +
                    `🔍 ID Transazione: \`${transaction.transactionId}\``;
                
                await this.bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: transaction.buyerId } },
                    buyerMessage,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: Keyboards.getPaymentConfirmationKeyboard().reply_markup
                    }
                );

                // Salva l'ID transazione nella sessione per il pagamento
                ctx.session.currentTransactionId = transaction.transactionId;

            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.editMessageText(
                '✅ KWH confermati! L\'acquirente è stato invitato a procedere con il pagamento.',
                { reply_markup: undefined }
            );
        });

        this.bot.bot.action(/^kwh_bad_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            await ctx.editMessageText(
                '📝 *KWH non corretti*\n\n' +
                'Specifica il problema:\n' +
                '• Quanti KWH mostra realmente la foto?\n' +
                '• Qual è il problema riscontrato?',
                { parse_mode: 'Markdown' }
            );
            
            ctx.session.disputingKwh = true;
            ctx.session.disputeTransactionId = shortId;
            ctx.session.waitingFor = 'kwh_dispute_reason';
        });
    }

    setupFeedbackCallbacks() {
        // CALLBACK PER FEEDBACK ESTERNI (DA MESSAGGI NOTIFICA)
        this.bot.bot.action(/^feedback_tx_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const transactionId = ctx.match[1];
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            // Verifica che l'utente sia parte della transazione
            if (ctx.from.id !== transaction.buyerId && ctx.from.id !== transaction.sellerId) {
                await ctx.answerCbQuery('❌ Non sei autorizzato.', { show_alert: true });
                return;
            }
            
            ctx.session.completedTransactionId = transactionId;
            
            await ctx.editMessageText(
                Messages.FEEDBACK_REQUEST,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getFeedbackKeyboard().reply_markup
                }
            );
        });

        this.bot.bot.action(/^feedback_([1-5])$/, async (ctx) => {
            const rating = parseInt(ctx.match[1]);
            await ctx.answerCbQuery();
            
            let transactionId;
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (transactionIdMatch) {
                transactionId = transactionIdMatch[1].replace(/\\/g, ''); // Rimuovi escape
            } else if (ctx.session.completedTransactionId) {
                transactionId = ctx.session.completedTransactionId;
            } else {
                await this.bot.chatCleaner.sendErrorMessage(ctx, '❌ ID transazione non trovato.');
                return;
            }
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            const isSellerGivingFeedback = ctx.from.id === transaction.sellerId;
            const targetUserId = isSellerGivingFeedback ? transaction.buyerId : transaction.sellerId;

            if (rating <= 2) {
                await ctx.editMessageText(Messages.NEGATIVE_FEEDBACK_REASON, { reply_markup: undefined });
                ctx.session.waitingFor = 'feedback_reason';
                ctx.session.feedbackRating = rating;
                ctx.session.feedbackTargetUserId = targetUserId;
                ctx.session.transaction = transaction;
            } else {
                await this.bot.transactionService.createFeedback(
                    transactionId,
                    ctx.from.id,
                    targetUserId,
                    rating,
                    ''
                );

                await this.bot.chatCleaner.sendConfirmationMessage(ctx,
                    '⭐ Grazie per il feedback!\n\n' +
                    'La transazione è stata completata con successo.'
                );

                delete ctx.session.completedTransactionId;
                
                setTimeout(async () => {
                    await this.bot.chatCleaner.resetUserChat(ctx);
                }, 3000);
            }
        });
    }

    setupHelpCallbacks() {
        this.bot.bot.action('help_selling', async (ctx) => {
            await ctx.answerCbQuery();
            const helpText = `📋 **COME VENDERE KWH**\n\n` +
                `1️⃣ **Crea annuncio:** Clicca "🔋 Vendi KWH"\n` +
                `2️⃣ **Inserisci dati:** Prezzo, tipo corrente, zone, reti\n` +
                `3️⃣ **Pubblico automatico:** L'annuncio appare nel topic\n` +
                `4️⃣ **Ricevi richieste:** Ti notifichiamo ogni interesse\n` +
                `5️⃣ **Gestisci transazione:** Attivi ricarica e confermi pagamento\n\n` +
                `💡 **Suggerimenti:**\n` +
                `• Prezzo competitivo: 0,30-0,40€/KWH\n` +
                `• Rispondi velocemente alle richieste\n` +
                `• Mantieni alta la qualità del servizio`;
            
            await ctx.editMessageText(helpText, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
            });
        });

        this.bot.bot.action('help_buying', async (ctx) => {
            await ctx.answerCbQuery();
            const helpText = `🛒 **COME COMPRARE KWH**\n\n` +
                `1️⃣ **Trova annuncio:** Vai nel topic annunci\n` +
                `2️⃣ **Contatta venditore:** Clicca "Contatta venditore"\n` +
                `3️⃣ **Fornisci dettagli:** Data, colonnina, connettore\n` +
                `4️⃣ **Attendi conferma:** Il venditore deve accettare\n` +
                `5️⃣ **Conferma arrivo:** Quando sei alla colonnina\n` +
                `6️⃣ **Ricarica:** Segui le istruzioni per l'attivazione\n` +
                `7️⃣ **Foto display:** Scatta foto dei KWH ricevuti\n` +
                `8️⃣ **Pagamento:** Paga come concordato\n` +
                `9️⃣ **Feedback:** Lascia una valutazione\n\n` +
                `💡 **Suggerimenti:**\n` +
                `• Verifica sempre i dettagli prima di confermare\n` +
                `• Scatta foto nitide del display\n` +
                `• Paga solo dopo conferma del venditore`;
            
            await ctx.editMessageText(helpText, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
            });
        });

        this.bot.bot.action('help_feedback', async (ctx) => {
            await ctx.answerCbQuery();
            const helpText = `⭐ **SISTEMA FEEDBACK**\n\n` +
                `🌟 **Come funziona:**\n` +
                `• Ogni transazione richiede feedback reciproco\n` +
                `• Scala 1-5 stelle (1=pessimo, 5=ottimo)\n` +
                `• Feedback <3 stelle richiedono motivazione\n\n` +
                `🏆 **Badge Venditore:**\n` +
                `• >90% positivi = VENDITORE AFFIDABILE ✅\n` +
                `• >95% positivi = VENDITORE TOP 🌟\n\n` +
                `📊 **Vantaggi feedback alto:**\n` +
                `• Maggiore visibilità negli annunci\n` +
                `• Più richieste di acquisto\n` +
                `• Maggiore fiducia degli acquirenti\n\n` +
                `⚖️ **Feedback equo:**\n` +
                `Lascia feedback onesto e costruttivo per aiutare la community.`;
            
            await ctx.editMessageText(helpText, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
            });
        });

        this.bot.bot.action('help_faq', async (ctx) => {
            await ctx.answerCbQuery();
            const faqText = `❓ **DOMANDE FREQUENTI**\n\n` +
                `❓ **Come funziona il sistema di pagamento?**\n` +
                `Il pagamento avviene direttamente tra venditore e acquirente tramite i metodi indicati nell'annuncio.\n\n` +
                `❓ **Cosa succede se la ricarica non funziona?**\n` +
                `Il bot offre diverse opzioni: riprovare, cambiare connettore, trovare colonnina alternativa o contattare l'admin.\n\n` +
                `❓ **Come ottengo i badge venditore?**\n` +
                `• >90% feedback positivi = VENDITORE AFFIDABILE\n` +
                `• >95% feedback positivi = VENDITORE TOP\n\n` +
                `❓ **Posso modificare un annuncio pubblicato?**\n` +
                `No, ma puoi crearne uno nuovo che sostituirà automaticamente il precedente.\n\n` +
                `❓ **Il bot supporta tutte le reti di ricarica?**\n` +
                `Dipende dall'accesso del venditore. Ogni annuncio specifica le reti disponibili.`;
            
            await ctx.editMessageText(faqText, {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
            });
        });

        this.bot.bot.action('contact_admin', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `📞 **CONTATTA ADMIN**\n\n` +
                `Per supporto diretto contatta:\n` +
                `👤 @${MarkdownEscape.escape(process.env.ADMIN_USERNAME || 'amministratore')}\n\n` +
                `🚨 **Per emergenze:**\n` +
                `Usa il pulsante "Chiama admin" durante le transazioni.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getBackToMainMenuKeyboard().reply_markup
                }
            );
        });
    }

    setupBuyEnergyCallbacks() {
        // Gestione acquisto energia
        this.bot.bot.action('buy_energy', async (ctx) => {
            await ctx.answerCbQuery();
            
            const announcements = await this.bot.announcementService.getActiveAnnouncements(20);
            
            if (announcements.length === 0) {
                await ctx.editMessageText(
                    '📭 **NESSUNA OFFERTA DISPONIBILE**\n\nNon ci sono offerte al momento.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔋 Vendi tu energia', callback_data: 'sell_energy' }],
                                [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                            ]
                        }
                    }
                );
                return;
            }

            let message = '🛒 **OFFERTE DISPONIBILI**\n\n';
            const keyboard = [];

            for (const ann of announcements) {
                // Salta annunci propri
                if (ann.userId === ctx.from.id || (ann.userId.userId && ann.userId.userId === ctx.from.id)) continue;

                // Formatta il testo del bottone con posizione abbreviata
                let buttonText = `📍 ${ann.location.substring(0, 20)}`;
                if (ann.location.length > 20) buttonText += '...';
                
                if (ann.pricingType === 'fixed') {
                    buttonText += ` - ${ann.basePrice || ann.price}€/KWH`;
                } else if (ann.pricingTiers && ann.pricingTiers.length > 0) {
                    buttonText += ` - da ${ann.pricingTiers[0].price}€`;
                }

                const shortId = this.bot.transactionCache.TransactionCache.generateShortId(ann.announcementId);
                this.bot.transactionCache.setAnnouncement(shortId, ann.announcementId);

                keyboard.push([{
                    text: buttonText,
                    callback_data: `view_offer_${shortId}`
                }]);
            }

            if (keyboard.length === 0) {
                await ctx.editMessageText(
                    '📭 **Nessuna offerta disponibile per te**\n\nTutti gli annunci sono tuoi.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]
                            ]
                        }
                    }
                );
                return;
            }

            keyboard.push([{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]);

            message += 'Seleziona un\'offerta per i dettagli:';
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        });

        // Visualizza dettagli offerta
        this.bot.bot.action(/^view_offer_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            const announcementId = this.bot.transactionCache.getAnnouncement(shortId);
            
            const announcement = await this.bot.announcementService.getAnnouncement(announcementId);
            if (!announcement) {
                await ctx.editMessageText('❌ Offerta non trovata.');
                return;
            }

            const userStats = await this.bot.userService.getUserStats(announcement.userId);
            
            // Usa il metodo che formatta con posizione copiabile
            let message = await this.bot.announcementService.formatAnnouncementMessage(
                announcement,
                userStats
            );

            // Aggiungi esempi di prezzo
            const Messages = require('../utils/Messages');
            message += '\n\n' + Messages.formatPriceExamples(announcement);

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛒 Procedi con l\'acquisto', callback_data: `buy_from_${shortId}` }],
                        [{ text: '🔙 Torna alle offerte', callback_data: 'buy_energy' }]
                    ]
                }
            });
        });

        // Inizia processo acquisto
        this.bot.bot.action(/^buy_from_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            const announcementId = this.bot.transactionCache.getAnnouncement(shortId);
            
            ctx.session.announcementId = announcementId;
            await ctx.scene.enter('contactSellerScene');
        });
        
        // Callback per sell_energy
        this.bot.bot.action('sell_energy', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.scene.enter('sellAnnouncementScene');
        });
    }

    // Helper method per processare la conferma del pagamento
    async processPaymentConfirmation(ctx, transactionId) {
        const transaction = await this.bot.transactionService.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText(`❌ Transazione non trovata con ID: \`${transactionId}\``);
            return;
        }
        
        if (transaction.buyerId !== ctx.from.id) {
            await ctx.editMessageText('❌ Non sei autorizzato per questa transazione.');
            return;
        }
        
        // USA L'IMPORTO GIÀ CALCOLATO NELLA TRANSAZIONE
        const amount = transaction.totalAmount ? 
            transaction.totalAmount.toFixed(2) : 
            'ERRORE CALCOLO';
        
        try {
            // Messaggio importante per il seller - mantieni persistente
            await this.bot.chatCleaner.sendPersistentMessage(
                { telegram: ctx.telegram, from: { id: transaction.sellerId } },
                `💳 **DICHIARAZIONE PAGAMENTO**\n\n` +
                `L'acquirente @${MarkdownEscape.escape(ctx.from.username || ctx.from.first_name)} dichiara di aver pagato.\n\n` +
                `💰 Importo dichiarato: €${amount}\n` +
                `⚡ KWH forniti: ${transaction.declaredKwh || 'N/A'}\n` +
                `💰 Prezzo unitario: ${transaction.pricePerKwh || 'N/A'}€/KWH\n` +
                `🔍 ID Transazione: \`${transactionId}\`\n\n` +
                `Hai ricevuto il pagamento?`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getSellerPaymentConfirmKeyboard().reply_markup
                }
            );
            
            console.log('Payment confirmation sent to seller for transaction:', transactionId);
            
        } catch (error) {
            console.error('Error notifying seller:', error);
        }

        // Messaggio di conferma che si auto-elimina
        await ctx.editMessageText(
            `✅ **DICHIARAZIONE PAGAMENTO INVIATA!**\n\n` +
            `🆔 Transazione: \`${transactionId}\`\n` +
            `⚡ KWH: ${transaction.declaredKwh}\n` +
            `💰 Importo: €${amount}\n\n` +
            `Il venditore riceverà una notifica e dovrà confermare la ricezione del pagamento.\n\n` +
            `Riceverai aggiornamenti sullo stato della transazione.`,
            { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🏠 Torna al menu', callback_data: 'back_to_main' }
                    ]]
                }
            }
        );
    }

    // Helper per verificare se un annuncio necessita refresh
    needsGroupRefresh(announcement) {
        if (!announcement.lastRefreshedAt || !announcement.updatedAt) return false;
        
        // Se è stato esteso ma non refreshato nel gruppo
        const extendedRecently = announcement.updatedAt > announcement.lastRefreshedAt;
        const timeSinceUpdate = Date.now() - announcement.updatedAt.getTime();
        const lessThan1Hour = timeSinceUpdate < 60 * 60 * 1000;
        
        return extendedRecently && lessThan1Hour;
    }
}

module.exports = CallbackHandler;
