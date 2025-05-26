const { Scenes } = require('telegraf');
const Messages = require('../utils/Messages');
const Keyboards = require('../utils/Keyboards');

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

        await this.showTransactionStatus(ctx);
    });

    scene.showTransactionStatus = async function(ctx) {
        const { transaction, announcement, isSeller, isBuyer } = ctx.session.transactionData;
        
        let message = `📋 **TRANSAZIONE**\n\n`;
        message += `🆔 ID: \`${transaction.transactionId}\`\n`;
        message += `📊 Stato: ${bot.getStatusText(transaction.status)}\n`;
        message += `📅 Data: ${transaction.createdAt.toLocaleDateString('it-IT')}\n`;

        if (transaction.kwhAmount) {
            message += `⚡ KWH: ${transaction.kwhAmount}\n`;
            message += `💰 Totale: €${transaction.totalAmount?.toFixed(2) || '0.00'}\n`;
        }

        message += `\n📍 Luogo: ${transaction.location}\n`;
        message += `🏢 Brand: ${transaction.brand}\n`;
        message += `🔌 Connettore: ${transaction.connector}\n`;

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
    };

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
                `⚡ **RICARICA ATTIVATA!**\n\nIl venditore ha attivato la ricarica. Conferma se sta funzionando.`,
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
            await ctx.telegram.sendMessage(
                transaction.buyerId,
                `✅ **KWH CONFERMATI**\n\n` +
                `Il venditore ha confermato ${updatedTx.declaredKwh} KWH.\n` +
                `💰 Totale da pagare: €${updatedTx.totalAmount?.toFixed(2) || '0.00'}\n\n` +
                `Procedi con il pagamento come concordato.`,
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
                `🎉 **TRANSAZIONE COMPLETATA!**\n\nGrazie per aver utilizzato il nostro servizio. Lascia un feedback!`,
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

    scene.action('tx_back', async (ctx) => {
        await ctx.answerCbQuery();
        return ctx.scene.leave();
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
                    `❌ **Richiesta rifiutata**\n\nMotivo: ${text}`,
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

            const { transaction } = ctx.session.transactionData;
            
            await bot.transactionService.updateTransactionStatus(
                transaction.transactionId,
                'kwh_declared',
                { declaredKwh: kwhAmount, actualKwh: kwhAmount }
            );

            try {
                await ctx.telegram.sendMessage(
                    transaction.sellerId,
                    `📸 **RICARICA COMPLETATA**\n\n` +
                    `L'acquirente dichiara ${kwhAmount} KWH.\n` +
                    `Verifica la foto e conferma.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ Corretti', callback_data: `kwh_ok_${transaction.transactionId}` },
                                    { text: '❌ Non corretti', callback_data: `kwh_bad_${transaction.transactionId}` }
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

            await ctx.reply('✅ Dati inviati al venditore per verifica.');
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
