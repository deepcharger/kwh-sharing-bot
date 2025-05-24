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
            await handleChargingConfirmation(ctx, bot, transaction);
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
            '📸 *CONFERMA KWH RICEVUTI*\n\n' +
            'Per completare la transazione:\n\n' +
            '1️⃣ *Scatta una foto* del display della colonnina\n' +
            '2️⃣ *Invia la foto*\n' +
            '3️⃣ *Dichiara i KWH* ricevuti\n\n' +
            '📷 Consigli per la foto:\n' +
            '• Inquadra tutto il display\n' +
            '• Numeri ben leggibili\n' +
            '• Evita riflessi\n\n' +
            '*Invia la foto ora:*',
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
            await handleDisplayPhoto(ctx, bot, transaction, photo);
        } else if (ctx.session.waitingFor === 'payment_proof') {
            await handlePaymentProof(ctx, bot, transaction, photo);
        }
    });

    // Handle text inputs
    scene.on('text', async (ctx) => {
        const text = ctx.message.text;
        const transaction = ctx.session.transaction;

        // Handle rejection reason
        if (ctx.session.waitingFor === 'rejection_reason') {
            await handleRejectionReason(ctx, bot, transaction, text);
            return;
        }

        // Handle KWH amount
        if (ctx.session.waitingFor === 'kwh_amount') {
            await handleKwhAmount(ctx, bot, transaction, text);
            return;
        }

        // Handle KWH dispute reason
        if (ctx.session.waitingFor === 'kwh_dispute_reason' && ctx.session.disputingKwh) {
            await handleKwhDispute(ctx, bot, text);
            return;
        }

        // Handle feedback reason for negative ratings
        if (ctx.session.waitingFor === 'feedback_reason') {
            await handleFeedbackReason(ctx, bot, text);
            return;
        }
    });

    // KWH validation callbacks (for seller)
    scene.action(/^kwh_correct_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const transactionId = ctx.match[1];
        
        await handleKwhCorrect(ctx, bot, transactionId);
    });

    scene.action(/^kwh_incorrect_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const transactionId = ctx.match[1];
        
        await ctx.editMessageText(
            '📝 *KWH non corretti*\n\n' +
            'Specifica il problema:\n' +
            '• Quanti KWH mostra realmente la foto?\n' +
            '• Qual è il problema riscontrato?',
            { parse_mode: 'Markdown' }
        );
        
        ctx.session.disputingKwh = true;
        ctx.session.disputeTransactionId = transactionId;
        ctx.session.waitingFor = 'kwh_dispute_reason';
    });

    // Payment confirmation actions
    scene.action('payment_completed', async (ctx) => {
        await ctx.answerCbQuery();
        
        await handlePaymentCompleted(ctx, bot);
    });

    scene.action('payment_issues', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '⚠️ Problemi con il pagamento?\n\nScegli un\'opzione:',
            Keyboards.getPaymentIssuesKeyboard()
        );
    });

    // Seller payment confirmation
    scene.action('payment_received', async (ctx) => {
        await ctx.answerCbQuery();
        await handlePaymentReceived(ctx, bot);
    });

    scene.action('payment_not_received', async (ctx) => {
        await ctx.answerCbQuery();
        await handlePaymentNotReceived(ctx, bot);
    });

    // Feedback actions
    scene.action(/^feedback_([1-5])$/, async (ctx) => {
        const rating = parseInt(ctx.match[1]);
        await ctx.answerCbQuery();
        
        await handleFeedback(ctx, bot, rating);
    });

    // Payment issue resolution
    scene.action('retry_payment', async (ctx) => {
        await ctx.answerCbQuery();
        
        await ctx.editMessageText(
            '💳 Riprova ad effettuare il pagamento secondo gli accordi presi con il venditore.\n\n' +
            'Una volta completato, usa il pulsante per confermare.',
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
        
        const adminMessage = Messages.formatAdminAlert(
            transaction.transactionId,
            'Richiesta aiuto durante transazione',
            ctx.from.username || ctx.from.first_name
        );

        try {
            await ctx.telegram.sendMessage(
                bot.adminUserId,
                adminMessage,
                { parse_mode: 'Markdown' }
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
        delete ctx.session.completedTransactionId;
        delete ctx.session.photoFileId;
        delete ctx.session.feedbackRating;
        delete ctx.session.feedbackTargetUserId;
        delete ctx.session.disputingKwh;
        delete ctx.session.disputeTransactionId;
    });

    return scene;
}

// Helper functions
async function handleChargingConfirmation(ctx, bot, transaction) {
    await bot.transactionService.updateTransactionStatus(
        transaction.transactionId,
        'charging_in_progress'
    );

    try {
        await ctx.telegram.sendMessage(
            transaction.sellerId,
            Messages.CHARGING_CONFIRMED,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        console.error('Error notifying seller:', error);
    }

    await ctx.editMessageText(
        Messages.CHARGING_CONFIRMED,
        Keyboards.getChargingCompletedKeyboard()
    );
    
    ctx.session.chargingConfirmed = false;
}

async function handleDisplayPhoto(ctx, bot, transaction, photo) {
    await bot.transactionService.updateTransactionStatus(
        transaction.transactionId,
        'photo_uploaded',
        { displayPhoto: photo.file_id }
    );

    await ctx.reply(
        '📷 *Foto ricevuta!*\n\n' +
        'Ora dichiara quanti KWH hai ricevuto (solo il numero):\n\n' +
        '*Esempi:*\n' +
        '• 35.2\n' +
        '• 28.7\n' +
        '• 42',
        { parse_mode: 'Markdown' }
    );
    
    ctx.session.waitingFor = 'kwh_amount';
    ctx.session.photoFileId = photo.file_id;
}

async function handlePaymentProof(ctx, bot, transaction, photo) {
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

async function handleRejectionReason(ctx, bot, transaction, reason) {
    await bot.transactionService.updateTransactionStatus(
        transaction.transactionId,
        'cancelled',
        { cancellationReason: reason }
    );

    try {
        await ctx.telegram.sendMessage(
            transaction.buyerId,
            `❌ *Richiesta rifiutata*\n\n` +
            `Motivo: ${reason}\n\n` +
            `Puoi provare con un altro venditore.`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        console.error('Error notifying buyer:', error);
    }

    await ctx.reply('❌ Richiesta rifiutata. L\'acquirente è stato notificato.', Keyboards.MAIN_MENU);
    return ctx.scene.leave();
}

async function handleKwhAmount(ctx, bot, transaction, text) {
    const kwhAmount = parseFloat(text.replace(',', '.'));
    
    if (isNaN(kwhAmount) || kwhAmount <= 0 || kwhAmount > 200) {
        await ctx.reply('❌ Valore KWH non valido. Inserisci un numero (es: 35.2)');
        return;
    }

    await bot.transactionService.updateTransactionStatus(
        transaction.transactionId,
        'kwh_declared',
        { 
            declaredKwh: kwhAmount,
            actualKwh: kwhAmount
        }
    );

    try {
        await ctx.telegram.sendMessage(
            transaction.sellerId,
            `📸 *RICARICA COMPLETATA - VERIFICA*\n\n` +
            `L'acquirente ha dichiarato: *${kwhAmount} KWH*\n` +
            `ID Transazione: \`${transaction.transactionId}\`\n\n` +
            `Verifica la foto che segue e conferma se i KWH dichiarati sono corretti.`,
            { parse_mode: 'Markdown' }
        );

        await ctx.telegram.sendPhoto(transaction.sellerId, ctx.session.photoFileId, {
            caption: 'Foto del display inviata dall\'acquirente'
        });

        await ctx.telegram.sendMessage(
            transaction.sellerId,
            'I KWH dichiarati sono corretti?',
            Keyboards.getKwhValidationKeyboard(transaction.transactionId)
        );

    } catch (error) {
        console.error('Error notifying seller:', error);
        await ctx.reply('❌ Errore nell\'invio al venditore. Contatta l\'admin.');
    }

    await ctx.reply(
        '✅ *Dati inviati al venditore!*\n\n' +
        'Il venditore verificherà la foto e i KWH dichiarati.\n' +
        'Una volta confermato, potrai procedere con il pagamento.\n\n' +
        'Attendi la conferma...',
        {
            parse_mode: 'Markdown',
            ...Keyboards.MAIN_MENU
        }
    );

    ctx.session.waitingFor = null;
    return ctx.scene.leave();
}

async function handleKwhDispute(ctx, bot, reason) {
    const transactionId = ctx.session.disputeTransactionId;
    
    const transaction = await bot.transactionService.getTransaction(transactionId);
    if (!transaction) {
        await ctx.reply('❌ Transazione non trovata.');
        return ctx.scene.leave();
    }
    
    await bot.transactionService.addTransactionIssue(
        transactionId,
        `Discrepanza KWH: ${reason}`,
        ctx.from.id
    );
    
    try {
        await ctx.telegram.sendMessage(
            transaction.buyerId,
            `⚠️ *Problema con i KWH dichiarati*\n\n` +
            `Il venditore segnala: ${reason}\n\n` +
            `Controlla nuovamente la foto e rispondi al venditore.`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        console.error('Error notifying buyer:', error);
    }
    
    await ctx.reply(
        '⚠️ Problema segnalato all\'acquirente.\n\n' +
        'Potete chiarire privatamente la questione.',
        Keyboards.MAIN_MENU
    );
    
    delete ctx.session.disputingKwh;
    delete ctx.session.disputeTransactionId;
    ctx.session.waitingFor = null;
    
    return ctx.scene.leave();
}

async function handleFeedbackReason(ctx, bot, reason) {
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

async function handleKwhCorrect(ctx, bot, transactionId) {
    const transaction = await bot.transactionService.getTransaction(transactionId);
    if (!transaction) {
        await ctx.editMessageText('❌ Transazione non trovata.');
        return;
    }

    await bot.transactionService.updateTransactionStatus(
        transactionId,
        'payment_requested'
    );

    try {
        await ctx.telegram.sendMessage(
            transaction.buyerId,
            `✅ *KWH CONFERMATI DAL VENDITORE*\n\n` +
            `Il venditore ha confermato la ricezione di ${transaction.declaredKwh} KWH.\n\n` +
            `💳 *Procedi con il pagamento* secondo gli accordi presi.\n` +
            `Metodi accettati: ${transaction.announcement?.paymentMethods || 'Come concordato'}\n\n` +
            `Una volta effettuato il pagamento, premi il pulsante qui sotto.`,
            {
                parse_mode: 'Markdown',
                ...Keyboards.getPaymentConfirmationKeyboard()
            }
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
        '✅ KWH confermati! L\'acquirente è stato invitato a procedere con il pagamento.',
        { reply_markup: undefined }
    );
}

async function handlePaymentCompleted(ctx, bot) {
    const messages = ctx.callbackQuery.message.reply_to_message || ctx.callbackQuery.message;
    const messageText = messages.text || '';
    const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
    
    if (!transactionIdMatch) {
        await ctx.reply('⚠️ Inserisci l\'ID della transazione per confermare il pagamento.');
        return;
    }
    
    const transactionId = transactionIdMatch[1];
    const transaction = await bot.transactionService.getTransaction(transactionId);
    
    if (!transaction) {
        await ctx.editMessageText('❌ Transazione non trovata.');
        return;
    }
    
    try {
        await ctx.telegram.sendMessage(
            transaction.sellerId,
            `💳 *DICHIARAZIONE PAGAMENTO*\n\n` +
            `L'acquirente @${ctx.from.username || ctx.from.first_name} dichiara di aver pagato.\n\n` +
            `KWH forniti: ${transaction.declaredKwh}\n` +
            `ID Transazione: \`${transactionId}\`\n\n` +
            `Hai ricevuto il pagamento?`,
            {
                parse_mode: 'Markdown',
                ...Keyboards.getSellerPaymentConfirmKeyboard()
            }
        );
        
    } catch (error) {
        console.error('Error notifying seller:', error);
    }

    await ctx.editMessageText(
        '✅ Dichiarazione di pagamento ricevuta!\n\n' +
        'Il venditore dovrà confermare la ricezione.',
        { reply_markup: undefined }
    );
}

async function handlePaymentReceived(ctx, bot) {
    const messageText = ctx.callbackQuery.message.text;
    const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
    
    if (!transactionIdMatch) {
        await ctx.reply('❌ ID transazione non trovato.');
        return;
    }
    
    const transactionId = transactionIdMatch[1];
    const transaction = await bot.transactionService.getTransaction(transactionId);
    
    if (!transaction) {
        await ctx.editMessageText('❌ Transazione non trovata.');
        return;
    }
    
    await bot.transactionService.updateTransactionStatus(
        transactionId,
        'completed'
    );

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
}

async function handlePaymentNotReceived(ctx, bot) {
    const messageText = ctx.callbackQuery.message.text;
    const transactionIdMatch = messageText.match(/ID Transazione: `?([^`\s]+)`?/);
    
    if (!transactionIdMatch) {
        await ctx.reply('❌ ID transazione non trovato.');
        return;
    }
    
    const transactionId = transactionIdMatch[1];
    const transaction = await bot.transactionService.getTransaction(transactionId);
    
    if (!transaction) {
        await ctx.editMessageText('❌ Transazione non trovata.');
        return;
    }
    
    await bot.transactionService.addTransactionIssue(
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

    return ctx.scene.leave();
}

async function handleFeedback(ctx, bot, rating) {
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
    
    const transaction = await bot.transactionService.getTransaction(transactionId);
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

        delete ctx.session.completedTransactionId;
        
        setTimeout(() => {
            ctx.reply('Usa il menu per altre operazioni:', Keyboards.MAIN_MENU);
        }, 1000);

        return ctx.scene.leave();
    }
}

async function handleTransactionStatus(ctx, bot) {
    const transaction = ctx.session.transaction;
    const userId = ctx.from.id;

    switch (transaction.status) {
        case 'pending_seller_confirmation':
            if (userId === transaction.sellerId) {
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
                await ctx.reply(
                    `💳 *Procedi con il pagamento*\n\n` +
                    `KWH confermati: ${transaction.declaredKwh}\n` +
                    `Metodi accettati: ${transaction.announcement?.paymentMethods || 'Come concordato'}\n\n` +
                    `Una volta effettuato, premi il pulsante per confermare.`,
                    {
                        parse_mode: 'Markdown',
                        ...Keyboards.getPaymentConfirmationKeyboard()
                    }
                );
            } else {
                await ctx.reply('⏳ In attesa del pagamento dall\'acquirente.', Keyboards.MAIN_MENU);
                return ctx.scene.leave();
            }
            break;

        case 'completed':
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

module.exports = { createTransactionScene };
