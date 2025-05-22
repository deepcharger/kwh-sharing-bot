const { Scenes } = require('telegraf');
const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

function createTransactionScene(bot) {
    const scene = new Scenes.BaseScene('transactionScene');

    // Enter scene with transaction ID
    scene.enter(async (ctx) => {
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

        ctx.session.transaction = transaction;
        
        // Handle different entry points based on transaction status
        await handleTransactionStatus(ctx, bot);
    });

    // Seller actions
    scene.action('seller_accept', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'confirmed'
        );

        // Notify buyer
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
            '✅ Richiesta accettata! L\'acquirente è stato notificato.',
            Keyboards.MAIN_MENU
        );

        return ctx.scene.leave();
    });

    scene.action('seller_reject', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '📝 Motivo del rifiuto:\n\nScrivi il motivo per cui rifiuti questa richiesta:',
            { reply_markup: undefined }
        );
        
        ctx.session.waitingFor = 'rejection_reason';
    });

    // Charging activation
    scene.action('activate_charging', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'charging_started'
        );

        // Notify buyer to confirm charging
        try {
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                Messages.CHARGING_ACTIVATED,
                Keyboards.getBuyerChargingConfirmKeyboard()
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await ctx.editMessageText(
            '⚡ Ricarica attivata! In attesa della conferma dall\'acquirente.',
            { reply_markup: undefined }
        );

        return ctx.scene.leave();
    });

    scene.action('delay_charging', async (ctx) => {
        await ctx.answerCbQuery();
        
        setTimeout(async () => {
            try {
                await ctx.telegram.sendMessage(
                    ctx.from.id,
                    '⏰ Promemoria: È il momento di attivare la ricarica!',
                    Keyboards.getActivateChargingKeyboard()
                );
            } catch (error) {
                console.error('Error sending delayed reminder:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes

        await ctx.editMessageText('⏸️ Ricarica rimandata di 5 minuti. Riceverai un promemoria.');
        return ctx.scene.leave();
    });

    // Buyer charging confirmation
    scene.action('charging_confirmed', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
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
    });

    scene.action('charging_failed', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        
        const retryCount = await bot.transactionService.incrementRetryCount(transaction.transactionId);
        
        // Notify seller about the issue
        try {
            await ctx.telegram.sendMessage(
                transaction.sellerId,
                Messages.CHARGING_FAILED_RETRY,
                Keyboards.getRetryActivationKeyboard(retryCount)
            );
        } catch (error) {
            console.error('Error notifying seller:', error);
        }

        await ctx.editMessageText(
            '❌ Segnalazione ricevuta. Il venditore proverà a risolvere il problema.',
            { reply_markup: undefined }
        );

        return ctx.scene.leave();
    });

    // Retry activation
    scene.action('retry_activation', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '🔄 Riprovo attivazione...\n\nPremi quando hai attivato:',
            Keyboards.getActivateChargingKeyboard()
        );
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
        if (ctx.session.waitingFor !== 'display_photo') {
            await ctx.reply('❌ Non aspettavo una foto in questo momento.');
            return;
        }

        const transaction = ctx.session.transaction;
        const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Get highest resolution

        // Store photo info
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'photo_uploaded',
            { displayPhoto: photo.file_id }
        );

        await ctx.reply(Messages.PHOTO_RECEIVED);
        ctx.session.waitingFor = 'kwh_amount';
        ctx.session.photoFileId = photo.file_id;
    });

    // Handle KWH amount input
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
                    const announcement = await bot.announcementService.getAnnouncement(transaction.announcementId);
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
    });

    // Payment confirmation actions
    scene.action('payment_completed', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        
        // Notify seller to confirm payment
        const announcement = await bot.announcementService.getAnnouncement(transaction.announcementId);
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

    // Seller payment confirmation
    scene.action('payment_received', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'completed'
        );

        // Notify buyer
        try {
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                Messages.TRANSACTION_COMPLETED + '\n\n' + Messages.FEEDBACK_REQUEST,
                Keyboards.getFeedbackKeyboard()
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        // Ask seller for feedback too
        await ctx.editMessageText(
            Messages.TRANSACTION_COMPLETED + '\n\n' + Messages.FEEDBACK_REQUEST,
            Keyboards.getFeedbackKeyboard()
        );
    });

    scene.action('payment_not_received', async (ctx) => {
        await ctx.answerCbQuery();
        const transaction = ctx.session.transaction;
        
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

    // Feedback actions
    scene.action(/^feedback_([1-5])$/, async (ctx) => {
        const rating = parseInt(ctx.match[1]);
        await ctx.answerCbQuery();
        
        const transaction = ctx.session.transaction;
        const isSellerGivingFeedback = ctx.from.id === transaction.sellerId;
        const targetUserId = isSellerGivingFeedback ? transaction.buyerId : transaction.sellerId;

        if (rating <= 2) {
            // Ask for reason if negative feedback
            await ctx.editMessageText(Messages.NEGATIVE_FEEDBACK_REASON, { reply_markup: undefined });
            ctx.session.waitingFor = 'feedback_reason';
            ctx.session.feedbackRating = rating;
            ctx.session.feedbackTargetUserId = targetUserId;
        } else {
            // Positive feedback, no reason needed
            await bot.transactionService.createFeedback(
                transaction.transactionId,
                ctx.from.id,
                targetUserId,
                rating,
                ''
            );

            await ctx.editMessageText(
                '⭐ Grazie per il feedback!\n\n' +
                'La transazione è stata completata con successo.',
                Keyboards.MAIN_MENU
            );

            return ctx.scene.leave();
        }
    });

    // Handle feedback reason for negative ratings
    scene.on('text', async (ctx) => {
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

            default:
                await ctx.reply('❌ Stato transazione non gestito.', Keyboards.MAIN_MENU);
                return ctx.scene.leave();
        }
    }

    return scene;
}

module.exports = { createTransactionScene };
