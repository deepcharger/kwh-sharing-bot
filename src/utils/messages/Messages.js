// src/utils/messages/Messages.js - File di compatibilità completo per import legacy
const MarkdownEscape = require('../MarkdownEscape'); // FIX: Percorso corretto
const { TRANSACTION_STATUS } = require('../../config/constants'); // FIX: Percorso corretto

// Import formatters for compatibility - con fallback per evitare errori
let formatters;
try {
    formatters = require('./formatters');
} catch (error) {
    console.warn('Formatters not available, using fallback');
    formatters = {};
}

// Messaggi di base
const WELCOME = `🔋 **Benvenuto in KWH Sharing Bot!**

Il marketplace per la condivisione di energia elettrica.

🛒 **Comprare energia**: Trova offerte vicino a te
🔋 **Vendere energia**: Pubblica il tuo annuncio
📊 **Gestire**: Controlla annunci e transazioni

Usa i pulsanti qui sotto per iniziare!`;

const SELL_WELCOME = `🔋 **CREA IL TUO ANNUNCIO**

Iniziamo a creare il tuo annuncio per vendere energia.

I seguenti step ti guideranno attraverso la configurazione:
• Tipo di corrente supportata
• Prezzo per KWH
• Zone servite
• Reti disponibili
• Metodi di pagamento

Pronto per iniziare?`;

const HELP_TEXT = `❓ **GUIDA AL BOT**

📝 **Come funziona:**
1. I venditori pubblicano annunci con prezzo e posizione
2. Gli acquirenti trovano offerte e fanno richieste
3. Si accordano su orario e modalità
4. Completano la transazione con feedback

🔗 **Comandi utili:**
• \`/menu\` - Torna al menu principale
• \`/help\` - Mostra questa guida
• \`/pagamenti\` - Gestisci pagamenti in sospeso
• \`/feedback_mancanti\` - Lascia feedback mancanti

💡 **Suggerimenti:**
• Usa i pulsanti per navigare facilmente
• Controlla sempre i feedback dei venditori
• Comunica chiaramente orari e posizione`;

const FEEDBACK_REQUEST = `⭐ **VALUTA LA TRANSAZIONE**

Come è andata questa transazione?
Seleziona una valutazione da 1 a 5 stelle:

1⭐ = Pessima esperienza
2⭐ = Esperienza negativa  
3⭐ = Esperienza nella norma
4⭐ = Buona esperienza
5⭐ = Esperienza eccellente`;

const NEGATIVE_FEEDBACK_REASON = `📝 **Descrivi il problema**

Hai dato una valutazione bassa. Per favore spiega brevemente cosa è andato storto così possiamo migliorare il servizio:

_Scrivi il motivo del problema..._`;

const CHARGING_FAILED_RETRY = `❌ **RICARICA NON RIUSCITA**

L'acquirente ha segnalato che la ricarica non è partita.

Cosa vuoi fare?`;

// Messaggi per feedback mancanti
const MISSING_FEEDBACK_HEADER = `⭐ **FEEDBACK MANCANTI**

Hai alcune transazioni completate senza feedback:`;

const NO_MISSING_FEEDBACK = `✅ **NESSUN FEEDBACK MANCANTE**

Hai lasciato feedback per tutte le transazioni completate!

Grazie per contribuire alla community.`;

// Messaggi per pagamenti
const PAYMENT_RECEIVED_CONFIRM = `✅ **PAGAMENTO CONFERMATO**

Hai confermato la ricezione del pagamento.
La transazione è ora completata!`;

const PAYMENT_SENT_CONFIRM = `✅ **PAGAMENTO INVIATO**

La tua dichiarazione di pagamento è stata inviata al venditore.
Attendi la conferma di ricezione.`;

// Messaggi per notifiche
const TRANSACTION_UPDATE_TITLE = `🔔 **AGGIORNAMENTO TRANSAZIONE**`;
const REMINDER_TITLE = `⏰ **PROMEMORIA**`;
const SYSTEM_NOTIFICATION = `🔧 **NOTIFICA DI SISTEMA**`;

// Funzioni di formattazione legacy (per compatibilità)
function formatPriceExamples(announcement) {
    if (!announcement) return '';
    
    const examples = [10, 30, 50, 100];
    let result = '\n💰 **Esempi di costo:**\n';
    
    for (const kwh of examples) {
        let cost = 0;
        
        if (announcement.pricingType === 'fixed') {
            const price = announcement.basePrice || announcement.price || 0;
            cost = kwh * price;
        } else if (announcement.pricingType === 'graduated' && announcement.pricingTiers) {
            // Find applicable tier
            let applicableTier = announcement.pricingTiers[announcement.pricingTiers.length - 1];
            for (let tier of announcement.pricingTiers) {
                if (tier.limit === null || kwh <= tier.limit) {
                    applicableTier = tier;
                    break;
                }
            }
            cost = kwh * (applicableTier?.price || 0);
        }
        
        result += `• ${kwh} KWH → €${cost.toFixed(2)}\n`;
    }
    
    return result;
}

function formatUserStats(userStats) {
    if (!userStats) return 'Statistiche non disponibili.';
    
    // Usa il nuovo formatter se disponibile
    if (formatters && formatters.admin && formatters.admin.userStats) {
        return formatters.admin.userStats(userStats);
    }
    
    // Fallback alla versione legacy
    let message = `📊 **LE TUE STATISTICHE**\n\n`;
    
    // Transazioni
    message += `🔄 **Transazioni:**\n`;
    message += `• Come venditore: ${userStats.sellerTransactions || 0}\n`;
    message += `• Come acquirente: ${userStats.buyerTransactions || 0}\n`;
    message += `• Totali: ${(userStats.sellerTransactions || 0) + (userStats.buyerTransactions || 0)}\n\n`;
    
    // KWH
    if (userStats.totalKwhSold || userStats.totalKwhBought) {
        message += `⚡ **Energia:**\n`;
        if (userStats.totalKwhSold) {
            message += `• KWH venduti: ${userStats.totalKwhSold.toFixed(1)}\n`;
        }
        if (userStats.totalKwhBought) {
            message += `• KWH acquistati: ${userStats.totalKwhBought.toFixed(1)}\n`;
        }
        message += '\n';
    }
    
    // Feedback
    if (userStats.totalFeedback > 0) {
        message += `⭐ **Feedback:**\n`;
        message += `• Totali ricevuti: ${userStats.totalFeedback}\n`;
        message += `• Valutazione media: ${userStats.averageRating.toFixed(1)}/5\n`;
        message += `• Feedback positivi: ${userStats.positivePercentage}%\n`;
        
        // Badge
        if (userStats.sellerBadge) {
            const badgeEmoji = userStats.sellerBadge === 'TOP' ? '🌟' : '✅';
            message += `• Badge: ${badgeEmoji} VENDITORE ${userStats.sellerBadge}\n`;
        }
        message += '\n';
    }
    
    // Data iscrizione
    if (userStats.memberSince) {
        message += `📅 **Membro dal:** ${userStats.memberSince.toLocaleDateString('it-IT')}`;
    }
    
    return message;
}

function getStatusText(status) {
    const statusTexts = {
        'pending_seller': 'In attesa di conferma venditore',
        'confirmed': 'Confermata',
        'buyer_arrived': 'Acquirente arrivato',
        'charging_started': 'Ricarica avviata',
        'charging_in_progress': 'In ricarica',
        'charging_completed': 'Ricarica completata',
        'photo_uploaded': 'Foto caricata',
        'kwh_declared': 'KWH dichiarati',
        'payment_requested': 'Pagamento richiesto',
        'payment_declared': 'Pagamento dichiarato',
        'completed': 'Completata',
        'cancelled': 'Annullata',
        'disputed': 'In disputa'
    };
    return statusTexts[status] || status;
}

function getStatusEmoji(status) {
    const statusEmojis = {
        'pending_seller': '⏳',
        'confirmed': '✅',
        'buyer_arrived': '📍',
        'charging_started': '⚡',
        'charging_in_progress': '🔋',
        'charging_completed': '🏁',
        'photo_uploaded': '📷',
        'kwh_declared': '📊',
        'payment_requested': '💳',
        'payment_declared': '💰',
        'completed': '✅',
        'cancelled': '❌',
        'disputed': '⚠️'
    };
    return statusEmojis[status] || '❓';
}

// Funzioni di formattazione avanzate
function formatTransactionSummary(transaction) {
    const status = getStatusText(transaction.status);
    const emoji = getStatusEmoji(transaction.status);
    const date = transaction.createdAt.toLocaleDateString('it-IT');
    
    return `${emoji} **${status}**\n📅 ${date}\n🆔 \`${transaction.transactionId}\``;
}

function formatAnnouncementSummary(announcement) {
    const price = announcement.price || announcement.basePrice || 0;
    const location = announcement.location || announcement.zones || 'Non specificata';
    const date = announcement.createdAt.toLocaleDateString('it-IT');
    
    return `💰 **${price.toFixed(3)}€/KWH**\n📍 ${MarkdownEscape.escape(location.substring(0, 30))}\n📅 ${date}`;
}

function formatNotificationMessage(type, title, content, options = {}) {
    let message = '';
    
    switch (type) {
        case 'transaction':
            message = `${TRANSACTION_UPDATE_TITLE}\n\n${content}`;
            break;
        case 'reminder':
            message = `${REMINDER_TITLE}\n\n${content}`;
            break;
        case 'system':
            message = `${SYSTEM_NOTIFICATION}\n\n${content}`;
            break;
        default:
            message = content;
    }
    
    if (options.timestamp) {
        message += `\n\n🕐 ${new Date().toLocaleString('it-IT')}`;
    }
    
    return message;
}

// Templates object per compatibilità
const templates = {
    feedback: {
        noMissingFeedback: () => NO_MISSING_FEEDBACK,
        requestFeedback: (transaction, role) => {
            const otherRole = role === 'buyer' ? 'venditore' : 'acquirente';
            return `⭐ **TRANSAZIONE COMPLETATA**\n\nLa transazione è stata completata con successo!\n\nVuoi lasciare un feedback per il ${otherRole}?\n\nID Transazione: \`${transaction.transactionId}\``;
        }
    },
    
    payment: {
        pendingList: async (paymentPending, announcements, session) => {
            let message = `💳 **PAGAMENTI IN SOSPESO**\n\n`;
            message += `Hai ${paymentPending.length} pagamenti da effettuare:\n\n`;
            
            const keyboard = [];
            
            for (let i = 0; i < paymentPending.length; i++) {
                const tx = paymentPending[i];
                const announcement = announcements[i];
                
                const amount = announcement && tx.declaredKwh ? 
                    (tx.declaredKwh * (announcement.price || announcement.basePrice)).toFixed(2) : 'N/A';
                
                const displayId = tx.transactionId.slice(-10);
                message += `🆔 \`${displayId}\`\n`;
                message += `⚡ KWH: ${tx.declaredKwh || 'N/A'}\n`;
                message += `💰 Importo: €${amount}\n\n`;
                
                keyboard.push([{
                    text: `💳 Paga €${amount} - ID ${displayId}`,
                    callback_data: `select_payment_${tx.transactionId}`
                }]);
            }
            
            keyboard.push([{ text: '🏠 Menu principale', callback_data: 'back_to_main' }]);
            
            return {
                message,
                keyboard: { inline_keyboard: keyboard }
            };
        },
        
        proceedWithPayment: (transaction, amount, announcement) => {
            return `💳 **PROCEDI CON IL PAGAMENTO**\n\n` +
                `🆔 ID: \`${transaction.transactionId}\`\n` +
                `⚡ KWH: ${transaction.declaredKwh}\n` +
                `💰 Importo: €${amount}\n\n` +
                `Effettua il pagamento al venditore e poi conferma qui sotto.`;
        },
        
        paymentSentConfirm: (transactionId, transaction, amount) => {
            return `✅ **PAGAMENTO DICHIARATO**\n\n` +
                `La tua dichiarazione di pagamento è stata inviata al venditore.\n\n` +
                `🆔 ID: \`${transactionId}\`\n` +
                `💰 Importo: €${amount}\n\n` +
                `Attendi la conferma di ricezione dal venditore.`;
        },
        
        paymentDeclaration: (buyer, transaction, amount) => {
            return `💰 **DICHIARAZIONE PAGAMENTO**\n\n` +
                `L'acquirente @${buyer.username || buyer.first_name} dichiara di aver effettuato il pagamento.\n\n` +
                `🆔 ID: \`${transaction.transactionId}\`\n` +
                `💰 Importo: €${amount}\n\n` +
                `Hai ricevuto il pagamento?`;
        },
        
        paymentDeclared: (buyer, transaction, amount) => {
            return `💰 **PAGAMENTO DICHIARATO**\n\n` +
                `L'acquirente @${buyer.username || buyer.first_name} ha dichiarato di aver pagato €${amount}.\n\n` +
                `🆔 ID: \`${transaction.transactionId}\`\n\n` +
                `Confermi di aver ricevuto il pagamento?`;
        }
    },
    
    transaction: {
        summary: formatTransactionSummary,
        listHeader: (pendingCount, completedCount) => {
            let message = `💼 **LE TUE TRANSAZIONI**\n\n`;
            message += `📊 **Riepilogo:**\n`;
            message += `• In corso: ${pendingCount}\n`;
            message += `• Completate: ${completedCount}\n\n`;
            
            if (pendingCount > 0) {
                message += `🔄 **TRANSAZIONI IN CORSO:**\n\n`;
            } else {
                message += `✅ Non hai transazioni in corso.\n\n`;
            }
            
            return message;
        },
        
        requestAccepted: (transaction) => {
            return `✅ **RICHIESTA ACCETTATA**\n\n` +
                `Il venditore ha accettato la tua richiesta!\n\n` +
                `🆔 ID: \`${transaction.transactionId}\`\n` +
                `📅 Appuntamento: ${transaction.scheduledDate}\n` +
                `📍 Luogo: ${transaction.location}\n\n` +
                `Vai alla colonnina all'orario concordato e premi il pulsante quando arrivi.`;
        },
        
        requestRejected: (reason) => {
            return `❌ **RICHIESTA RIFIUTATA**\n\n` +
                `Il venditore ha rifiutato la tua richiesta.\n\n` +
                `**Motivo:** ${MarkdownEscape.escape(reason)}\n\n` +
                `Puoi cercare altre offerte o contattare direttamente il venditore.`;
        },
        
        buyerArrivedConfirm: (transaction) => {
            return `📍 **ARRIVO CONFERMATO**\n\n` +
                `Hai confermato di essere arrivato alla colonnina.\n\n` +
                `🆔 ID: \`${transaction.transactionId}\`\n\n` +
                `Il venditore è stato notificato e procederà con l'attivazione della ricarica.`;
        },
        
        contactBuyer: (buyerUsername, buyerId, telegramLink) => {
            return `💬 **CONTATTA L'ACQUIRENTE**\n\n` +
                `Puoi contattare l'acquirente direttamente:\n\n` +
                `👤 Nome: @${buyerUsername !== 'user' ? buyerUsername : 'Utente'}\n` +
                `🆔 ID: \`${buyerId}\`\n\n` +
                `[📱 Apri chat Telegram](${telegramLink})`;
        }
    },
    
    charging: {
        chargingStarted: (transactionId) => {
            return `⚡ **RICARICA AVVIATA**\n\n` +
                `Il venditore ha attivato la ricarica.\n\n` +
                `🆔 ID: \`${transactionId}\`\n\n` +
                `Verifica che la ricarica sia iniziata correttamente.`;
        },
        
        chargingConfirmedBySeller: (buyer, transactionId) => {
            return `✅ **RICARICA CONFERMATA**\n\n` +
                `L'acquirente @${buyer.username || buyer.first_name} ha confermato che la ricarica è in corso.\n\n` +
                `🆔 ID: \`${transactionId}\`\n\n` +
                `Tutto procede regolarmente.`;
        },
        
        sendDisplayPhoto: () => {
            return `📷 **INVIA FOTO DEL DISPLAY**\n\n` +
                `Ricarica completata! Ora invia una foto del display della colonnina che mostra i KWH ricaricati.\n\n` +
                `⚠️ **Importante:** La foto deve mostrare chiaramente i KWH effettivi ricaricati.`;
        },
        
        kwhConfirmed: (transaction, announcement, amount) => {
            return `✅ **KWH CONFERMATI**\n\n` +
                `Il venditore ha confermato i KWH ricaricati.\n\n` +
                `🆔 ID: \`${transaction.transactionId}\`\n` +
                `⚡ KWH: ${transaction.declaredKwh}\n` +
                `💰 Totale: €${amount}\n\n` +
                `Procedi con il pagamento al venditore.`;
        }
    },
    
    announcement: {
        summary: formatAnnouncementSummary,
        userList: (announcements, announcementService) => {
            let message = '📊 **I TUOI ANNUNCI ATTIVI:**\n\n';
            
            for (const ann of announcements) {
                message += `🆔 \`${ann.announcementId}\`\n`;
                message += `📍 Posizione: \`${ann.location || ann.zones}\`\n`;
                message += `💰 Prezzo: ${(ann.price || ann.basePrice).toFixed(3)}€/KWH\n`;
                message += `📅 Pubblicato: ${ann.createdAt.toLocaleDateString('it-IT')}\n\n`;
            }
            
            return message;
        },
        
        extensionSuccess: (announcement) => {
            return `✅ **ANNUNCIO ESTESO**\n\n` +
                `Il tuo annuncio è stato esteso per altre 24 ore.\n\n` +
                `🆔 ID: \`${announcement.announcementId}\`\n\n` +
                `Aggiorna manualmente il timer nel gruppo se necessario.`;
        },
        
        extensionSuccessWithInstructions: () => {
            return `✅ **ANNUNCIO ESTESO!**\n\n` +
                `Il tuo annuncio è stato esteso per altre 24 ore.\n\n` +
                `⚠️ **Nota:** Il timer nel gruppo potrebbe richiedere alcuni minuti per aggiornarsi automaticamente.`;
        }
    },
    
    help: {
        selling: () => {
            return `📋 **GUIDA VENDITA**\n\n` +
                `**Come vendere energia:**\n\n` +
                `1️⃣ Crea un annuncio con prezzo e zona\n` +
                `2️⃣ Attendi richieste di acquisto\n` +
                `3️⃣ Accetta o rifiuta le richieste\n` +
                `4️⃣ Incontra l'acquirente alla colonnina\n` +
                `5️⃣ Attiva la ricarica quando arriva\n` +
                `6️⃣ Conferma i KWH ricaricati\n` +
                `7️⃣ Ricevi il pagamento\n` +
                `8️⃣ Lascia feedback reciproco\n\n` +
                `💡 **Suggerimenti:**\n` +
                `• Sii puntuale agli appuntamenti\n` +
                `• Comunica chiaramente la posizione\n` +
                `• Controlla che la ricarica funzioni`;
        },
        
        buying: () => {
            return `🛒 **GUIDA ACQUISTO**\n\n` +
                `**Come comprare energia:**\n\n` +
                `1️⃣ Cerca offerte nelle zone di interesse\n` +
                `2️⃣ Contatta il venditore per accordarti\n` +
                `3️⃣ Attendi la conferma della richiesta\n` +
                `4️⃣ Vai alla colonnina all'orario concordato\n` +
                `5️⃣ Conferma il tuo arrivo\n` +
                `6️⃣ Attendi l'attivazione della ricarica\n` +
                `7️⃣ Effettua il pagamento\n` +
                `8️⃣ Lascia feedback\n\n` +
                `💡 **Suggerimenti:**\n` +
                `• Controlla sempre i feedback del venditore\n` +
                `• Porta i contanti se richiesti\n` +
                `• Verifica che la ricarica sia iniziata`;
        },
        
        feedback: () => {
            return `⭐ **SISTEMA FEEDBACK**\n\n` +
                `**Perché è importante:**\n` +
                `• Crea fiducia nella community\n` +
                `• Aiuta a identificare venditori affidabili\n` +
                `• Migliora l'esperienza per tutti\n\n` +
                `**Come funziona:**\n` +
                `• Scala da 1 a 5 stelle\n` +
                `• 1-2 stelle: esperienza negativa\n` +
                `• 3 stelle: nella norma\n` +
                `• 4-5 stelle: esperienza positiva\n\n` +
                `**Badge venditori:**\n` +
                `🌟 **VENDITORE TOP**: 95%+ feedback positivi (min 20)\n` +
                `✅ **VENDITORE AFFIDABILE**: 90%+ feedback positivi (min 10)`;
        },
        
        faq: () => {
            return `❓ **DOMANDE FREQUENTI**\n\n` +
                `**Q: Come funzionano i pagamenti?**\n` +
                `A: I pagamenti avvengono direttamente tra venditore e acquirente. Il bot gestisce solo la dichiarazione.\n\n` +
                `**Q: Cosa succede se c'è un problema?**\n` +
                `A: Usa il sistema di segnalazione o contatta l'admin.\n\n` +
                `**Q: Posso annullare una transazione?**\n` +
                `A: Sì, ma comunica sempre il motivo all'altra parte.\n\n` +
                `**Q: Come vengono calcolati i prezzi graduati?**\n` +
                `A: Il prezzo varia in base alla quantità: più KWH = prezzo più basso.\n\n` +
                `**Q: I miei dati sono sicuri?**\n` +
                `A: Sì, memorizziamo solo i dati necessari per il funzionamento.`;
        }
    },
    
    notification: {
        format: formatNotificationMessage
    }
};

// Export tutto per compatibilità completa
module.exports = {
    // Messaggi base
    WELCOME,
    SELL_WELCOME,
    HELP_TEXT,
    FEEDBACK_REQUEST,
    NEGATIVE_FEEDBACK_REASON,
    CHARGING_FAILED_RETRY,
    MISSING_FEEDBACK_HEADER,
    NO_MISSING_FEEDBACK,
    PAYMENT_RECEIVED_CONFIRM,
    PAYMENT_SENT_CONFIRM,
    TRANSACTION_UPDATE_TITLE,
    REMINDER_TITLE,
    SYSTEM_NOTIFICATION,
    
    // Funzioni di formattazione legacy
    formatPriceExamples,
    formatUserStats,
    getStatusText,
    getStatusEmoji,
    formatTransactionSummary,
    formatAnnouncementSummary,
    formatNotificationMessage,
    
    // Formatters object (nuovi)
    formatters,
    
    // Templates object (legacy + nuovi)
    templates,
    
    // Costanti di stato per compatibilità
    TRANSACTION_STATUS: {
        PENDING_SELLER: 'pending_seller',
        CONFIRMED: 'confirmed',
        BUYER_ARRIVED: 'buyer_arrived',
        CHARGING_STARTED: 'charging_started',
        CHARGING_IN_PROGRESS: 'charging_in_progress',
        CHARGING_COMPLETED: 'charging_completed',
        PHOTO_UPLOADED: 'photo_uploaded',
        KWH_DECLARED: 'kwh_declared',
        PAYMENT_REQUESTED: 'payment_requested',
        PAYMENT_DECLARED: 'payment_declared',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled',
        DISPUTED: 'disputed'
    }
};
