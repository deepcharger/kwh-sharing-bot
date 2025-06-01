const { Scenes } = require('telegraf');
const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');
const MarkdownEscape = require('../utils/MarkdownEscape');

function createTransactionScene(bot) {
    const scene = new Scenes.BaseScene('transactionScene');

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

        const announcement = await bot.announcementService.getAnnouncement(transaction.announcementId);
        const userId = ctx.from.id;
        const isSeller = userId === transaction.sellerId;
        const isBuyer = userId === transaction.buyerId;

        if (!isSeller && !isBuyer) {
            await ctx.reply('❌ Non sei autorizzato a gestire questa transazione.', Keyboards.MAIN_MENU);
            return ctx.scene.leave();
        }

        ctx.session.transactionData = {
            transaction,
            announcement,
            isSeller,
            isBuyer
        };

        // Se arriviamo dalla conferma di ricarica
        if (ctx.session.chargingConfirmed) {
            await bot.transactionService.updateTransactionStatus(
                transactionId,
                'charging_in_progress'
            );
            
            await ctx.reply(
                '✅ **RICARICA IN CORSO!**\n\n' +
                'Quando hai terminato la ricarica, premi il pulsante qui sotto.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getChargingCompletedKeyboard().reply_markup
                }
            );
            
            delete ctx.session.chargingConfirmed;
            return;
        }

        await showTransactionStatus(ctx, bot);
    });

    // Definisci la funzione come funzione normale, non come metodo della scene
    async function showTransactionStatus(ctx, bot) {
        const { transaction, announcement, isSeller, isBuyer } = ctx.session.transactionData;
        
        let message = `📋 **TRANSAZIONE**\n\n`;
        message += `🆔 ID: \`${transaction.transactionId}\`\n`;
        message += `📊 Stato: ${MarkdownEscape.escape(bot.getStatusText(transaction.status))}\n`;
        message += `📅 Data: ${transaction.createdAt.toLocaleDateString('it-IT')}\n`;

        if (transaction.kwhAmount || transaction.declaredKwh) {
            const kwh = transaction.kwhAmount || transaction.declaredKwh;
            message += `⚡ KWH: ${kwh}\n`;
            if (announcement) {
                const price = announcement.price || announcement.basePrice;
                const amount = (kwh * price).toFixed(2);
                message += `💰 Totale: €${amount}\n`;
            }
        }

        message += `\n📍 Luogo: ${MarkdownEscape.escape(transaction.location)}\n`;
        message += `🏢 Brand: ${MarkdownEscape.escape(transaction.brand)}\n`;
        message += `🔌 Connettore: ${MarkdownEscape.escape(transaction.connector)}\n`;

        let keyboard = [];

        // Azioni basate sullo stato
        switch (transaction.status) {
            case 'pending_seller_confirmation':
                if (isSeller) {
                    keyboard = [
                        [
                            { text: '✅ Accetto', callback_data: 'tx_accept' },
                            { text: '❌ Rifiuto', callback_data: 'tx_reject' }
                        ]
                    ];
                }
                break;

            case 'confirmed':
                if (isSeller) {
                    keyboard = [
                        [{ text: '⚡ Attiva ricarica', callback_data: 'tx_activate_charging' }]
                    ];
                } else if (isBuyer) {
                    // Mostra bottone per confermare arrivo
                    keyboard = [
                        [{ text: '📍 Sono arrivato alla colonnina', callback_data: 'tx_arrived_at_station' }]
                    ];
                }
                break;

            case 'buyer_arrived':
                if (isSeller) {
                    // QUESTO È IL FIX PRINCIPALE - Mostra i bottoni di attivazione
                    keyboard = [
                        [{ text: '⚡ Attiva ricarica ORA', callback_data: 'tx_activate_charging' }],
                        [{ text: '⏸️ Ritarda di 5 min', callback_data: 'tx_delay_charging' }],
                        [{ text: '❌ Problemi tecnici', callback_data: 'tx_technical_issues' }]
                    ];
                    message += '\n\n⏰ **L\'ACQUIRENTE È ARRIVATO!**\nÈ il momento di attivare la ricarica.';
                } else if (isBuyer) {
                    message += '\n\n⏳ In attesa che il venditore attivi la ricarica...';
                }
                break;

            case 'charging_started':
                if (isBuyer) {
                    keyboard = [
                        [{ text: '✅ Confermo, sta caricando', callback_data: 'tx_charging_confirmed' }],
                        [{ text: '❌ Non sta caricando', callback_data: 'tx_charging_failed' }]
                    ];
                }
                break;

            case 'charging_in_progress':
                if (isBuyer) {
                    keyboard = [
                        [{ text: '🏁 Ricarica completata', callback_data: 'tx_charging_finished' }]
                    ];
                }
                break;

            case 'kwh_declared':
                if (isSeller) {
                    keyboard = [
                        [{ text: '✅ KWH corretti', callback_data: 'tx_kwh_ok' }],
                        [{ text: '❌ KWH non corretti', callback_data: 'tx_kwh_bad' }]
                    ];
                }
                break;

            case 'payment_requested':
                if (isBuyer) {
                    keyboard = [
                        [{ text: '💳 Ho pagato', callback_data: 'tx_payment_done' }]
                    ];
                }
                break;

            case 'payment_declared':
                if (isSeller) {
                    keyboard = [
                        [{ text: '✅ Pagamento ricevuto', callback_data: 'tx_payment_received' }],
                        [{ text: '❌ Non ricevuto', callback_data: 'tx_payment_not_received' }]
                    ];
                }
                break;

            case 'completed':
                keyboard = [
                    [{ text: '⭐ Lascia feedback', callback_data: 'tx_leave_feedback' }]
                ];
                break;
        }

        keyboard.push([{ text: '🔙 Indietro', callback_data: 'tx_back' }]);

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    // Gestione azioni
    scene.action('tx_accept', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction } = ctx.session.transactionData;
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'confirmed'
        );

        try {
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                `✅ **Richiesta accettata!**\n\nIl venditore ha confermato. Ti avviseremo quando sarà il momento della ricarica.`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await ctx.editMessageText('✅ Richiesta accettata! L\'acquirente è stato notificato.');
        return ctx.scene.leave();
    });

    scene.action('tx_reject', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText('📝 Motivo del rifiuto? (scrivi il motivo)');
        ctx.session.waitingFor = 'rejection_reason';
    });

    // NUOVO: Gestione arrivo acquirente dalla scene
    scene.action('tx_arrived_at_station', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction } = ctx.session.transactionData;
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'buyer_arrived'
        );
        
        // Notifica il venditore
        try {
            await bot.chatCleaner.sendPersistentMessage(
                { telegram: ctx.telegram, from: { id: transaction.sellerId } },
                `⏰ **L'ACQUIRENTE È ARRIVATO!**\n\n` +
                `L'acquirente @${MarkdownEscape.escape(ctx.from.username || ctx.from.first_name)} è arrivato alla colonnina ed è pronto per ricaricare.\n\n` +
                `📍 **Posizione:** \`${transaction.location}\`\n` +
                `🏢 **Colonnina:** ${MarkdownEscape.escape(transaction.brand)}\n` +
                `🔌 **Connettore:** ${MarkdownEscape.escape(transaction.connector)}\n` +
                `🔍 **ID Transazione:** \`${transaction.transactionId}\`\n\n` +
                `È il momento di attivare la ricarica!`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⚡ Attiva ricarica ORA', callback_data: `activate_charging_${transaction.transactionId}` }],
                            [{ text: '⏸️ Ritarda di 5 min', callback_data: `delay_charging_${transaction.transactionId}` }],
                            [{ text: '❌ Problemi tecnici', callback_data: `technical_issues_${transaction.transactionId}` }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error notifying seller:', error);
        }
        
        await ctx.editMessageText(
            `✅ **CONFERMATO!**\n\n` +
            `Il venditore è stato avvisato che sei arrivato alla colonnina.\n\n` +
            `⏳ Attendi che il venditore attivi la ricarica.\n\n` +
            `💡 **Suggerimenti:**\n` +
            `• Verifica che il connettore sia quello giusto\n` +
            `• Assicurati che l'auto sia pronta per ricevere la ricarica\n` +
            `• Tieni il cavo a portata di mano`,
            { parse_mode: 'Markdown' }
        );
        
        return ctx.scene.leave();
    });

    scene.action('tx_activate_charging', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction } = ctx.session.transactionData;
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'charging_started'
        );

        try {
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                `⚡ **RICARICA ATTIVATA!**\n\nIl venditore ha attivato la ricarica. Conferma se sta funzionando.\n\nID: \`${transaction.transactionId}\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Sta caricando', callback_data: `charging_ok_${transaction.transactionId}` },
                                { text: '❌ Non carica', callback_data: `charging_fail_${transaction.transactionId}` }
                            ]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await ctx.editMessageText('⚡ Ricarica attivata! In attesa della conferma dell\'acquirente.');
        return ctx.scene.leave();
    });

    // Gestione ritardo
    scene.action('tx_delay_charging', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction } = ctx.session.transactionData;
        
        setTimeout(async () => {
            try {
                await bot.chatCleaner.sendPersistentMessage(
                    { telegram: ctx.telegram, from: { id: ctx.from.id } },
                    `⏰ **PROMEMORIA**\n\nÈ il momento di attivare la ricarica!\n\nID Transazione: \`${transaction.transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⚡ Attiva ricarica ORA', callback_data: `activate_charging_${transaction.transactionId}` }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('Error sending delayed reminder:', error);
            }
        }, 5 * 60 * 1000); // 5 minuti
        
        await ctx.editMessageText(
            '⏸️ Ricarica rimandata di 5 minuti.\n\nRiceverai un promemoria quando sarà il momento di attivare.',
            { parse_mode: 'Markdown' }
        );
        
        return ctx.scene.leave();
    });

    // Gestione problemi tecnici
    scene.action('tx_technical_issues', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction } = ctx.session.transactionData;
        
        await bot.transactionService.addTransactionIssue(
            transaction.transactionId,
            'Problemi tecnici segnalati dal venditore',
            ctx.from.id
        );
        
        try {
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                `⚠️ **PROBLEMI TECNICI**\n\n` +
                `Il venditore segnala problemi tecnici con l'attivazione.\n` +
                `Attendere ulteriori comunicazioni o contattare il venditore.`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }
        
        await ctx.editMessageText('⚠️ Problema tecnico segnalato all\'acquirente.');
        return ctx.scene.leave();
    });

    scene.action('tx_charging_confirmed', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction } = ctx.session.transactionData;
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'charging_in_progress'
        );
        
        await ctx.editMessageText(
            '✅ **RICARICA IN CORSO!**\n\n' +
            'Quando hai terminato la ricarica, premi il pulsante qui sotto.',
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getChargingCompletedKeyboard().reply_markup
            }
        );
    });

    scene.action('tx_charging_failed', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction } = ctx.session.transactionData;
        
        const retryCount = await bot.transactionService.incrementRetryCount(transaction.transactionId);
        
        try {
            await ctx.telegram.sendMessage(
                transaction.sellerId,
                `❌ **PROBLEMA RICARICA**\n\nL'acquirente segnala che la ricarica non è partita. Riprova o verifica il problema.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Keyboards.getRetryActivationKeyboard(retryCount).reply_markup
                }
            );
        } catch (error) {
            console.error('Error notifying seller:', error);
        }
        
        await ctx.editMessageText('❌ Segnalazione inviata al venditore.');
        return ctx.scene.leave();
    });

    scene.action('tx_charging_finished', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '📸 **INVIA FOTO DEL DISPLAY**\n\n' +
            'Scatta una foto chiara del display che mostri i KWH erogati.',
            { parse_mode: 'Markdown' }
        );
        ctx.session.waitingFor = 'display_photo';
    });

    scene.action('tx_kwh_ok', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction, announcement } = ctx.session.transactionData;
        
        // Prima aggiungi i KWH alla transazione se non ci sono
        if (!transaction.kwhAmount && transaction.declaredKwh) {
            await bot.transactionService.updateTransactionWithKwh(
                transaction.transactionId,
                transaction.declaredKwh
            );
            // Ricarica la transazione aggiornata
            ctx.session.transactionData.transaction = await bot.transactionService.getTransaction(transaction.transactionId);
        }
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'payment_requested'
        );

        const updatedTx = await bot.transactionService.getTransaction(transaction.transactionId);

        try {
            // FIX: USA I VALORI GIÀ CALCOLATI NELLA TRANSAZIONE
            let amount;
            let priceInfo = '';
            
            if (updatedTx.totalAmount) {
                // Usa il totale già calcolato
                amount = updatedTx.totalAmount.toFixed(2);
                
                // Aggiungi info sul prezzo se disponibili
                if (updatedTx.pricePerKwh) {
                    priceInfo = `💰 Prezzo: ${updatedTx.pricePerKwh}€/KWH\n`;
                }
                
                // Se è prezzo graduato, mostra la fascia applicata
                if (announcement?.pricingType === 'graduated' && updatedTx.appliedTier) {
                    if (updatedTx.appliedTier.limit) {
                        priceInfo += `📊 Fascia applicata: fino a ${updatedTx.appliedTier.limit} KWH\n`;
                    } else {
                        priceInfo += `📊 Fascia applicata: oltre ${announcement.pricingTiers[announcement.pricingTiers.length - 2]?.limit || '?'} KWH\n`;
                    }
                }
            } else {
                // Fallback: calcolo manuale (non dovrebbe mai accadere se il flusso è corretto)
                console.warn('ATTENZIONE: totalAmount non trovato, usando calcolo fallback');
                const price = announcement?.price || announcement?.basePrice || 0;
                amount = (updatedTx.declaredKwh * price).toFixed(2);
            }
            
            // Messaggio dettagliato per l'acquirente
            let buyerMessage = `✅ **KWH CONFERMATI**\n\n` +
                `Il venditore ha confermato ${updatedTx.declaredKwh} KWH.\n\n`;
            
            // Se è stato applicato il minimo, notifica
            if (updatedTx.actualKwh && updatedTx.actualKwh < updatedTx.declaredKwh) {
                buyerMessage += `⚠️ **Nota:** Hai ricaricato ${updatedTx.actualKwh} KWH ma pagherai per il minimo garantito di ${updatedTx.declaredKwh} KWH.\n\n`;
            }
            
            buyerMessage += priceInfo;
            buyerMessage += `💵 **Totale da pagare: €${amount}**\n\n`;
            buyerMessage += `Procedi con il pagamento come concordato.\n\n`;
            buyerMessage += `ID: \`${transaction.transactionId}\``;
            
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                buyerMessage,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💳 Ho pagato', callback_data: `payment_done_${transaction.transactionId}` }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await ctx.editMessageText('✅ KWH confermati! L\'acquirente procederà con il pagamento.');
        return ctx.scene.leave();
    });

    scene.action('tx_kwh_bad', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '📝 **KWH non corretti**\n\n' +
            'Specifica il problema:\n' +
            '• Quanti KWH mostra realmente la foto?\n' +
            '• Qual è il problema riscontrato?',
            { parse_mode: 'Markdown' }
        );
        ctx.session.waitingFor = 'kwh_dispute';
    });

    scene.action('tx_payment_done', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction } = ctx.session.transactionData;
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'payment_declared'
        );

        try {
            await ctx.telegram.sendMessage(
                transaction.sellerId,
                `💳 **PAGAMENTO DICHIARATO**\n\n` +
                `L'acquirente dichiara di aver effettuato il pagamento.\n` +
                `Conferma la ricezione del pagamento.\n\n` +
                `ID: \`${transaction.transactionId}\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Ricevuto', callback_data: `payment_ok_${transaction.transactionId}` },
                                { text: '❌ Non ricevuto', callback_data: `payment_fail_${transaction.transactionId}` }
                            ]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error notifying seller:', error);
        }

        await ctx.editMessageText('✅ Dichiarazione pagamento inviata al venditore.');
        return ctx.scene.leave();
    });

    scene.action('tx_payment_received', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction } = ctx.session.transactionData;
        
        await bot.transactionService.updateTransactionStatus(
            transaction.transactionId,
            'completed'
        );

        await bot.userService.updateUserTransactionStats(
            transaction.sellerId,
            transaction.actualKwh || transaction.declaredKwh,
            'sell'
        );
        await bot.userService.updateUserTransactionStats(
            transaction.buyerId,
            transaction.actualKwh || transaction.declaredKwh,
            'buy'
        );

        try {
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                `🎉 **TRANSAZIONE COMPLETATA!**\n\nGrazie per aver utilizzato il nostro servizio. Lascia un feedback!\n\nID: \`${transaction.transactionId}\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⭐ Lascia feedback', callback_data: `feedback_tx_${transaction.transactionId}` }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await ctx.editMessageText('🎉 Transazione completata con successo!');
        return ctx.scene.leave();
    });

    scene.action('tx_payment_not_received', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction } = ctx.session.transactionData;
        
        await bot.transactionService.addTransactionIssue(
            transaction.transactionId,
            'Pagamento non ricevuto dal venditore',
            ctx.from.id
        );

        try {
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                `⚠️ **PROBLEMA PAGAMENTO**\n\n` +
                `Il venditore segnala di non aver ricevuto il pagamento.\n\n` +
                `Controlla il metodo di pagamento e riprova, oppure contatta il venditore direttamente.`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Error notifying buyer:', error);
        }

        await ctx.editMessageText('⚠️ Problema pagamento segnalato all\'acquirente.');
        return ctx.scene.leave();
    });

    // Bottone Indietro - torna alla lista delle transazioni
    scene.action('tx_back', async (ctx) => {
        await ctx.answerCbQuery();
        
        // Elimina il messaggio corrente
        try {
            await ctx.deleteMessage();
        } catch (error) {
            console.log('Could not delete message:', error);
        }
        
        // Esci dalla scene
        await ctx.scene.leave();
        
        // Torna alla lista delle transazioni
        const userId = ctx.from.id;
        const transactions = await bot.transactionService.getUserTransactions(userId, 'all');
        
        if (transactions.length === 0) {
            await bot.chatCleaner.sendTemporaryMessage(ctx,
                '📭 Non hai ancora transazioni.',
                {},
                3000
            );
            
            setTimeout(async () => {
                await bot.chatCleaner.resetUserChat(ctx);
            }, 3000);
            return;
        }

        const pending = transactions.filter(t => !['completed', 'cancelled'].includes(t.status));
        const completed = transactions.filter(t => t.status === 'completed');

        let message = '💼 **LE TUE TRANSAZIONI**\n\n';
        
        if (pending.length > 0) {
            message += `⏳ **IN CORSO (${pending.length}):**\n`;
            message += MarkdownEscape.formatTransactionList(
                pending.slice(0, 5),
                bot.getStatusEmoji.bind(bot),
                bot.getStatusText.bind(bot)
            );
        }
        
        message += `✅ **Completate:** ${completed.length}\n`;
        
        await bot.chatCleaner.replaceMessage(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.getTransactionsKeyboard(pending, completed).reply_markup,
            messageType: 'navigation'
        });
    });

    scene.action('tx_leave_feedback', async (ctx) => {
        await ctx.answerCbQuery();
        const { transaction } = ctx.session.transactionData;
        
        ctx.session.completedTransactionId = transaction.transactionId;
        
        await ctx.editMessageText(
            Messages.FEEDBACK_REQUEST,
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getFeedbackKeyboard().reply_markup
            }
        );
        
        return ctx.scene.leave();
    });

    // Callback per ricarica attivata dall'esterno
    scene.action(/^charging_ok_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const transactionId = ctx.match[1];
        
        if (transactionId !== ctx.session.transactionData?.transaction?.transactionId) {
            ctx.session.transactionId = transactionId;
            ctx.session.chargingConfirmed = true;
            return ctx.scene.reenter();
        }
        
        await bot.transactionService.updateTransactionStatus(
            transactionId,
            'charging_in_progress'
        );
        
        await ctx.editMessageText(
            '✅ **RICARICA IN CORSO!**\n\n' +
            'Quando hai terminato la ricarica, premi il pulsante qui sotto.',
            {
                parse_mode: 'Markdown',
                reply_markup: Keyboards.getChargingCompletedKeyboard().reply_markup
            }
        );
    });

    // Gestione input testo
    scene.on('text', async (ctx) => {
        const text = ctx.message.text;

        if (ctx.session.waitingFor === 'rejection_reason') {
            const { transaction } = ctx.session.transactionData;
            
            await bot.transactionService.updateTransactionStatus(
                transaction.transactionId,
                'cancelled',
                { cancellationReason: text }
            );

            try {
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `❌ **Richiesta rifiutata**\n\nMotivo: ${MarkdownEscape.escape(text)}`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.reply('❌ Richiesta rifiutata. L\'acquirente è stato notificato.');
            return ctx.scene.leave();
        }

        if (ctx.session.waitingFor === 'kwh_amount') {
            const kwhAmount = parseFloat(text.replace(',', '.'));
            
            if (isNaN(kwhAmount) || kwhAmount <= 0) {
                await ctx.reply('❌ Inserisci un numero valido di KWH.');
                return;
            }

            const { transaction, announcement } = ctx.session.transactionData;
            
            // IMPORTANTE: Applica il minimo garantito se presente
            let finalKwh = kwhAmount;
            let appliedMinimum = false;
            
            if (announcement && announcement.minimumKwh && kwhAmount < announcement.minimumKwh) {
                finalKwh = announcement.minimumKwh;
                appliedMinimum = true;
            }
            
            // Prima calcola il prezzo
            const calculation = bot.transactionService.calculatePrice(announcement, finalKwh);
            
            await bot.transactionService.updateTransactionStatus(
                transaction.transactionId,
                'kwh_declared',
                { 
                    declaredKwh: finalKwh,  // Usa i KWH con minimo applicato
                    actualKwh: kwhAmount,   // Salva anche i KWH reali
                    appliedMinimum: appliedMinimum,
                    pricePerKwh: calculation.pricePerKwh,
                    totalAmount: calculation.totalAmount,
                    appliedTier: calculation.appliedTier
                }
            );

            try {
                // Importa la classe TransactionCache per accedere al metodo statico
                const { TransactionCache } = require('../utils/TransactionCache');
                const shortId = TransactionCache.generateShortId(transaction.transactionId);
                bot.transactionCache.set(shortId, transaction.transactionId);

                let kwhMessage = appliedMinimum ? 
                    `L'acquirente dichiara ${kwhAmount} KWH.\n⚠️ **Applicato minimo garantito: ${finalKwh} KWH**` :
                    `L'acquirente dichiara ${finalKwh} KWH.`;

                // Aggiungi informazioni sul prezzo
                if (calculation) {
                    kwhMessage += `\n💰 **Prezzo:** ${calculation.pricePerKwh}€/KWH`;
                    kwhMessage += `\n💵 **Totale:** €${calculation.totalAmount.toFixed(2)}`;
                }

                await ctx.telegram.sendMessage(
                    transaction.sellerId,
                    `📸 **RICARICA COMPLETATA**\n\n` +
                    `${kwhMessage}\n` +
                    `Verifica la foto e conferma.\n\n` +
                    `ID: \`${transaction.transactionId}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ Corretti', callback_data: `kwh_ok_${shortId}` },
                                    { text: '❌ Non corretti', callback_data: `kwh_bad_${shortId}` }
                                ]
                            ]
                        }
                    }
                );

                if (ctx.session.photoFileId) {
                    await ctx.telegram.sendPhoto(transaction.sellerId, ctx.session.photoFileId);
                }

            } catch (error) {
                console.error('Error notifying seller:', error);
            }

            await ctx.reply('✅ Dati inviati al venditore per verifica.\n\n' +
                (appliedMinimum ? 
                    `⚠️ **Nota:** Hai ricaricato ${kwhAmount} KWH ma pagherai per il minimo garantito di ${finalKwh} KWH come da condizioni dell'annuncio.` : 
                    '')
            );
            return ctx.scene.leave();
        }

        if (ctx.session.waitingFor === 'kwh_dispute') {
            const { transaction } = ctx.session.transactionData;
            
            await bot.transactionService.addTransactionIssue(
                transaction.transactionId,
                `Discrepanza KWH: ${text}`,
                ctx.from.id
            );

            try {
                await ctx.telegram.sendMessage(
                    transaction.buyerId,
                    `⚠️ **Problema con i KWH dichiarati**\n\n` +
                    `Il venditore segnala: ${MarkdownEscape.escape(text)}\n\n` +
                    `Controlla nuovamente la foto e rispondi al venditore.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error notifying buyer:', error);
            }

            await ctx.reply('⚠️ Problema segnalato all\'acquirente.');
            return ctx.scene.leave();
        }
    });

    // Gestione foto
    scene.on('photo', async (ctx) => {
        if (ctx.session.waitingFor === 'display_photo') {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            ctx.session.photoFileId = photo.file_id;
            ctx.session.waitingFor = 'kwh_amount';
            
            await ctx.reply(
                '📷 Foto ricevuta!\n\n' +
                'Ora inserisci il numero di KWH mostrati sul display:',
                { parse_mode: 'Markdown' }
            );
        }
    });

    return scene;
}

module.exports = { createTransactionScene };
