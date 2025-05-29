// src/utils/MarkdownEscape.js

class MarkdownEscape {
    /**
     * Escape tutti i caratteri speciali Markdown ECCETTO quando sono dentro backtick
     * @param {string} text - Il testo da escapare
     * @param {boolean} isInlineCode - True se il testo è dentro backtick
     * @returns {string} - Il testo con caratteri escaped
     */
    static escape(text, isInlineCode = false) {
        if (!text) return '';
        
        // Converti in stringa se non lo è già
        text = String(text);
        
        // Se è inline code (dentro backtick), non fare escape
        if (isInlineCode) {
            return text;
        }
        
        // Lista completa dei caratteri da escapare in Markdown
        return text
            .replace(/\\/g, '\\\\')  // Backslash (deve essere primo!)
            .replace(/\*/g, '\\*')   // Asterisco
            .replace(/_/g, '\\_')    // Underscore
            .replace(/\[/g, '\\[')   // Parentesi quadra aperta
            .replace(/\]/g, '\\]')   // Parentesi quadra chiusa
            .replace(/\(/g, '\\(')   // Parentesi tonda aperta
            .replace(/\)/g, '\\)')   // Parentesi tonda chiusa
            .replace(/~/g, '\\~')    // Tilde
            .replace(/`/g, '\\`')    // Backtick
            .replace(/>/g, '\\>')    // Maggiore
            .replace(/#/g, '\\#')    // Hash
            .replace(/\+/g, '\\+')   // Più
            .replace(/-/g, '\\-')    // Meno
            .replace(/=/g, '\\=')    // Uguale
            .replace(/\|/g, '\\|')   // Pipe
            .replace(/\{/g, '\\{')   // Parentesi graffa aperta
            .replace(/\}/g, '\\}')   // Parentesi graffa chiusa
            .replace(/\./g, '\\.')   // Punto
            .replace(/!/g, '\\!');   // Punto esclamativo
    }

    /**
     * Escape solo i caratteri più problematici (underscore, asterischi)
     * Utile per testi che potrebbero già avere alcuni escape
     * @param {string} text - Il testo da escapare
     * @returns {string} - Il testo con caratteri minimi escaped
     */
    static escapeMinimal(text) {
        if (!text) return '';
        
        text = String(text);
        
        return text
            .replace(/\*/g, '\\*')   // Asterisco
            .replace(/_/g, '\\_');   // Underscore
    }

    /**
     * Formatta un ID per essere copiabile (dentro backtick) senza escape
     * @param {string} id - L'ID da formattare
     * @returns {string} - L'ID formattato con backtick
     */
    static formatId(id) {
        if (!id) return '';
        // Rimuovi eventuali escape esistenti prima di mettere nei backtick
        const cleanId = String(id).replace(/\\/g, '');
        return `\`${cleanId}\``;
    }

    /**
     * Formatta un messaggio con campi misti (testo normale e ID copiabili)
     * @param {Object} fields - Oggetto con i campi del messaggio
     * @returns {string} - Il messaggio formattato
     */
    static formatMessage(fields) {
        let message = '';
        
        for (const [key, value] of Object.entries(fields)) {
            if (value.isId) {
                // ID dentro backtick, senza escape
                message += `${value.label}: ${this.formatId(value.text)}\n`;
            } else if (value.isBold) {
                // Testo in grassetto con escape
                message += `**${this.escape(value.text)}**\n`;
            } else {
                // Testo normale con escape
                message += `${value.label}: ${this.escape(value.text)}\n`;
            }
        }
        
        return message;
    }

    /**
     * Formatta i dettagli di una transazione in modo sicuro per Markdown
     * @param {Object} transaction - L'oggetto transazione
     * @param {string} role - Il ruolo dell'utente
     * @param {string} statusText - Testo dello stato
     * @param {string} statusEmoji - Emoji dello stato
     * @returns {string} - Il messaggio formattato
     */
    static formatTransactionDetails(transaction, role = 'ACQUIRENTE', statusText = '', statusEmoji = '') {
        let message = '💼 **DETTAGLI TRANSAZIONE**\n\n';
        
        // ID sempre dentro backtick senza escape
        message += `🆔 ID: \`${transaction.transactionId}\`\n`;
        message += `👤 Ruolo: **${role}**\n`;
        message += `${statusEmoji} Stato: **${this.escape(statusText || transaction.status)}**\n\n`;
        
        // FIX: Applica escape a TUTTI i campi che potrebbero contenere caratteri speciali
        message += `📅 Data ricarica: ${this.escape(transaction.scheduledDate || '')}\n`;
        message += `🏢 Brand: ${this.escape(transaction.brand || '')}\n`;
        message += `📍 Posizione: ${this.escape(transaction.location || '')}\n`;
        message += `🔌 Connettore: ${this.escape(transaction.connector || '')}\n\n`;
        
        if (transaction.price) {
            message += `💰 Prezzo: ${transaction.price}€/KWH\n`;
        }
        
        return message;
    }

    /**
     * Formatta una richiesta di acquisto in modo sicuro
     * @param {Object} data - Dati della richiesta
     * @returns {string} - Il messaggio formattato
     */
    static formatPurchaseRequest(data) {
        let message = `📥 **NUOVA RICHIESTA DI ACQUISTO**\n\n`;
        message += `👤 Da: @${this.escape(data.username || data.firstName || 'utente')}\n`;
        message += `📅 Data/ora: ${this.escape(data.scheduledDate)}\n`;
        message += `🏢 Brand: ${this.escape(data.brand)}\n`;
        message += `⚡ Tipo: ${this.escape(data.currentType)}\n`;
        message += `📍 Posizione: \`${data.location}\`\n`;
        message += `🔌 Connettore: ${this.escape(data.connector)}\n\n`;
        message += `🔍 ID Transazione: \`${data.transactionId}\``;
        
        return message;
    }

    /**
     * Formatta un annuncio in modo sicuro
     * @param {Object} announcement - L'annuncio
     * @returns {string} - Il messaggio formattato
     */
    static formatAnnouncement(announcement) {
        let message = '';
        
        // ID sempre in backtick
        message += `🆔 \`${announcement.announcementId}\`\n`;
        
        // Posizione in backtick per renderla copiabile
        message += `📍 Posizione: \`${announcement.location || announcement.zones}\`\n`;
        
        // Altri campi con escape
        message += `💰 Prezzo: ${announcement.price || announcement.basePrice}€/KWH\n`;
        
        if (announcement.currentType) {
            message += `⚡ Corrente: ${this.escape(announcement.currentType)}\n`;
        }
        
        if (announcement.networks) {
            message += `🌐 Reti: ${this.escape(announcement.networks)}\n`;
        }
        
        if (announcement.paymentMethods) {
            message += `💳 Pagamenti: ${this.escape(announcement.paymentMethods)}\n`;
        }
        
        return message;
    }

    /**
     * Helper per formattare liste di transazioni
     * @param {Array} transactions - Array di transazioni
     * @param {Function} getStatusEmoji - Funzione per ottenere emoji
     * @param {Function} getStatusText - Funzione per ottenere testo stato
     * @returns {string} - Il messaggio formattato
     */
    static formatTransactionList(transactions, getStatusEmoji, getStatusText) {
        let message = '';
        
        for (const tx of transactions) {
            const statusEmoji = getStatusEmoji(tx.status);
            const statusText = this.escape(getStatusText(tx.status));
            const displayId = tx.transactionId.length > 15 ? 
                tx.transactionId.substring(2, 12) + '...' : 
                tx.transactionId;
            
            message += `${statusEmoji} \`${displayId}\`\n`;
            message += `📊 ${statusText}\n`;
            message += `📅 ${tx.createdAt.toLocaleDateString('it-IT')}\n\n`;
        }
        
        return message;
    }
}

module.exports = MarkdownEscape;
