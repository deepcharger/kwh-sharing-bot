// src/utils/messages/Messages.js - NUOVO FILE (versione semplificata)
const MarkdownEscape = require('../MarkdownEscape');

class Messages {
    // Template messages
    static templates = {
        help: {
            selling: () => `📋 **COME VENDERE KWH**\n\n` +
                `1️⃣ **Crea annuncio:** Clicca "🔋 Vendi KWH"\n` +
                `2️⃣ **Inserisci dati:** Prezzo, tipo corrente, zone, reti\n` +
                `3️⃣ **Pubblico automatico:** L'annuncio appare nel topic\n` +
                `4️⃣ **Ricevi richieste:** Ti notifichiamo ogni interesse\n` +
                `5️⃣ **Gestisci transazione:** Attivi ricarica e confermi pagamento\n\n` +
                `💡 **Suggerimenti:**\n` +
                `• Prezzo competitivo: 0,30-0,40€/KWH\n` +
                `• Rispondi velocemente alle richieste\n` +
                `• Mantieni alta la qualità del servizio`,
            
            buying: () => `🛒 **COME COMPRARE KWH**\n\n` +
                `1️⃣ **Trova annuncio:** Vai nel topic annunci\n` +
                `2️⃣ **Contatta venditore:** Clicca "Contatta venditore"\n` +
                `3️⃣ **Fornisci dettagli:** Data, colonnina, connettore\n` +
                `4️⃣ **Attendi conferma:** Il venditore deve accettare\n` +
                `5️⃣ **Conferma arrivo:** Quando sei alla colonnina\n` +
                `6️⃣ **Ricarica:** Segui le istruzioni per l'attivazione\n` +
                `7️⃣ **Foto display:** Scatta foto dei KWH ricevuti\n` +
                `8️⃣ **Pagamento:** Paga come concordato\n` +
                `9️⃣ **Feedback:** Lascia una valutazione\n\n` +
                `💡 **Suggerimenti:**\n` +
                `• Verifica sempre i dettagli prima di confermare\n` +
                `• Scatta foto nitide del display\n` +
                `• Paga solo dopo conferma del venditore`,
            
            feedback: () => `⭐ **SISTEMA FEEDBACK**\n\n` +
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
                `Lascia feedback onesto e costruttivo per aiutare la community.`,
            
            faq: () => `❓ **DOMANDE FREQUENTI**\n\n` +
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
                `Dipende dall'accesso del venditore. Ogni annuncio specifica le reti disponibili.`
        },
        
        transaction: {
            requestAccepted: (transaction) => {
                let message = `✅ **RICHIESTA ACCETTATA!**\n\n` +
                    `Il venditore ha confermato la tua richiesta per ${MarkdownEscape.escape(transaction.scheduledDate)}.\n\n`;
                
                if (transaction.locationCoords && transaction.locationCoords.latitude && transaction.locationCoords.longitude) {
                    const lat = transaction.locationCoords.latitude;
                    const lng = transaction.locationCoords.longitude;
                    message += `📍 **Posizione:** [Apri in Google Maps](https://www.google.com/maps?q=${lat},${lng})\n`;
                    message += `🧭 Coordinate: \`${lat}, ${lng}\`\n`;
                } else if (transaction.location) {
                    message += `📍 **Posizione:** \`${transaction.location}\`\n`;
                }
                
                message += `🏢 **Brand:** ${MarkdownEscape.escape(transaction.brand)}\n` +
                    `🔌 **Connettore:** ${MarkdownEscape.escape(transaction.connector)}\n\n` +
                    `⚠️ **IMPORTANTE:** Quando arrivi alla colonnina e sei pronto per ricaricare, premi il bottone sotto per avvisare il venditore.\n\n` +
                    `🔍 ID Transazione: \`${transaction.transactionId}\``;
                
                return message;
            }
        }
    };
    
    // Formatters
    static formatters = {
        transaction: {
            listHeader: (pendingCount, completedCount) => 
                `💼 **LE TUE TRANSAZIONI**\n\n` +
                (pendingCount > 0 ? `⏳ **IN CORSO (${pendingCount}):**\n` : '') +
                (completedCount > 0 ? `\n✅ **Completate:** ${completedCount}\n` : '')
        }
    };
}

// Re-export original Messages properties for compatibility
const OriginalMessages = require('../Messages');
Object.keys(OriginalMessages).forEach(key => {
    if (!Messages[key]) {
        Messages[key] = OriginalMessages[key];
    }
});

module.exports = Messages;
