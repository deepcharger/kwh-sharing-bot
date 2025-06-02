// src/utils/Messages.js - File di compatibilità completo per import legacy
const MarkdownEscape = require('./MarkdownEscape');
const { TRANSACTION_STATUS } = require('../config/constants');

// Import formatters for compatibility
const formatters = require('./messages/formatters');

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
        [TRANSACTION_STATUS.PENDING_SELLER]: 'In attesa di conferma venditore',
        [TRANSACTION_STATUS.CONFIRMED]: 'Confermata',
        [TRANSACTION_STATUS.BUYER_ARRIVED]: 'Acquirente arrivato',
        [TRANSACTION_STATUS.CHARGING_STARTED]: 'Ricarica avviata',
        [TRANSACTION_STATUS.CHARGING_IN_PROGRESS]: 'In ricarica',
        [TRANSACTION_STATUS.CHARGING_COMPLETED]: 'Ricarica completata',
        [TRANSACTION_STATUS.PHOTO_UPLOADED]: 'Foto caricata',
        [TRANSACTION_STATUS.KWH_DECLARED]: 'KWH dichiarati',
        [TRANSACTION_STATUS.PAYMENT_REQUESTED]: 'Pagamento richiesto',
        [TRANSACTION_STATUS.PAYMENT_DECLARED]: 'Pagamento dichiarato',
        [TRANSACTION_STATUS.COMPLETED]: 'Completata',
        [TRANSACTION_STATUS.CANCELLED]: 'Annullata',
        [TRANSACTION_STATUS.DISPUTED]: 'In disputa'
    };
    return statusTexts[status] || status;
}

function getStatusEmoji(status) {
    const statusEmojis = {
        [TRANSACTION_STATUS.PENDING_SELLER]: '⏳',
        [TRANSACTION_STATUS.CONFIRMED]: '✅',
        [TRANSACTION_STATUS.BUYER_ARRIVED]: '📍',
        [TRANSACTION_STATUS.CHARGING_STARTED]: '⚡',
        [TRANSACTION_STATUS.CHARGING_IN_PROGRESS]: '🔋',
        [TRANSACTION_STATUS.CHARGING_COMPLETED]: '🏁',
        [TRANSACTION_STATUS.PHOTO_UPLOADED]: '📷',
        [TRANSACTION_STATUS.KWH_DECLARED]: '📊',
        [TRANSACTION_STATUS.PAYMENT_REQUESTED]: '💳',
        [TRANSACTION_STATUS.PAYMENT_DECLARED]: '💰',
        [TRANSACTION_STATUS.COMPLETED]: '✅',
        [TRANSACTION_STATUS.CANCELLED]: '❌',
        [TRANSACTION_STATUS.DISPUTED]: '⚠️'
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
        noMissingFeedback: () => NO_MISSING_FEEDBACK
    },
    
    payment: {
        pendingList: formatters.payment ? formatters.payment.pendingList : async () => 'Formatters non disponibili'
    },
    
    transaction: {
        summary: formatTransactionSummary,
        listHeader: formatters.transaction ? formatters.transaction.listHeader : () => 'Header non disponibile',
        details: formatters.transaction ? formatters.transaction.details : () => 'Dettagli non disponibili'
    },
    
    announcement: {
        summary: formatAnnouncementSummary,
        userList: formatters.announcement ? formatters.announcement.userList : () => 'Lista non disponibile'
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
    TRANSACTION_STATUS
};
