// src/utils/ChatCleaner.js
class ChatCleaner {
    constructor(bot) {
        this.bot = bot;
        this.messageHistory = new Map(); // Traccia messaggi per utente
        this.cleanupQueue = new Map(); // Coda di messaggi da eliminare
        this.maxHistorySize = 50; // Max messaggi per utente
    }

    // Salva il riferimento di un messaggio da eliminare dopo
    saveMessageForCleanup(userId, messageId, type = 'temporary', autoDeleteMs = null) {
        if (!this.messageHistory.has(userId)) {
            this.messageHistory.set(userId, []);
        }
        
        const messageRef = {
            messageId,
            type,
            timestamp: Date.now(),
            autoDelete: autoDeleteMs
        };
        
        this.messageHistory.get(userId).push(messageRef);
        
        // Auto-delete se specificato
        if (autoDeleteMs) {
            this.scheduleAutoDelete(userId, messageId, autoDeleteMs);
        }
        
        // Mantieni solo gli ultimi N messaggi per utente
        this.trimUserHistory(userId);
    }

    // Programma l'eliminazione automatica di un messaggio
    scheduleAutoDelete(userId, messageId, delayMs) {
        setTimeout(async () => {
            try {
                await this.bot.bot.telegram.deleteMessage(userId, messageId);
                this.removeMessageFromHistory(userId, messageId);
                console.log(`🗑️ Auto-deleted message ${messageId} for user ${userId}`);
            } catch (error) {
                // Messaggio già eliminato o non trovato
                console.log(`Could not auto-delete message ${messageId}:`, error.description);
            }
        }, delayMs);
    }

    // Rimuove un messaggio specifico dalla cronologia
    removeMessageFromHistory(userId, messageId) {
        const messages = this.messageHistory.get(userId) || [];
        const filtered = messages.filter(msg => msg.messageId !== messageId);
        this.messageHistory.set(userId, filtered);
    }

    // Mantieni solo gli ultimi N messaggi per utente
    trimUserHistory(userId) {
        const messages = this.messageHistory.get(userId) || [];
        if (messages.length > this.maxHistorySize) {
            const trimmed = messages.slice(-this.maxHistorySize);
            this.messageHistory.set(userId, trimmed);
        }
    }

    // Elimina messaggi temporanei dell'utente
    async cleanupUserMessages(ctx, types = ['temporary']) {
        const userId = ctx.from.id;
        const messages = this.messageHistory.get(userId) || [];
        
        for (const msg of messages) {
            if (types.includes(msg.type)) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, msg.messageId);
                } catch (error) {
                    // Messaggio già eliminato o non trovato
                    console.log(`Could not delete message ${msg.messageId}:`, error.description);
                }
            }
        }
        
        // Rimuovi messaggi eliminati dalla cronologia
        const remaining = messages.filter(msg => !types.includes(msg.type));
        this.messageHistory.set(userId, remaining);
    }

    // Invia messaggio e elimina i precedenti temporanei
    async replaceMessage(ctx, text, options = {}) {
        try {
            // Elimina messaggi temporanei precedenti se richiesto
            if (options.cleanupBefore !== false) {
                await this.cleanupUserMessages(ctx, ['temporary', 'navigation']);
            }
            
            // Invia nuovo messaggio
            const sentMessage = await ctx.reply(text, options);
            
            // Salva per eventuale pulizia futura
            const messageType = options.messageType || 'temporary';
            const autoDelete = options.autoDelete || null;
            
            this.saveMessageForCleanup(
                ctx.from.id, 
                sentMessage.message_id, 
                messageType,
                autoDelete
            );
            
            return sentMessage;
        } catch (error) {
            console.error('Error in replaceMessage:', error);
            return await ctx.reply(text, options);
        }
    }

    // Modifica messaggio esistente o crea nuovo se non possibile
    async editOrReplace(ctx, text, options = {}) {
        try {
            if (ctx.callbackQuery?.message) {
                // Se è un callback, modifica il messaggio esistente
                const editedMessage = await ctx.editMessageText(text, options);
                
                // Aggiorna il tipo di messaggio se specificato
                if (options.messageType) {
                    this.updateMessageType(ctx.from.id, ctx.callbackQuery.message.message_id, options.messageType);
                }
                
                return editedMessage;
            } else {
                // Altrimenti crea nuovo messaggio con pulizia
                return await this.replaceMessage(ctx, text, options);
            }
        } catch (error) {
            // Se edit fallisce, crea nuovo messaggio
            console.log('Edit failed, creating new message:', error.description);
            return await this.replaceMessage(ctx, text, options);
        }
    }

    // Aggiorna il tipo di un messaggio esistente
    updateMessageType(userId, messageId, newType) {
        const messages = this.messageHistory.get(userId) || [];
        const messageRef = messages.find(msg => msg.messageId === messageId);
        if (messageRef) {
            messageRef.type = newType;
        }
    }

    // Invia messaggio importante che non va eliminato
    async sendPersistentMessage(ctxOrParams, text, options = {}) {
        let ctx, chatId;
        
        if (ctxOrParams.telegram) {
            // Parametri custom per notifiche
            ctx = ctxOrParams.telegram;
            chatId = ctxOrParams.from.id;
        } else {
            // Contesto normale
            ctx = ctxOrParams;
            chatId = ctx.chat.id;
        }
        
        try {
            const sentMessage = await ctx.sendMessage(chatId, text, options);
            
            // Salva come messaggio persistente
            this.saveMessageForCleanup(
                chatId, 
                sentMessage.message_id, 
                'persistent'
            );
            
            return sentMessage;
        } catch (error) {
            console.error('Error in sendPersistentMessage:', error);
            throw error;
        }
    }

    // Invia messaggio con auto-eliminazione
    async sendTemporaryMessage(ctx, text, options = {}, autoDeleteMs = 5000) {
        const sentMessage = await ctx.reply(text, options);
        
        this.saveMessageForCleanup(
            ctx.from.id,
            sentMessage.message_id,
            'temporary',
            autoDeleteMs
        );
        
        return sentMessage;
    }

    // Pulizia completa chat utente e ritorno al menu
    async resetUserChat(ctx) {
        // Elimina tutti i messaggi temporanei e di navigazione
        await this.cleanupUserMessages(ctx, ['temporary', 'navigation', 'confirmation']);
        
        // Invia menu principale pulito
        return await ctx.reply(
            '🏠 **Menu Principale**\n\nSeleziona un\'opzione:',
            {
                parse_mode: 'Markdown',
                reply_markup: this.bot.bot.telegraf?.extra?.markdown()?.markup?.keyboard([
                    ['🔋 Vendi KWH', '📥 Richieste pendenti'],
                    ['📊 I miei annunci', '💼 Le mie transazioni'],
                    ['⭐ I miei feedback', '❓ Aiuto']
                ]).resize().persistent() || undefined,
                messageType: 'menu'
            }
        );
    }

    // Gestione messaggi di conferma con auto-eliminazione
    async sendConfirmationMessage(ctx, text, options = {}) {
        const sentMessage = await ctx.reply(text, {
            ...options,
            parse_mode: options.parse_mode || 'Markdown'
        });
        
        // Auto-elimina dopo 5 secondi
        this.saveMessageForCleanup(
            ctx.from.id,
            sentMessage.message_id,
            'confirmation',
            5000
        );
        
        return sentMessage;
    }

    // Gestione messaggi di errore con auto-eliminazione
    async sendErrorMessage(ctx, text, options = {}) {
        const sentMessage = await ctx.reply(text, {
            ...options,
            parse_mode: 'Markdown'
        });
        
        // Auto-elimina dopo 8 secondi
        this.saveMessageForCleanup(
            ctx.from.id,
            sentMessage.message_id,
            'error',
            8000
        );
        
        return sentMessage;
    }

    // Pulizia periodica di messaggi vecchi (oltre 2 ore)
    cleanupOldMessages() {
        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
        let cleanedCount = 0;
        
        for (const [userId, messages] of this.messageHistory.entries()) {
            const recentMessages = messages.filter(msg => {
                const isRecent = msg.timestamp > twoHoursAgo;
                const isPersistent = msg.type === 'persistent';
                const isMenu = msg.type === 'menu';
                
                if (!isRecent && !isPersistent && !isMenu) {
                    cleanedCount++;
                }
                
                return isRecent || isPersistent || isMenu;
            });
            
            this.messageHistory.set(userId, recentMessages);
        }
        
        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} old message references`);
        }
    }

    // Pulizia profonda (rimuove tutto tranne messaggi critici)
    deepCleanup() {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        let cleanedUsers = 0;
        
        for (const [userId, messages] of this.messageHistory.entries()) {
            const criticalMessages = messages.filter(msg => {
                const isRecent = msg.timestamp > oneDayAgo;
                const isCritical = ['persistent', 'transaction', 'payment'].includes(msg.type);
                
                return isRecent && isCritical;
            });
            
            if (criticalMessages.length < messages.length) {
                cleanedUsers++;
                this.messageHistory.set(userId, criticalMessages);
            }
        }
        
        console.log(`🧹 Deep cleanup completed for ${cleanedUsers} users`);
    }

    // Elimina un messaggio specifico immediatamente
    async deleteMessage(ctx, messageId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            this.removeMessageFromHistory(ctx.from.id, messageId);
            return true;
        } catch (error) {
            console.log(`Could not delete message ${messageId}:`, error.description);
            return false;
        }
    }

    // Statistiche per debugging
    getStats() {
        const totalUsers = this.messageHistory.size;
        let totalMessages = 0;
        const typeStats = {};
        
        for (const [userId, messages] of this.messageHistory.entries()) {
            totalMessages += messages.length;
            
            for (const msg of messages) {
                typeStats[msg.type] = (typeStats[msg.type] || 0) + 1;
            }
        }
        
        return {
            totalUsers,
            totalMessages,
            averagePerUser: totalMessages / Math.max(totalUsers, 1),
            messageTypes: typeStats
        };
    }

    // Metodo per scene - mantieni il messaggio della scene ma pulisci il resto
    async enterScene(ctx, sceneName) {
        // Pulisci messaggi temporanei prima di entrare nella scene
        await this.cleanupUserMessages(ctx, ['temporary', 'navigation']);
        
        // Entra nella scene
        return await ctx.scene.enter(sceneName);
    }

    // Metodo per uscire da scene con pulizia
    async leaveScene(ctx) {
        if (ctx.scene) {
            await ctx.scene.leave();
        }
        
        // Pulisci messaggi della scene
        await this.cleanupUserMessages(ctx, ['scene', 'temporary']);
        
        // Torna al menu pulito
        return await this.resetUserChat(ctx);
    }
}

module.exports = ChatCleaner;