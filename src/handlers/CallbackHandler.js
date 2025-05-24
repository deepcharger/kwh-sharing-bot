const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

class CallbackHandler {
    constructor(bot) {
        this.bot = bot;
    }

    setupCallbacks() {
        // Admin callbacks
        this.setupAdminCallbacks();
        
        // Navigation callbacks
        this.setupNavigationCallbacks();
        
        // Transaction management callbacks
        this.setupTransactionCallbacks();
        
        // Payment callbacks - FIX PRINCIPALE
        this.setupPaymentCallbacks();
        
        // Announcement callbacks
        this.setupAnnouncementCallbacks();
        
        // Charging callbacks
        this.setupChargingCallbacks();
        
        // Feedback callbacks
        this.setupFeedbackCallbacks();
        
        // Help callbacks
        this.setupHelpCallbacks();
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
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.bot.action('admin_pending_transactions', async (ctx) => {
            await ctx.answerCbQuery();
            const pendingTransactions = await this.bot.transactionService.getPendingTransactions();
            
            if (pendingTransactions.length === 0) {
                await ctx.editMessageText(
                    '✅ **Nessuna transazione in sospeso**\n\nTutte le transazioni sono aggiornate!',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            let message = '⏳ **TRANSAZIONI IN SOSPESO:**\n\n';
            for (const tx of pendingTransactions.slice(0, 10)) {
                message += `🆔 ${tx.transactionId}\n`;
                message += `📊 Status: ${tx.status}\n`;
                message += `📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            if (pendingTransactions.length > 10) {
                message += `\n... e altre ${pendingTransactions.length - 10} transazioni`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.bot.action('admin_open_disputes', async (ctx) => {
            await ctx.answerCbQuery();
            const disputedTransactions = await this.bot.transactionService.getUserTransactions(null, 'all');
            const disputes = disputedTransactions.filter(tx => tx.status === 'disputed' || tx.issues?.length > 0);
            
            if (disputes.length === 0) {
                await ctx.editMessageText(
                    '✅ **Nessuna disputa aperta**\n\nTutte le transazioni procedono regolarmente!',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            let message = '⚠️ **DISPUTE APERTE:**\n\n';
            for (const dispute of disputes.slice(0, 5)) {
                message += `🆔 ${dispute.transactionId}\n`;
                message += `⚠️ Issues: ${dispute.issues?.length || 0}\n`;
                message += `📅 ${dispute.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
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
                    message += `${index + 1}. @${user.username || 'utente'} (${user.positivePercentage}%)\n`;
                });
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.bot.action('admin_active_announcements', async (ctx) => {
            await ctx.answerCbQuery();
            const activeAnnouncements = await this.bot.announcementService.getActiveAnnouncements(20);
            
            if (activeAnnouncements.length === 0) {
                await ctx.editMessageText(
                    '📭 **Nessun annuncio attivo**\n\nIl marketplace è vuoto al momento.',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            let message = '📋 **ANNUNCI ATTIVI:**\n\n';
            for (const ann of activeAnnouncements.slice(0, 10)) {
                message += `💰 ${ann.price}€/KWH - ${ann.zones}\n`;
                message += `📅 ${ann.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            if (activeAnnouncements.length > 10) {
                message += `\n... e altri ${activeAnnouncements.length - 10} annunci`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });
    }

    setupNavigationCallbacks() {
        this.bot.bot.action('back_to_main', async (ctx) => {
            await ctx.answerCbQuery();
            if (ctx.scene) {
                await ctx.scene.leave();
            }
            await ctx.deleteMessage();
            await ctx.reply(
                '🏠 **Menu Principale**\n\nSeleziona un\'opzione:',
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.MAIN_MENU
                }
            );
        });

        // FIX: Rimosso callback back_to_payments ridondante

        this.bot.bot.action('back_to_txs', async (ctx) => {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const allTransactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
            const pending = allTransactions.filter(t => !['completed', 'cancelled'].includes(t.status));
            const completed = allTransactions.filter(t => t.status === 'completed');

            let message = '💼 **LE TUE TRANSAZIONI**\n\n';
            
            if (pending.length > 0) {
                message += `⏳ **IN CORSO (${pending.length}):**\n`;
                for (const tx of pending.slice(0, 5)) {
                    const statusEmoji = this.bot.getStatusEmoji(tx.status);
                    const statusText = this.bot.getStatusText(tx.status);
                    const displayId = tx.transactionId.length > 15 ? 
                        tx.transactionId.substring(2, 12) + '...' : 
                        tx.transactionId;
                    message += `${statusEmoji} ${displayId}\n`;
                    message += `📊 ${statusText}\n`;
                    message += `📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n\n`;
                }
            }
            
            message += `✅ **Completate:** ${completed.length}`;
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getTransactionsKeyboard(pending, completed)
            });
        });

        this.bot.bot.action('my_announcements', async (ctx) => {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            const announcements = await this.bot.announcementService.getUserAnnouncements(userId);
            
            if (announcements.length === 0) {
                await ctx.editMessageText('📭 Non hai ancora pubblicato annunci.');
                setTimeout(() => {
                    ctx.deleteMessage().catch(() => {});
                    ctx.reply('Usa il menu per pubblicare un annuncio:', Keyboards.MAIN_MENU);
                }, 2000);
                return;
            }

            let message = '📊 <b>I TUOI ANNUNCI ATTIVI:</b>\n\n';
            for (const ann of announcements) {
                message += `🆔 ${ann.announcementId}\n`;
                message += `💰 ${ann.price}€/KWH\n`;
                message += `📅 Pubblicato: ${ann.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                ...Keyboards.getUserAnnouncementsKeyboard(announcements)
            });
        });

        this.bot.bot.action('tx_history', async (ctx) => {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const transactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
            const completed = transactions.filter(t => t.status === 'completed');
            const cancelled = transactions.filter(t => t.status === 'cancelled');
            
            let message = '📜 **CRONOLOGIA TRANSAZIONI**\n\n';
            
            if (completed.length > 0) {
                message += `✅ **COMPLETATE (${completed.length}):**\n`;
                completed.slice(-10).reverse().forEach(tx => {
                    const displayId = tx.transactionId.length > 20 ? 
                        tx.transactionId.substring(2, 17) + '...' : 
                        tx.transactionId;
                    message += `• ${displayId}\n`;
                    message += `  📅 ${tx.completedAt ? tx.completedAt.toLocaleDateString('it-IT') : tx.createdAt.toLocaleDateString('it-IT')}\n`;
                });
                message += '\n';
            }
            
            if (cancelled.length > 0) {
                message += `❌ **ANNULLATE (${cancelled.length}):**\n`;
                cancelled.slice(-5).reverse().forEach(tx => {
                    const displayId = tx.transactionId.length > 20 ? 
                        tx.transactionId.substring(2, 17) + '...' : 
                        tx.transactionId;
                    message += `• ${displayId}\n`;
                    message += `  📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n`;
                });
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });
    }

    setupTransactionCallbacks() {
        // Transaction requests handling
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
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `✅ *Richiesta accettata!*\n\n` +
                    `Il venditore ha confermato la tua richiesta per ${transaction.scheduledDate}.\n` +
                    `Ti avviseremo quando sarà il momento della ricarica.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.editMessageText(
                '✅ Richiesta accettata! L\'acquirente è stato notificato.\n\n' +
                'Riceverai una notifica quando sarà il momento di attivare la ricarica.',
                { parse_mode: 'Markdown' }
            );
            
            // Schedule reminder for charging time
            setTimeout(async () => {
                try {
                    await ctx.telegram.sendMessage(
                        transaction.sellerId,
                        `⏰ È il momento di attivare la ricarica!\n\n` +
                        `ID Transazione: \`${transactionId}\`\n` +
                        `Data/ora: ${transaction.scheduledDate}\n` +
                        `Colonnina: ${transaction.brand}\n` +
                        `Posizione: ${transaction.location}`,
                        {
                            parse_mode: 'Markdown',
                            ...Keyboards.getActivateChargingKeyboard()
                        }
                    );
                } catch (error) {
                    console.error('Error sending charging reminder:', error);
                }
            }, 30000); // 30 seconds for testing
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
                await ctx.reply(
                    message +
                    `Puoi contattare direttamente @${buyerUsername} cliccando qui:\n` +
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
                    }
                );
            } else {
                await ctx.reply(
                    message +
                    `L'utente non ha un username pubblico.\n` +
                    `ID Utente: \`${buyerId}\`\n\n` +
                    `Puoi provare a contattarlo tramite il link:\n${telegramLink}\n\n` +
                    `Oppure attendi che ti contatti lui.`,
                    { 
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true 
                    }
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
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            const transaction = pending[index];
            const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);
            const detailText = this.bot.formatTransactionDetails(transaction, announcement, userId);
            
            const shortId = transaction.transactionId.slice(-10);
            this.bot.cacheTransactionId(shortId, transaction.transactionId);
            
            await ctx.editMessageText(detailText, {
                parse_mode: 'Markdown',
                ...Keyboards.getTransactionActionsKeyboard(transaction.transactionId, transaction.status, userId === transaction.sellerId)
            });
        });

        this.bot.bot.action(/^manage_tx_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const transaction = await this.bot.findTransactionByShortId(shortId, ctx.from.id);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            ctx.session.transactionId = transaction.transactionId;
            await ctx.scene.enter('transactionScene');
        });
    }

    setupPaymentCallbacks() {
        // FIX PRINCIPALE: Nuovo sistema di pagamento senza inserimento manuale ID
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
                // Cerca nelle transazioni dell'utente in stato payment_requested
                const userId = ctx.from.id;
                const transactions = await this.bot.transactionService.getUserTransactions(userId, 'all');
                const paymentPending = transactions.filter(t => 
                    t.status === 'payment_requested' && t.buyerId === userId
                );
                
                if (paymentPending.length === 1) {
                    // Se c'è solo una transazione in attesa di pagamento, usa quella
                    transactionId = paymentPending[0].transactionId;
                } else if (paymentPending.length > 1) {
                    // Se ci sono più transazioni, mostra una lista per scegliere
                    await ctx.editMessageText(
                        '💳 **HAI PIÙ PAGAMENTI IN SOSPESO**\n\n' +
                        'Seleziona la transazione per cui hai effettuato il pagamento:',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: paymentPending.map((tx, index) => [{
                                    text: `💰 ${tx.transactionId.slice(-10)} - ${tx.declaredKwh || '?'} KWH`,
                                    callback_data: `confirm_payment_${tx.transactionId}`
                                }])
                            }
                        }
                    );
                    return;
                }
            }
            
            if (!transactionId) {
                await ctx.editMessageText(
                    '❌ **Errore: transazione non identificata**\n\n' +
                    'Non riesco a trovare la transazione per cui confermare il pagamento.\n' +
                    'Contatta il venditore direttamente per risolvere.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🏠 Menu principale', callback_data: 'back_to_main' }
                            ]]
                        }
                    }
                );
                return;
            }
            
            await this.processPaymentConfirmation(ctx, transactionId);
        });

        // FIX: Nuovo callback per conferma pagamento specifico
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
                    ...Keyboards.getPaymentIssuesKeyboard()
                }
            );
        });

        this.bot.bot.action('payment_received', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await ctx.reply('❌ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1];
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

            try {
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    Messages.TRANSACTION_COMPLETED + '\n\n' + Messages.FEEDBACK_REQUEST,
                    Keyboards.getFeedbackKeyboard()
                );
                
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `🔍 ID Transazione: \`${transactionId}\``,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.editMessageText(
                Messages.TRANSACTION_COMPLETED + '\n\n' + Messages.FEEDBACK_REQUEST,
                Keyboards.getFeedbackKeyboard()
            );
            
            ctx.session.completedTransactionId = transactionId;
        });

        this.bot.bot.action('payment_not_received', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await ctx.reply('❌ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1];
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
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    '⚠️ *Problema pagamento segnalato*\n\n' +
                    'Il venditore non conferma la ricezione del pagamento.\n\n' +
                    'Cosa vuoi fare?',
                    {
                        parse_mode: 'Markdown',
                        ...Keyboards.getPaymentIssuesKeyboard()
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
                    ...Keyboards.getPaymentConfirmationKeyboard()
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
    }

    setupAnnouncementCallbacks() {
        this.bot.bot.action(/^view_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.', { reply_markup: undefined });
                return;
            }
            
            const userStats = await this.bot.userService.getUserStats(announcement.userId);
            const detailText = await this.bot.announcementService.formatAnnouncementMessage(
                { ...announcement, username: ctx.from.username },
                userStats
            );
            
            const escapedText = detailText.replace(/_/g, '\\_');
            
            await ctx.editMessageText(
                `📋 **DETTAGLI ANNUNCIO**\n\n${escapedText}`,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getAnnouncementActionsKeyboard(announcement.announcementId)
                }
            );
        });

        this.bot.bot.action(/^delete_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.');
                return;
            }
            
            await ctx.editMessageText(
                '⚠️ **Sei sicuro di voler eliminare questo annuncio?**\n\nQuesta azione è irreversibile.',
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getConfirmDeleteKeyboard(announcement.announcementId)
                }
            );
        });

        this.bot.bot.action(/^confirm_del_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.');
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
                
                await ctx.editMessageText('✅ Annuncio eliminato con successo.');
                setTimeout(() => {
                    ctx.deleteMessage().catch(() => {});
                    ctx.reply('Usa il menu per altre operazioni:', Keyboards.MAIN_MENU);
                }, 2000);
            } else {
                await ctx.editMessageText('❌ Errore durante l\'eliminazione.');
            }
        });

        this.bot.bot.action(/^cancel_del_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.');
                return;
            }
            
            const userStats = await this.bot.userService.getUserStats(announcement.userId);
            const detailText = await this.bot.announcementService.formatAnnouncementMessage(
                { ...announcement, username: ctx.from.username },
                userStats
            );
            
            const escapedText = detailText.replace(/_/g, '\\_');
            
            await ctx.editMessageText(
                `📋 **DETTAGLI ANNUNCIO**\n\n${escapedText}`,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getAnnouncementActionsKeyboard(announcement.announcementId)
                }
            );
        });

        this.bot.bot.action(/^stats_ann_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const shortId = ctx.match[1];
            
            const announcement = await this.bot.findAnnouncementByShortId(shortId, ctx.from.id);
            if (!announcement) {
                await ctx.editMessageText('❌ Annuncio non trovato.');
                return;
            }
            
            const transactions = await this.bot.transactionService.getUserTransactions(ctx.from.id, 'seller');
            const annTransactions = transactions.filter(t => t.announcementId === announcement.announcementId);
            
            let statsText = `📊 **STATISTICHE ANNUNCIO**\n\n`;
            statsText += `🆔 ID: ${announcement.announcementId}\n\n`;
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
    }

    setupChargingCallbacks() {
        this.bot.bot.action('activate_charging', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await ctx.reply('❌ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1];
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
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
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
                        ...Keyboards.getBuyerChargingConfirmKeyboard()
                    }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.editMessageText(
                '⚡ Ricarica attivata!\n\n' +
                'In attesa della conferma dall\'acquirente che la ricarica sia iniziata correttamente.',
                { parse_mode: 'Markdown' }
            );
        });

        this.bot.bot.action('delay_charging', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            const transactionId = transactionIdMatch ? transactionIdMatch[1] : null;
            
            setTimeout(async () => {
                try {
                    let message = '⏰ Promemoria: È il momento di attivare la ricarica!';
                    if (transactionId) {
                        message += `\n\nID Transazione: \`${transactionId}\``;
                    }
                    
                    await ctx.telegram.sendMessage(
                        ctx.from.id,
                        message,
                        {
                            parse_mode: 'Markdown',
                            ...Keyboards.getActivateChargingKeyboard()
                        }
                    );
                } catch (error) {
                    console.error('Error sending delayed reminder:', error);
                }
            }, 5 * 60 * 1000); // 5 minutes

            await ctx.editMessageText(
                '⏸️ Ricarica rimandata di 5 minuti.\n\n' +
                'Riceverai un promemoria quando sarà il momento di attivare.',
                { parse_mode: 'Markdown' }
            );
        });

        this.bot.bot.action('technical_issues', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            const transactionId = transactionIdMatch ? transactionIdMatch[1] : null;
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🔌 Colonnina non risponde', callback_data: `issue_charger_${transactionId}` }],
                    [{ text: '❌ Errore attivazione', callback_data: `issue_activation_${transactionId}` }],
                    [{ text: '📱 Problema app', callback_data: `issue_app_${transactionId}` }],
                    [{ text: '📞 Contatta admin', callback_data: `call_admin_${transactionId}` }]
                ]
            };
            
            await ctx.editMessageText(
                '⚠️ *Problemi tecnici rilevati*\n\n' +
                'Seleziona il tipo di problema:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        });

        this.bot.bot.action(/^issue_(charger|activation|app)_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const issueType = ctx.match[1];
            const transactionId = ctx.match[2];
            
            if (!transactionId || transactionId === 'null') {
                await ctx.reply('❌ ID transazione non trovato.');
                return;
            }
            
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            await this.bot.transactionService.addTransactionIssue(
                transactionId,
                `Problema: ${issueType}`,
                ctx.from.id
            );
            
            try {
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `⚠️ *Problema tecnico segnalato*\n\n` +
                    `Il venditore sta riscontrando problemi con: ${issueType}\n` +
                    `Sta lavorando per risolverlo.\n\n` +
                    `Ti terremo aggiornato.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }
            
            await ctx.editMessageText(
                '📝 Problema registrato.\n\n' +
                'L\'acquirente è stato informato. Riprova l\'attivazione quando possibile.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔄 Riprova attivazione', callback_data: `retry_activation_${transactionId}` }
                        ]]
                    }
                }
            );
        });

        this.bot.bot.action(/^retry_activation_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            
            await ctx.editMessageText(
                '🔄 Riprova ad attivare la ricarica quando sei pronto.\n\n' +
                `ID Transazione: \`${transactionId}\``,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getActivateChargingKeyboard()
                }
            );
        });

        this.bot.bot.action(/^call_admin_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            
            const transactionId = ctx.match[1];
            
            if (!transactionId || transactionId === 'null') {
                await ctx.reply('❌ ID transazione non trovato.');
                return;
            }
            
            const adminMessage = Messages.formatAdminAlert(
                transactionId,
                'Richiesta aiuto per problemi tecnici',
                ctx.from.username || ctx.from.first_name
            );

            try {
                await ctx.telegram.sendMessage(
                    this.bot.adminUserId,
                    adminMessage,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying admin:', error);
            }

            await ctx.editMessageText(
                '📞 Admin contattato!\n\n' +
                'Un amministratore ti aiuterà il prima possibile.',
                { parse_mode: 'Markdown' }
            );
        });

        this.bot.bot.action('charging_confirmed', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await ctx.reply('⚠️ Per continuare, inserisci l\'ID della transazione.');
                return;
            }
            
            const transactionId = transactionIdMatch[1];
            ctx.session.transactionId = transactionId;
            ctx.session.chargingConfirmed = true;
            await ctx.scene.enter('transactionScene');
        });

        this.bot.bot.action('charging_failed', async (ctx) => {
            await ctx.answerCbQuery();
            
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (!transactionIdMatch) {
                await ctx.reply('⚠️ ID transazione non trovato.');
                return;
            }
            
            const transactionId = transactionIdMatch[1];
            const transaction = await this.bot.transactionService.getTransaction(transactionId);
            
            if (!transaction) {
                await ctx.editMessageText('❌ Transazione non trovata.');
                return;
            }
            
            const retryCount = await this.bot.transactionService.incrementRetryCount(transactionId);
            
            try {
                await ctx.telegram.sendMessage(
                    transaction.sellerId,
                    Messages.CHARGING_FAILED_RETRY + `\n\nID Transazione: \`${transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        ...Keyboards.getRetryActivationKeyboard(retryCount)
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

        // KWH validation callbacks
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
                const amount = announcement && transaction.declaredKwh ? 
                    (transaction.declaredKwh * announcement.price).toFixed(2) : 'N/A';
                
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `✅ *KWH CONFERMATI DAL VENDITORE*\n\n` +
                    `Il venditore ha confermato la ricezione di ${transaction.declaredKwh || 'N/A'} KWH.\n\n` +
                    `💳 *Procedi con il pagamento*\n` +
                    `💰 Importo: €${amount}\n` +
                    `💳 Metodi accettati: ${announcement?.paymentMethods || 'Come concordato'}\n\n` +
                    `Una volta effettuato il pagamento, premi il pulsante qui sotto.\n\n` +
                    `🔍 ID Transazione: \`${transaction.transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        ...Keyboards.getPaymentConfirmationKeyboard()
                    }
                );

                // FIX: Salva l'ID transazione nella sessione per il pagamento
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
        this.bot.bot.action(/^feedback_([1-5])$/, async (ctx) => {
            const rating = parseInt(ctx.match[1]);
            await ctx.answerCbQuery();
            
            let transactionId;
            const messageText = ctx.callbackQuery.message.text;
            const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
            
            if (transactionIdMatch) {
                transactionId = transactionIdMatch[1];
            } else if (ctx.session.completedTransactionId) {
                transactionId = ctx.session.completedTransactionId;
            } else {
                await ctx.reply('❌ ID transazione non trovato.');
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

                await ctx.editMessageText(
                    '⭐ Grazie per il feedback!\n\n' +
                    'La transazione è stata completata con successo.',
                    { reply_markup: undefined }
                );

                delete ctx.session.completedTransactionId;
                
                setTimeout(() => {
                    ctx.reply('Usa il menu per altre operazioni:', Keyboards.MAIN_MENU);
                }, 1000);
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
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.bot.action('help_buying', async (ctx) => {
            await ctx.answerCbQuery();
            const helpText = `🛒 **COME COMPRARE KWH**\n\n` +
                `1️⃣ **Trova annuncio:** Vai nel topic annunci\n` +
                `2️⃣ **Contatta venditore:** Clicca "Contatta venditore"\n` +
                `3️⃣ **Fornisci dettagli:** Data, colonnina, connettore\n` +
                `4️⃣ **Attendi conferma:** Il venditore deve accettare\n` +
                `5️⃣ **Ricarica:** Segui le istruzioni per l'attivazione\n` +
                `6️⃣ **Foto display:** Scatta foto dei KWH ricevuti\n` +
                `7️⃣ **Pagamento:** Paga come concordato\n` +
                `8️⃣ **Feedback:** Lascia una valutazione\n\n` +
                `💡 **Suggerimenti:**\n` +
                `• Verifica sempre i dettagli prima di confermare\n` +
                `• Scatta foto nitide del display\n` +
                `• Paga solo dopo conferma del venditore`;
            
            await ctx.editMessageText(helpText, {
                parse_mode: 'Markdown',
                ...Keyboards.getBackToMainMenuKeyboard()
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
                ...Keyboards.getBackToMainMenuKeyboard()
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
                ...Keyboards.getBackToMainMenuKeyboard()
            });
        });

        this.bot.bot.action('contact_admin', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `📞 **CONTATTA ADMIN**\n\n` +
                `Per supporto diretto contatta:\n` +
                `👤 @${process.env.ADMIN_USERNAME || 'amministratore'}\n\n` +
                `🚨 **Per emergenze:**\n` +
                `Usa il pulsante "Chiama admin" durante le transazioni.`,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getBackToMainMenuKeyboard()
                }
            );
        });
    }

    // Helper method for payment confirmation processing - FIX PRINCIPALE
    async processPaymentConfirmation(ctx, transactionId) {
        const transaction = await this.bot.transactionService.getTransaction(transactionId);
        
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata con ID: ' + transactionId);
            return;
        }
        
        if (transaction.buyerId !== ctx.from.id) {
            await ctx.editMessageText('❌ Non sei autorizzato per questa transazione.');
            return;
        }
        
        const announcement = await this.bot.announcementService.getAnnouncement(transaction.announcementId);
        const amount = announcement && transaction.declaredKwh ? 
            (transaction.declaredKwh * announcement.price).toFixed(2) : 'N/A';
        
        try {
            await ctx.telegram.sendMessage(
                transaction.sellerId,
                `💳 **DICHIARAZIONE PAGAMENTO**\n\n` +
                `L'acquirente @${ctx.from.username || ctx.from.first_name} dichiara di aver pagato.\n\n` +
                `💰 Importo dichiarato: €${amount}\n` +
                `⚡ KWH forniti: ${transaction.declaredKwh || 'N/A'}\n` +
                `🔍 ID Transazione: \`${transactionId}\`\n\n` +
                `Hai ricevuto il pagamento?`,
                {
                    parse_mode: 'Markdown',
                    ...Keyboards.getSellerPaymentConfirmKeyboard()
                }
            );
            
            console.log('Payment confirmation sent to seller for transaction:', transactionId);
            
        } catch (error) {
            console.error('Error notifying seller:', error);
        }

        await ctx.editMessageText(
            `✅ **DICHIARAZIONE PAGAMENTO INVIATA!**\n\n` +
            `🆔 Transazione: \`${transactionId}\`\n` +
            `💰 Importo: €${amount}\n\n` +
            `Il venditore riceverà una notifica e dovrà confermare la ricezione del pagamento.\n\n` +
            `Riceverai aggiornamenti sullo stato della transazione.`,
            { 
                parse_mode: 'Markdown',
                reply_markup: undefined
            }
        );
    }
}

module.exports = CallbackHandler;
