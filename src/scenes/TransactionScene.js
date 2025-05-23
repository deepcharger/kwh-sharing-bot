// File: src/scenes/TransactionScene.js - Versione corretta completa

const { Scenes } = require('telegraf');
const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

function createTransactionScene(bot) {
    const scene = new Scenes.BaseScene('transactionScene');

    // Enter scene with transaction ID
    scene.enter(async (ctx) => {
        // Check for transaction ID in multiple places
        if (!ctx.session.transactionId && ctx.scene.state?.transactionId) {
            ctx.session.transactionId = ctx.scene.state.transactionId;
        }
        
        const transactionId = ctx.session.transactionId;
        
        if (!transactionId) {
            await ctx.reply('❌ Transazione non trovata.', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        const transaction = await bot.transactionService.getTransaction(transactionId);
        if (!transaction) {
            await ctx.reply('❌ Transazione non trovata.', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        // Get announcement details for the transaction
        const announcement = await bot.announcementService.getAnnouncement(transaction.announcementId);
        if (announcement) {
            transaction.announcement = announcement;
        }

        ctx.session.transaction = transaction;
        
        // Check if we're rejecting the transaction
        if (ctx.session.rejectingTransaction) {
            await ctx.editMessageText(
                '📝 Motivo del rifiuto:\n\nScrivi il motivo per cui rifiuti questa richiesta:',
                { reply_markup: undefined }
            );
            ctx.session.waitingFor = 'rejection_reason';
            return;
        }
        
        // Check if we confirmed charging
        if (ctx.session.chargingConfirmed) {
            await bot.transactionService.updateTransactionStatus(
                transactionId,
                'charging_in_progress'
            );

            // Notify seller
            try {
                await ctx.telegram.sendMessage(
                    transaction.sellerId,
                    Messages.CHARGING_CONFIRMED,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying seller:', error);
            }

            // Show charging completed button to buyer
            await ctx.editMessageText(
                Messages.CHARGING_CONFIRMED,
                Keyboards.getChargingCompletedKeyboard()
            );
            
            ctx.session.chargingConfirmed = false;
            return;
        }
        
        // Handle different entry points based on transaction status
        await handleTransactionStatus(ctx, bot);
    });

    // Charging finished
    scene.action('charging_finished', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'charging_completed'
        );

        await ctx.editMessageText(
            Messages.PHOTO_UPLOAD_REQUEST,
            { parse_mode: 'Markdown', reply_markup: undefined }
        );

        ctx.session.waitingFor = 'display_photo';
    });

    // Handle photo upload
    scene.on('photo', async (ctx) => {
        if (ctx.session.waitingFor !== 'display_photo' && ctx.session.waitingFor !== 'payment_proof') {
            await ctx.reply('❌ Non aspettavo una foto in questo momento.');
            return;
        }

        const transaction = ctx.session.transaction;
        const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Get highest resolution

        if (ctx.session.waitingFor === 'display_photo') {
            // Store photo info
            await bot.transactionService.updateTransactionStatus(
                transaction.transactionId,
                'photo_uploaded',
                { displayPhoto: photo.file_id }
            );

            await ctx.reply(Messages.PHOTO_RECEIVED);
            ctx.session.waitingFor = 'kwh_amount';
            ctx.session.photoFileId = photo.file_id;
            
        } else if (ctx.session.waitingFor === 'payment_proof') {
            // Forward proof to seller
            try {
                await ctx.telegram.sendPhoto(transaction.sellerId, photo.file_id, {
                    caption: `📷 Prova di pagamento dall'acquirente @${ctx.from.username || ctx.from.first_name}\n\nTransazione: ${transaction.transactionId}`
                });
                
                await ctx.reply(
                    '✅ Prova di pagamento inviata al venditore.\n\n' +
                    'Attendi la conferma.',
                    Keyboards.MAIN_MENU
                );
            } catch (error) {
                console.error('Error forwarding payment proof:', error);
                await ctx.reply('❌ Errore nell\'invio. Riprova.');
            }
            
            return ctx.scene.leave();
        }
    });

    // Handle KWH amount input and other text inputs
    scene.on('text', async (ctx) => {
        const text = ctx.message.text;
        const transaction = ctx.session.transaction;

        // Handle rejection reason
        if (ctx.session.waitingFor === 'rejection_reason') {
            await bot.transactionService.updateTransactionStatus(
                transaction.transactionId,
                'cancelled',
                { cancellationReason: text }
            );

            // Notify buyer
            try {
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `❌ *Richiesta rifiutata*\n\n` +
                    `Motivo: ${text}\n\n` +
                    `Puoi provare con un altro venditore.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.reply('❌ Richiesta rifiutata. L\'acquirente è stato notificato.', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        // Handle KWH amount
        if (ctx.session.waitingFor === 'kwh_amount') {
            const kwhAmount = parseFloat(text.replace(',', '.'));
            
            if (isNaN(kwhAmount) || kwhAmount <= 0 || kwhAmount > 200) {
                await ctx.reply(Messages.ERROR_MESSAGES.INVALID_KWH);
                return;
            }

            // Validate photo with OCR
            await ctx.reply('🔍 *Analisi in corso...*\n\nIl bot sta verificando la foto del display...', { parse_mode: 'Markdown' });

            try {
                const validationResult = await bot.imageProcessor.validateKwhImage(
                    ctx.telegram,
                    ctx.session.photoFileId,
                    kwhAmount
                );

                if (validationResult.isValid) {
                    // Photo validated successfully
                    const announcement = transaction.announcement || await bot.announcementService.getAnnouncement(transaction.announcementId);
                    const totalAmount = await bot.transactionService.calculateTransactionAmount(
                        transaction.transactionId,
                        kwhAmount,
                        announcement.price
                    );

                    await bot.transactionService.updateTransactionStatus(
                        transaction.transactionId,
                        'payment_requested'
                    );

                    const paymentText = Messages.formatPaymentRequest(totalAmount, announcement.paymentMethods);
                    
                    await ctx.reply(
                        Messages.formatKwhValidation(validationResult),
                        { parse_mode: 'Markdown' }
                    );

                    await ctx.reply(
                        paymentText,
                        Keyboards.getPaymentConfirmationKeyboard()
                    );

                    ctx.session.waitingFor = 'payment_confirmation';

                } else {
                    // Photo validation failed
                    await ctx.reply(
                        Messages.formatKwhValidation(validationResult),
                        Keyboards.getPhotoRetryKeyboard()
                    );
                }

            } catch (error) {
                console.error('Error validating photo:', error);
                await ctx.reply(
                    '❌ Errore nell\'analisi della foto. Riprova o contatta l\'admin.',
                    Keyboards.getPhotoRetryKeyboard()
                );
            }
            return;
        }

        // Handle manual KWH entry
        if (ctx.session.waitingFor === 'kwh_manual') {
            const kwhAmount = parseFloat(text.replace(',', '.'));
            
            if (isNaN(kwhAmount) || kwhAmount <= 0 || kwhAmount > 200) {
                await ctx.reply(Messages.ERROR_MESSAGES.INVALID_KWH);
                return;
            }

            // Proceed without validation
            const announcement = transaction.announcement || await bot.announcementService.getAnnouncement(transaction.announcementId);
            const totalAmount = await bot.transactionService.calculateTransactionAmount(
                transaction.transactionId,
                kwhAmount,
                announcement.price
            );

            await bot.transactionService.updateTransactionStatus(
                transaction.transactionId,
                'payment_requested',
                { manualValidation: true }
            );

            const paymentText = Messages.formatPaymentRequest(totalAmount, announcement.paymentMethods);
            
            await ctx.reply(
                '⚠️ *Validazione manuale richiesta*\n\nUn admin verificherà la transazione.',
                { parse_mode: 'Markdown' }
            );

            await ctx.reply(
                paymentText,
                Keyboards.getPaymentConfirmationKeyboard()
            );

            // Notify admin
            try {
                await ctx.telegram.sendMessage(
                    bot.adminUserId,
                    `⚠️ *Validazione manuale richiesta*\n\n` +
                    `ID Transazione: ${transaction.transactionId}\n` +
                    `KWH dichiarati: ${kwhAmount}\n` +
                    `Importo: €${totalAmount.toFixed(2)}`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying admin:', error);
            }

            ctx.session.waitingFor = 'payment_confirmation';
            return;
        }

        // Handle feedback reason for negative ratings
        if (ctx.session.waitingFor === 'feedback_reason') {
            const reason = ctx.message.text;
            const transaction = ctx.session.transaction;

            await bot.transactionService.createFeedback(
                transaction.transactionId,
                ctx.from.id,
                ctx.session.feedbackTargetUserId,
                ctx.session.feedbackRating,
                reason
            );

            await ctx.reply(
                '⭐ Grazie per il feedback!\n\n' +
                'Il tuo commento aiuterà a migliorare il servizio.',
                Keyboards.MAIN_MENU
            );

            return ctx.scene.leave();
        }
    });

    // Payment confirmation actions
    scene.action('payment_completed', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        
        // Notify seller to confirm payment
        const announcement = transaction.announcement || await bot.announcementService.getAnnouncement(transaction.announcementId);
        const confirmText = Messages.formatPaymentConfirmationRequest(
            transaction.totalAmount,
            ctx.from.username || ctx.from.first_name
        );

        try {
            await ctx.telegram.sendMessage(
                transaction.sellerId,
                confirmText,
                Keyboards.getSellerPaymentConfirmKeyboard()
            );
            
            // Send transaction ID for reference
            await ctx.telegram.sendMessage(
                transaction.sellerId,
                `🔍 ID Transazione: \`${transaction.transactionId}\``,
                { parse_mode: 'Markdown' }
            );
            
            // Store ID in seller's session for later use
            ctx.session.pendingPaymentTransactionId = transaction.transactionId;
        } catch (error) {
            console.error('Error notifying seller:', error);
        }

        await ctx.editMessageText(
            '✅ Dichiarazione di pagamento ricevuta!\n\n' +
            'Il venditore dovrà confermare la ricezione del pagamento.',
            { reply_markup: undefined }
        );

        return ctx.scene.leave();
    });

    scene.action('payment_issues', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '⚠️ Problemi con il pagamento?\n\nScegli un\'opzione:',
            Keyboards.getPaymentIssuesKeyboard()
        );
    });

    // Seller payment confirmation - FIXED
    scene.action('payment_received', async (ctx) => {
        await ctx.answerCbQuery();
        
        // Get transaction ID from message
        const messageText = ctx.callbackQuery.message.text;
        const transactionIdMatch = messageText.match(/ID Transazione: `?(T_[^`\s]+)`?/);
        
        let transactionId;
        if (transactionIdMatch) {
            transactionId = transactionIdMatch[1];
        } else if (ctx.session.pendingPaymentTransactionId) {
            transactionId = ctx.session.pendingPaymentTransactionId;
        } else {
            await ctx.reply('❌ ID transazione non trovato.');
            return;
        }
        
        const transaction = await bot.transactionService.getTransaction(transactionId);
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        await bot.transactionService.updateTransactionStatus(
            transactionId,
            'completed'
        );

        // Update user stats
        await bot.userService.updateUserTransactionStats(
            transaction.sellerId,
            transaction.actualKwh,
            'sell'
        );
        await bot.userService.updateUserTransactionStats(
            transaction.buyerId,
            transaction.actualKwh,
            'buy'
        );

        // Notify buyer
        try {
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                Messages.TRANSACTION_COMPLETED + '\n\n' + Messages.FEEDBACK_REQUEST,
                Keyboards.getFeedbackKeyboard()
            );
            
            // Send transaction ID for feedback
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                `🔍 ID Transazione: \`${transactionId}\``,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        // Ask seller for feedback too
        await ctx.editMessageText(
            Messages.TRANSACTION_COMPLETED + '\n\n' + Messages.FEEDBACK_REQUEST,
            Keyboards.getFeedbackKeyboard()
        );
        
        // Store transaction for feedback
        ctx.session.completedTransactionId = transactionId;
    });

    scene.action('payment_not_received', async (ctx) => {
        await ctx.answerCbQuery();
        
        // Get transaction ID
        const messageText = ctx.callbackQuery.message.text;
        const transactionIdMatch = messageText.match(/ID Transazione: `?(T_[^`\s]+)`?/);
        
        let transactionId;
        if (transactionIdMatch) {
            transactionId = transactionIdMatch[1];
        } else if (ctx.session.pendingPaymentTransactionId) {
            transactionId = ctx.session.pendingPaymentTransactionId;
        } else {
            await ctx.reply('❌ ID transazione non trovato.');
            return;
        }
        
        const transaction = await bot.transactionService.getTransaction(transactionId);
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        // Add issue to transaction
        await bot.transactionService.addTransactionIssue(
            transactionId,
            'Pagamento non ricevuto',
            transaction.sellerId
        );
        
        // Notify buyer about payment issue
        try {
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                '⚠️ *Problema pagamento segnalato*\n\n' +
                'Il venditore non conferma la ricezione del pagamento.\n\n' +
                'Cosa vuoi fare?',
                Keyboards.getPaymentIssuesKeyboard()
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await ctx.editMessageText(
            '⚠️ Problema pagamento segnalato. L\'acquirente riceverà opzioni per risolvere.',
            { reply_markup: undefined }
        );

        return ctx.scene.leave();
    });

    // Feedback actions - FIXED
    scene.action(/^feedback_([1-5])$/, async (ctx) => {
        const rating = parseInt(ctx.match[1]);
        await ctx.answerCbQuery();
        
        // Get transaction ID
        let transactionId;
        const messageText = ctx.callbackQuery.message.text;
        const transactionIdMatch = messageText.match(/ID Transazione: `?(T_[^`\s]+)`?/);
        
        if (transactionIdMatch) {
            transactionId = transactionIdMatch[1];
        } else if (ctx.session.completedTransactionId) {
            transactionId = ctx.session.completedTransactionId;
        } else {
            await ctx.reply('❌ ID transazione non trovato.');
            return;
        }
        
        const transaction = await bot.transactionService.getTransaction(transactionId);
        if (!transaction) {
            await ctx.editMessageText('❌ Transazione non trovata.');
            return;
        }
        
        const isSellerGivingFeedback = ctx.from.id === transaction.sellerId;
        const targetUserId = isSellerGivingFeedback ? transaction.buyerId : transaction.sellerId;

        if (rating <= 2) {
            // Ask for reason if negative feedback
            await ctx.editMessageText(Messages.NEGATIVE_FEEDBACK_REASON, { reply_markup: undefined });
            ctx.session.waitingFor = 'feedback_reason';
            ctx.session.feedbackRating = rating;
            ctx.session.feedbackTargetUserId = targetUserId;
            ctx.session.transaction = transaction;
        } else {
            // Positive feedback, no reason needed
            await bot.transactionService.createFeedback(
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

            // Clear session
            delete ctx.session.completedTransactionId;
            
            setTimeout(() => {
                ctx.reply('Usa il menu per altre operazioni:', Keyboards.MAIN_MENU);
            }, 1000);

            return ctx.scene.leave();
        }
    });

    // Photo retry actions
    scene.action('retry_photo', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(Messages.PHOTO_UPLOAD_REQUEST, { reply_markup: undefined });
        ctx.session.waitingFor = 'display_photo';
    });

    scene.action('manual_kwh_only', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '📝 *Inserisci solo i KWH*\n\n' +
            'Un admin verificherà manualmente.\n\n' +
            'Scrivi il numero di KWH ricevuti:',
            { parse_mode: 'Markdown', reply_markup: undefined }
        );
        ctx.session.waitingFor = 'kwh_manual';
    });

    scene.action('request_admin_verification', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        
        // Notify admin
        const adminMessage = Messages.formatAdminAlert(
            transaction.transactionId,
            'Richiesta verifica foto KWH',
            ctx.from.username || ctx.from.first_name
        );

        try {
            await ctx.telegram.sendMessage(
                bot.adminUserId,
                adminMessage,
                { parse_mode: 'Markdown' }
            );
            
            // Forward the photo to admin
            if (ctx.session.photoFileId) {
                await ctx.telegram.sendPhoto(bot.adminUserId, ctx.session.photoFileId, {
                    caption: `Foto da verificare per transazione ${transaction.transactionId}`
                });
            }
        } catch (error) {
            console.error('Error notifying admin:', error);
        }

        await ctx.editMessageText(
            '📞 Admin contattato per verifica manuale!\n\n' +
            'Riceverai aggiornamenti a breve.',
            { reply_markup: undefined }
        );

        return ctx.scene.leave();
    });

    // Payment issue resolution
    scene.action('retry_payment', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        const announcement = transaction.announcement || await bot.announcementService.getAnnouncement(transaction.announcementId);
        
        await ctx.editMessageText(
            Messages.formatPaymentRequest(transaction.totalAmount, announcement.paymentMethods),
            Keyboards.getPaymentConfirmationKeyboard()
        );
    });

    scene.action('send_payment_proof', async (ctx) => {
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

    // Admin actions and error handling
    scene.action('call_admin', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        
        // Notify admin
        const adminMessage = Messages.formatAdminAlert(
            transaction.transactionId,
            'Richiesta aiuto durante transazione',
            ctx.from.username || ctx.from.first_name
        );

        try {
            await ctx.telegram.sendMessage(
                bot.adminUserId,
                adminMessage,
                Keyboards.getAdminArbitrationKeyboard()
            );
        } catch (error) {
            console.error('Error notifying admin:', error);
        }

        await ctx.editMessageText(
            '📞 Admin contattato!\n\n' +
            'Un amministratore interverrà il prima possibile.',
            { reply_markup: undefined }
        );

        return ctx.scene.leave();
    });

    // Technical issues handling
    scene.action('technical_issues', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '⚠️ *Problemi tecnici rilevati*\n\n' +
            'Seleziona il tipo di problema:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔌 Colonnina non risponde', callback_data: 'issue_charger_not_responding' }],
                        [{ text: '❌ Errore attivazione', callback_data: 'issue_activation_error' }],
                        [{ text: '📱 Problema app', callback_data: 'issue_app_problem' }],
                        [{ text: '📞 Contatta admin', callback_data: 'call_admin' }]
                    ]
                }
            }
        );
    });

    // Handle technical issue types
    scene.action(/^issue_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const issueType = ctx.match[1];
        const transaction = ctx.session.transaction;
        
        await bot.transactionService.addTransactionIssue(
            transaction.transactionId,
            issueType.replace(/_/g, ' '),
            ctx.from.id
        );
        
        await ctx.editMessageText(
            '📝 Problema registrato.\n\n' +
            'Opzioni disponibili:',
            Keyboards.getRetryActivationKeyboard(transaction.retryCount || 0)
        );
    });

    // Retry activation
    scene.action('retry_activation', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '🔄 Riprovo attivazione...\n\nPremi quando hai attivato:',
            Keyboards.getActivateChargingKeyboard()
        );
    });

    async function handleTransactionStatus(ctx, bot) {
        const transaction = ctx.session.transaction;
        const userId = ctx.from.id;

        switch (transaction.status) {
            case 'pending_seller_confirmation':
                if (userId === transaction.sellerId) {
                    // Show confirmation options to seller
                    const requestText = Messages.formatPurchaseRequest(transaction, transaction.announcement);
                    await ctx.reply(requestText, Keyboards.getSellerConfirmationKeyboard());
                } else {
                    await ctx.reply('⏳ In attesa della conferma del venditore.', Keyboards.MAIN_MENU);
                    return ctx.scene.leave();
                }
                break;

            case 'confirmed':
                if (userId === transaction.sellerId) {
                    await ctx.reply(Messages.CHARGING_TIME, Keyboards.getActivateChargingKeyboard());
                } else {
                    await ctx.reply('✅ Richiesta confermata! Attendi la notifica per la ricarica.', Keyboards.MAIN_MENU);
                    return ctx.scene.leave();
                }
                break;

            case 'payment_requested':
                if (userId === transaction.buyerId) {
                    const announcement = transaction.announcement || await bot.announcementService.getAnnouncement(transaction.announcementId);
                    await ctx.reply(
                        Messages.formatPaymentRequest(transaction.totalAmount, announcement.paymentMethods),
                        Keyboards.getPaymentConfirmationKeyboard()
                    );
                } else {
                    await ctx.reply('⏳ In attesa del pagamento dall\'acquirente.', Keyboards.MAIN_MENU);
                    return ctx.scene.leave();
                }
                break;

            case 'completed':
                // Show option to leave feedback if not already done
                const existingFeedback = await bot.db.getCollection('feedback').findOne({
                    transactionId: transaction.transactionId,
                    fromUserId: userId
                });
                
                if (!existingFeedback) {
                    await ctx.reply(
                        '📝 Non hai ancora lasciato un feedback per questa transazione.\n\n' +
                        Messages.FEEDBACK_REQUEST,
                        Keyboards.getFeedbackKeyboard()
                    );
                    ctx.session.completedTransactionId = transaction.transactionId;
                } else {
                    await ctx.reply('✅ Transazione completata con successo!', Keyboards.MAIN_MENU);
                    return ctx.scene.leave();
                }
                break;

            default:
                await ctx.reply(`📊 Stato transazione: ${transaction.status}`, Keyboards.MAIN_MENU);
                return ctx.scene.leave();
        }
    }

    // Handle unexpected messages
    scene.on('message', async (ctx) => {
        await ctx.reply('❌ Messaggio non riconosciuto. Usa i pulsanti disponibili o /start per ricominciare.');
    });

    // Clean up on leave
    scene.leave((ctx) => {
        // Clean up session data
        delete ctx.session.transactionId;
        delete ctx.session.transaction;
        delete ctx.session.waitingFor;
        delete ctx.session.rejectingTransaction;
        delete ctx.session.chargingConfirmed;
        delete ctx.session.pendingPaymentTransactionId;
        delete ctx.session.completedTransactionId;
        delete ctx.session.photoFileId;
        delete ctx.session.feedbackRating;
        delete ctx.session.feedbackTargetUserId;
    });

    return scene;
}

module.exports = { createTransactionScene };
