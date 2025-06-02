// src/utils/messages/Messages.js - NUOVO FILE
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
        
        navigation: {
            buyEnergyInfo: () => `🛒 **ACQUISTA ENERGIA**\n\n` +
                `Trova le migliori offerte di ricarica nella tua zona!\n\n` +
                `💡 Ogni annuncio mostra:\n` +
                `• Prezzo per KWH\n` +
                `• Zone servite\n` +
                `• Reti disponibili\n` +
                `• Valutazioni del venditore\n\n` +
                `Clicca sul bottone per vedere le offerte disponibili.`
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
            },
            
            requestRejected: (reason) => 
                `❌ **Richiesta rifiutata**\n\nMotivo: ${MarkdownEscape.escape(reason)}`,
            
            buyerArrivedConfirm: (transaction) => {
                let confirmMessage = `✅ **CONFERMATO!**\n\n` +
                    `Il venditore è stato avvisato che sei arrivato alla colonnina.\n\n`;
                
                if (transaction.locationCoords && transaction.locationCoords.latitude && transaction.locationCoords.longitude) {
                    const lat = transaction.locationCoords.latitude;
                    const lng = transaction.locationCoords.longitude;
                    confirmMessage += `📍 **Posizione:** [Apri in Google Maps](https://www.google.com/maps?q=${lat},${lng})\n`;
                    confirmMessage += `🧭 Coordinate: \`${lat}, ${lng}\`\n\n`;
                } else if (transaction.location) {
                    confirmMessage += `📍 **Posizione:** \`${transaction.location}\`\n\n`;
                }
                
                confirmMessage += `⏳ Attendi che il venditore attivi la ricarica.\n\n` +
                    `💡 **Suggerimenti:**\n` +
                    `• Verifica che il connettore sia quello giusto\n` +
                    `• Assicurati che l'auto sia pronta per ricevere la ricarica\n` +
                    `• Tieni il cavo a portata di mano\n\n` +
                    `🔍 ID Transazione: \`${transaction.transactionId}\``;
                
                return confirmMessage;
            },
            
            contactBuyer: (buyerUsername, buyerId, telegramLink) => {
                let message = `💬 **Contatta l'acquirente**\n\n`;
                
                if (buyerUsername !== 'user') {
                    message += `Puoi contattare direttamente @${MarkdownEscape.escape(buyerUsername)} cliccando qui:\n` +
                        `${telegramLink}\n\n` +
                        `📝 **Suggerimenti per la conversazione:**\n` +
                        `• Conferma i dettagli della ricarica\n` +
                        `• Chiarisci eventuali dubbi sulla colonnina\n` +
                        `• Coordina l'orario se necessario\n` +
                        `• Discuti il metodo di pagamento preferito\n\n` +
                        `⚠️ **Importante:** Dopo aver chiarito tutti i dettagli, torna qui per accettare o rifiutare la richiesta.`;
                } else {
                    message += `L'utente non ha un username pubblico.\n` +
                        `ID Utente: \`${buyerId}\`\n\n` +
                        `Puoi provare a contattarlo tramite il link:\n${telegramLink}\n\n` +
                        `Oppure attendi che ti contatti lui.`;
                }
                
                return message;
            },
            
            details: (transaction, role, statusText, statusEmoji, announcement) => {
                let detailText = MarkdownEscape.formatTransactionDetails(transaction, role, statusText, statusEmoji);
                
                if (announcement) {
                    detailText += `💰 Prezzo: ${announcement.price || announcement.basePrice}€/KWH\n`;
                }
                
                if (transaction.locationCoords && transaction.locationCoords.latitude && transaction.locationCoords.longitude) {
                    const lat = transaction.locationCoords.latitude;
                    const lng = transaction.locationCoords.longitude;
                    detailText += `\n📍 **Posizione:** [Apri in Google Maps](https://www.google.com/maps?q=${lat},${lng})\n`;
                    detailText += `🧭 Coordinate: \`${lat}, ${lng}\`\n`;
                } else if (transaction.location) {
                    detailText += `\n📍 Posizione: \`${transaction.location}\`\n`;
                }
                
                return detailText;
            },
            
            kwhDispute: (reason) => 
                `⚠️ **Problema con i KWH dichiarati**\n\n` +
                `Il venditore segnala: ${MarkdownEscape.escape(reason)}\n\n` +
                `Controlla nuovamente la foto e rispondi al venditore.`,
            
            fullDetails: async (transaction, announcement, isSeller, getStatusText) => {
                const role = isSeller ? 'VENDITORE' : 'ACQUIRENTE';
                
                let detailText = `📋 **DETTAGLI TRANSAZIONE**\n\n`;
                detailText += `🆔 ID: \`${transaction.transactionId}\`\n`;
                detailText += `📊 Stato: ${getStatusText(transaction.status)}\n`;
                detailText += `👤 Ruolo: ${role}\n\n`;
                
                detailText += `📅 Data creazione: ${transaction.createdAt.toLocaleDateString('it-IT')}\n`;
                if (transaction.completedAt) {
                    detailText += `✅ Completata il: ${transaction.completedAt.toLocaleDateString('it-IT')} alle ${transaction.completedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}\n`;
                }
                
                if (transaction.locationCoords && transaction.locationCoords.latitude && transaction.locationCoords.longitude) {
                    const lat = transaction.locationCoords.latitude;
                    const lng = transaction.locationCoords.longitude;
                    detailText += `\n📍 **Posizione:** [Apri in Google Maps](https://www.google.com/maps?q=${lat},${lng})\n`;
                    detailText += `🧭 Coordinate: \`${lat}, ${lng}\`\n`;
                } else if (transaction.location) {
                    detailText += `\n📍 Luogo: ${MarkdownEscape.escape(transaction.location)}\n`;
                }
                
                detailText += `🏢 Brand: ${MarkdownEscape.escape(transaction.brand)}\n`;
                detailText += `🔌 Connettore: ${MarkdownEscape.escape(transaction.connector)}\n`;
                
                if (transaction.declaredKwh || transaction.actualKwh) {
                    detailText += `\n⚡ **Energia:**\n`;
                    if (transaction.actualKwh && transaction.actualKwh !== transaction.declaredKwh) {
                        detailText += `• Ricaricati: ${transaction.actualKwh} KWH\n`;
                        detailText += `• Fatturati: ${transaction.declaredKwh} KWH (minimo applicato)\n`;
                    } else {
                        detailText += `• KWH: ${transaction.declaredKwh || transaction.actualKwh}\n`;
                    }
                }
                
                if (announcement && transaction.declaredKwh) {
                    const price = announcement.price || announcement.basePrice;
                    const amount = (transaction.declaredKwh * price).toFixed(2);
                    detailText += `\n💰 **Pagamento:**\n`;
                    detailText += `• Prezzo: ${price}€/KWH\n`;
                    detailText += `• Totale: €${amount}\n`;
                }
                
                return detailText;
            },
            
            pendingList: (pending, getStatusEmoji, getStatusText) => {
                return MarkdownEscape.formatTransactionList(pending, getStatusEmoji, getStatusText);
            },
            
            historySection: (title, transactions, userId, cacheFunction) => {
                let message = `✅ **${title} (${transactions.length}):**\n\n`;
                
                transactions.forEach((tx, index) => {
                    const date = tx.completedAt ? tx.completedAt.toLocaleDateString('it-IT') : tx.createdAt.toLocaleDateString('it-IT');
                    const time = tx.completedAt ? tx.completedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
                    
                    const kwh = tx.declaredKwh || tx.actualKwh || '?';
                    const role = tx.sellerId === userId ? '📤' : '📥';
                    
                    const shortId = tx.transactionId.slice(-10);
                    cacheFunction(shortId, tx.transactionId);
                });
                
                if (transactions.length > 10) {
                    message += `\n_...e altre ${transactions.length - 10} transazioni completate_\n`;
                }
                
                return message;
            },
            
            cancelledSection: (transactions, cacheFunction) => {
                let message = `\n❌ **ANNULLATE (${transactions.length}):**\n\n`;
                
                transactions.forEach((tx, index) => {
                    const date = tx.createdAt.toLocaleDateString('it-IT');
                    const reason = tx.cancellationReason ? ' - ' + tx.cancellationReason.substring(0, 20) : '';
                    
                    const shortId = tx.transactionId.slice(-10);
                    cacheFunction(shortId, tx.transactionId);
                });
                
                if (transactions.length > 5) {
                    message += `\n_...e altre ${transactions.length - 5} transazioni annullate_\n`;
                }
                
                return message;
            }
        },
        
        charging: {
            chargingStarted: (transactionId) => 
                `⚡ **RICARICA ATTIVATA!**\n\n` +
                `Il venditore ha attivato la ricarica.\n` +
                `Controlla il connettore e conferma se la ricarica è iniziata.\n\n` +
                `💡 **Se non sta caricando:**\n` +
                `• Verifica che il cavo sia inserito bene\n` +
                `• Controlla che l'auto sia pronta\n` +
                `• Riprova l'attivazione\n\n` +
                `ID Transazione: \`${transactionId}\``,
            
            delayReminder: (transactionId) => 
                `⏰ **PROMEMORIA**\n\nÈ il momento di attivare la ricarica!\n\nID Transazione: \`${transactionId}\``,
            
            technicalIssues: () => 
                `⚠️ **PROBLEMI TECNICI**\n\n` +
                `Il venditore segnala problemi tecnici con l'attivazione della ricarica.\n\n` +
                `Attendere ulteriori comunicazioni o contattare il venditore direttamente.`,
            
            chargingConfirmedBySeller: (buyer, transactionId) => 
                `✅ **RICARICA CONFERMATA!**\n\n` +
                `L'acquirente @${MarkdownEscape.escape(buyer.username || buyer.first_name)} ha confermato che la ricarica è in corso.\n\n` +
                `⚡ La ricarica sta procedendo correttamente.\n` +
                `⏳ Attendi che l'acquirente completi la ricarica e invii la foto del display.\n\n` +
                `🔍 ID Transazione: \`${transactionId}\``,
            
            chargingInProgressBuyer: (transactionId) => 
                `✅ **RICARICA IN CORSO!**\n\n` +
                `Perfetto! La ricarica sta procedendo.\n\n` +
                `Quando hai terminato, usa il bot per inviare la foto del display con i KWH erogati.\n\n` +
                `💡 **Prossimi passi:**\n` +
                `1. Completa la ricarica\n` +
                `2. Scatta foto del display\n` +
                `3. Invia tramite "Gestisci transazione"`,
            
            chargingFailedNotify: (transaction, transactionId) => 
                `❌ **PROBLEMA RICARICA**\n\n` +
                `L'acquirente segnala che la ricarica non è partita.\n\n` +
                `🔌 Connettore: ${MarkdownEscape.escape(transaction.connector)}\n` +
                `📍 Colonnina: ${MarkdownEscape.escape(transaction.brand)}\n` +
                `🔍 ID Transazione: \`${transactionId}\`\n\n` +
                `Riprova l'attivazione o verifica il problema.`,
            
            retryAttempt: (transactionId) => 
                `⚡ **NUOVO TENTATIVO DI ATTIVAZIONE**\n\n` +
                `Il venditore sta riprovando ad attivare la ricarica.\n` +
                `Controlla se ora funziona.\n\n` +
                `ID: \`${transactionId}\``,
            
            sendDisplayPhoto: () => 
                `📸 **INVIA FOTO DEL DISPLAY**\n\n` +
                `Scatta una foto chiara del display che mostri i KWH erogati.\n\n` +
                `📱 Suggerimenti per la foto:\n` +
                `• Inquadra bene il display\n` +
                `• Assicurati che i numeri siano leggibili\n` +
                `• Evita riflessi sullo schermo`,
            
            kwhConfirmed: (transaction, announcement, amount) => {
                let buyerMessage = `✅ **KWH CONFERMATI DAL VENDITORE**\n\n`;
                
                if (transaction.actualKwh && transaction.actualKwh < transaction.declaredKwh) {
                    buyerMessage += `⚠️ **ATTENZIONE:** Hai ricaricato ${transaction.actualKwh} KWH ma pagherai per il minimo garantito di ${transaction.declaredKwh} KWH come da condizioni dell'annuncio.\n\n`;
                } else {
                    buyerMessage += `Il venditore ha confermato la ricezione di ${transaction.declaredKwh} KWH.\n\n`;
                }
                
                if (transaction.pricePerKwh) {
                    buyerMessage += `💰 **Dettagli pagamento:**\n`;
                    buyerMessage += `• Prezzo unitario: ${transaction.pricePerKwh}€/KWH\n`;
                    
                    if (announcement?.pricingType === 'graduated' && transaction.appliedTier) {
                        buyerMessage += `• Fascia applicata: `;
                        if (transaction.appliedTier.limit) {
                            buyerMessage += `fino a ${transaction.appliedTier.limit} KWH\n`;
                        } else {
                            buyerMessage += `oltre ${announcement.pricingTiers[announcement.pricingTiers.length - 2].limit} KWH\n`;
                        }
                    }
                    
                    buyerMessage += `• **Totale da pagare: €${amount}**\n\n`;
                } else {
                    buyerMessage += `💰 **Importo totale: €${amount}**\n\n`;
                }
                
                buyerMessage += `💳 **Procedi con il pagamento**\n` +
                    `Metodi accettati: ${MarkdownEscape.escape(announcement?.paymentMethods || 'Come concordato')}\n\n` +
                    `Una volta effettuato il pagamento, premi il pulsante qui sotto.\n\n` +
                    `🔍 ID Transazione: \`${transaction.transactionId}\``;
                
                return buyerMessage;
            }
        },
        
        payment: {
            paymentDeclared: (buyer, transaction, amount) => 
                `💳 **PAGAMENTO DICHIARATO**\n\n` +
                `L'acquirente @${MarkdownEscape.escape(buyer.username || buyer.first_name)} dichiara di aver pagato.\n\n` +
                `💰 Importo dichiarato: €${amount}\n` +
                `⚡ KWH forniti: ${transaction.declaredKwh || 'N/A'}\n` +
                `🔍 ID Transazione: \`${transaction.transactionId}\`\n\n` +
                `Hai ricevuto il pagamento?`,
            
            paymentDeclaredConfirm: () => 
                `✅ **DICHIARAZIONE PAGAMENTO INVIATA!**\n\n` +
                `Il venditore è stato notificato e dovrà confermare la ricezione del pagamento.\n\n` +
                `Riceverai aggiornamenti sullo stato della transazione.`,
            
            paymentInProgress: () => 
                `⏰ **PAGAMENTO IN CORSO**\n\n` +
                `Hai indicato che stai ancora effettuando il pagamento.\n\n` +
                `Una volta completato, torna qui e premi "Ho effettuato il pagamento".`,
            
            paymentNotReceived: () => 
                `⚠️ **PROBLEMA PAGAMENTO**\n\n` +
                `Il venditore segnala di non aver ricevuto il pagamento.\n\n` +
                `Controlla il metodo di pagamento e riprova, oppure contatta il venditore direttamente.`,
            
            retryPayment: () => 
                `💳 **Riprova il pagamento**\n\n` +
                `Effettua nuovamente il pagamento secondo gli accordi presi con il venditore.\n\n` +
                `Una volta completato, usa il pulsante per confermare.`,
            
            sendProof: () => 
                `📷 **Invia screenshot del pagamento**\n\n` +
                `Scatta uno screenshot che mostri chiaramente:\n` +
                `• Importo inviato\n` +
                `• Data/ora transazione\n` +
                `• Destinatario\n\n` +
                `Invia la foto ora:`,
            
            proceedWithPayment: (transaction, amount, announcement) => 
                `💳 **PROCEDI CON IL PAGAMENTO**\n\n` +
                `🆔 Transazione: \`${transaction.transactionId}\`\n` +
                `⚡ KWH confermati: ${transaction.declaredKwh || 'N/A'}\n` +
                `💰 Importo: €${amount}\n` +
                `💳 Metodi accettati: ${MarkdownEscape.escape(announcement?.paymentMethods || 'Come concordato')}\n\n` +
                `Effettua il pagamento secondo i metodi concordati, poi conferma.`,
            
            paymentDeclaration: (buyer, transaction, amount) => 
                `💳 **DICHIARAZIONE PAGAMENTO**\n\n` +
                `L'acquirente @${MarkdownEscape.escape(buyer.username || buyer.first_name)} dichiara di aver pagato.\n\n` +
                `💰 Importo dichiarato: €${amount}\n` +
                `⚡ KWH forniti: ${transaction.declaredKwh || 'N/A'}\n` +
                `💰 Prezzo unitario: ${transaction.pricePerKwh || 'N/A'}€/KWH\n` +
                `🔍 ID Transazione: \`${transaction.transactionId}\`\n\n` +
                `Hai ricevuto il pagamento?`,
            
            paymentSentConfirm: (transactionId, transaction, amount) => 
                `✅ **DICHIARAZIONE PAGAMENTO INVIATA!**\n\n` +
                `🆔 Transazione: \`${transactionId}\`\n` +
                `⚡ KWH: ${transaction.declaredKwh}\n` +
                `💰 Importo: €${amount}\n\n` +
                `Il venditore riceverà una notifica e dovrà confermare la ricezione del pagamento.\n\n` +
                `Riceverai aggiornamenti sullo stato della transazione.`,
            
            proofCaption: (buyer, transactionId) => 
                `📷 **PROVA PAGAMENTO**\n\n` +
                `Da: @${MarkdownEscape.escape(buyer.username || buyer.first_name)}\n` +
                `Transazione: \`${transactionId}\``
        },
        
        feedback: {
            requestFeedback: (transaction, role) => {
                const message = `🎉 **TRANSAZIONE COMPLETATA!**\n\n`;
                
                if (role === 'buyer') {
                    return message + 
                        `Il venditore ha confermato la ricezione del pagamento.\n\n` +
                        `⭐ **Lascia un feedback**\n` +
                        `La tua valutazione aiuta la community a crescere.\n\n` +
                        `🔍 ID Transazione: \`${transaction.transactionId}\``;
                } else {
                    return message + 
                        `Hai confermato la ricezione del pagamento.\n\n` +
                        `⭐ **Lascia un feedback**\n` +
                        `Valuta l'acquirente per aiutare la community.\n\n` +
                        `🔍 ID Transazione: \`${transaction.transactionId}\``;
                }
            },
            
            noMissingFeedback: () => 
                `✅ **NESSUN FEEDBACK MANCANTE**\n\n` +
                `Hai lasciato feedback per tutte le transazioni completate!\n\n` +
                `Grazie per contribuire alla community.`,
            
            missingList: (missingFeedback, userId) => {
                let message = `⭐ **FEEDBACK MANCANTI**\n\n`;
                message += `Hai ${missingFeedback.length} transazioni senza feedback:\n\n`;
                
                missingFeedback.slice(0, 5).forEach((tx, index) => {
                    const role = tx.sellerId === userId ? '📤 Vendita' : '📥 Acquisto';
                    const date = tx.completedAt || tx.createdAt;
                    const kwh = tx.declaredKwh || tx.actualKwh || '?';
                    
                    message += `${index + 1}. ${role} del ${date.toLocaleDateString('it-IT')} - ${kwh} KWH\n`;
                });
                
                if (missingFeedback.length > 5) {
                    message += `\n... e altre ${missingFeedback.length - 5} transazioni`;
                }
                
                return message;
            }
        },
        
        announcement: {
            userList: (announcements, announcementService) => {
                let message = '📊 **I TUOI ANNUNCI ATTIVI:**\n\n';
                
                for (const ann of announcements) {
                    message += MarkdownEscape.formatAnnouncement(ann);
                    message += `📅 Pubblicato: ${ann.createdAt.toLocaleDateString('it-IT')}\n`;
                    
                    if (announcementService.needsGroupRefresh && announcementService.needsGroupRefresh(ann)) {
                        message += '🔄 *Timer da aggiornare*\n';
                    }
                    
                    message += '\n';
                }
                
                return message;
            },
            
            buttonText: (ann) => {
                let buttonText = `📍 ${ann.location ? ann.location.substring(0, 20) : ann.zones.substring(0, 20)}`;
                if ((ann.location || ann.zones).length > 20) buttonText += '...';
                
                if (ann.pricingType === 'fixed') {
                    buttonText += ` - ${ann.basePrice || ann.price}€/KWH`;
                } else if (ann.pricingTiers && ann.pricingTiers.length > 0) {
                    buttonText += ` - da ${ann.pricingTiers[0].price}€`;
                }
                
                return buttonText;
            },
            
            extensionSuccess: (announcement) => 
                `✅ **ANNUNCIO ESTESO!**\n\n` +
                `Il tuo annuncio \`${announcement.announcementId}\` è stato esteso per altre 24 ore.\n\n` +
                `Nuova scadenza: domani alla stessa ora.`,
            
            extensionSuccessWithInstructions: () => 
                `✅ **ANNUNCIO ESTESO!**\n\n` +
                `Il tuo annuncio è stato esteso per altre 24 ore.\n\n` +
                `💡 Per aggiornare il timer nel gruppo:\n` +
                `1. Vai in "📊 I miei annunci"\n` +
                `2. Seleziona questo annuncio\n` +
                `3. Clicca "🔄 Aggiorna timer" se disponibile`,
            
            statistics: (announcement, annTransactions) => {
                let statsText = `📊 **STATISTICHE ANNUNCIO**\n\n`;
                statsText += `🆔 ID: \`${announcement.announcementId}\`\n\n`;
                statsText += `📈 **Transazioni:**\n`;
                statsText += `• Totali: ${annTransactions.length}\n`;
                statsText += `• Completate: ${annTransactions.filter(t => t.status === 'completed').length}\n`;
                statsText += `• In corso: ${annTransactions.filter(t => !['completed', 'cancelled'].includes(t.status)).length}\n`;
                statsText += `• Annullate: ${annTransactions.filter(t => t.status === 'cancelled').length}\n\n`;
                
                const completedTx = annTransactions.filter(t => t.status === 'completed');
                if (completedTx.length > 0) {
                    const totalKwh = completedTx.reduce((sum, t) => sum + (t.actualKwh || 0), 0);
                    statsText += `⚡ **KWH venduti:** ${totalKwh.toFixed(1)}\n`;
                }
                
                return statsText;
            }
        },
        
        admin: {
            generalStats: (stats, announcementStats) => {
                let statsText = '📊 **STATISTICHE DETTAGLIATE**\n\n';
                
                if (stats && stats.overall) {
                    statsText += `🔄 **Transazioni:**\n`;
                    statsText += `• Totali: ${stats.overall.totalTransactions || 0}\n`;
                    statsText += `• Completate: ${stats.overall.completedTransactions || 0}\n`;
                    statsText += `• Tasso successo: ${stats.overall.totalTransactions > 0 ? 
                        ((stats.overall.completedTransactions / stats.overall.totalTransactions) * 100).toFixed(1) : 0}%\n`;
                    statsText += `• KWH totali: ${(stats.overall.totalKwh || 0).toFixed(1)}\n\n`;
                }
                
                if (announcementStats) {
                    statsText += `📋 **Annunci:**\n`;
                    statsText += `• Attivi: ${announcementStats.totalActive || 0}\n`;
                    statsText += `• Prezzo medio: €${(announcementStats.avgPrice || 0).toFixed(3)}/KWH\n`;
                    statsText += `• Range prezzi: €${(announcementStats.minPrice || 0).toFixed(2)} - €${(announcementStats.maxPrice || 0).toFixed(2)}\n`;
                }
                
                return statsText;
            }
        }
    };
    
    // Re-export original Messages properties for compatibility
    static get WELCOME() {
        return require('../Messages').WELCOME;
    }
    
    static get SELL_WELCOME() {
        return require('../Messages').SELL_WELCOME;
    }
    
    static get HELP_TEXT() {
        return require('../Messages').HELP_TEXT;
    }
    
    static get FEEDBACK_REQUEST() {
        return require('../Messages').FEEDBACK_REQUEST;
    }
    
    static get NEGATIVE_FEEDBACK_REASON() {
        return require('../Messages').NEGATIVE_FEEDBACK_REASON;
    }
    
    static formatPriceExamples(announcement) {
        return require('../Messages').formatPriceExamples(announcement);
    }
    
    static formatUserStats(userStats) {
        return require('../Messages').formatUserStats(userStats);
    }
    
    static getStatusText(status) {
        return require('../Messages').getStatusText(status);
    }
    
    static getStatusEmoji(status) {
        return require('../Messages').getStatusEmoji(status);
    }
}

module.exports = Messages;
