class Messages {
    // FIX: Aggiunto il messaggio WELCOME mancante
    static get WELCOME() {
        return `👋 *Benvenuto nel Bot KWH Sharing!*

🔋 Questo bot ti permette di:
• Pubblicare annunci di vendita KWH
• Acquistare KWH da altri utenti  
• Gestire transazioni in sicurezza
• Lasciare e ricevere feedback

Per utilizzare il bot devi essere membro del gruppo autorizzato.

✅ *Verificato!* Sei abilitato ad usare il bot.

Usa i pulsanti qui sotto per navigare:`;
    }

    static get NOT_GROUP_MEMBER() {
        return `❌ *Accesso negato*

Devi essere membro del gruppo autorizzato per utilizzare questo bot.

Contatta l'amministratore per maggiori informazioni.`;
    }

    static get HELP_TEXT() {
        return `❓ *GUIDA BOT KWH SHARING*

🔋 *VENDERE KWH:*
1. Clicca "🔋 Vendi KWH"
2. Inserisci prezzo, tipo corrente, zone coperte
3. Il bot pubblicherà l'annuncio nel topic
4. Riceverai notifiche per ogni richiesta

🛒 *COMPRARE KWH:*
1. Vai nel topic degli annunci
2. Clicca "Contatta venditore" su un annuncio
3. Segui la procedura guidata
4. Dopo la ricarica, scatta foto del display

⭐ *FEEDBACK:*
• Ogni transazione richiede feedback reciproco
• >90% feedback positivi = VENDITORE AFFIDABILE
• >95% feedback positivi = VENDITORE TOP

📞 *Supporto:* Contatta @${process.env.ADMIN_USERNAME || 'admin'}`;
    }

    static get SELL_START() {
        return `💰 *CREAZIONE ANNUNCIO DI VENDITA*

Iniziamo con le informazioni base del tuo annuncio.

💶 *Inserisci il prezzo per KWH:*
Esempio: 0,35

💡 *Suggerimento:* Il prezzo medio di mercato è 0,30-0,40€/KWH`;
    }

    static get SELL_CURRENT_TYPE() {
        return `⚡ *CHE TIPO DI CORRENTE OFFRI?*

Seleziona il tipo di ricarica che puoi attivare:

🔌 *DC* = Ricarica veloce/ultrarapida
⚡ *AC* = Ricarica normale/accelerata  
🔋 *Entrambi* = Puoi attivare sia AC che DC
⚡ *DC minimo 30KW* = Solo DC con potenza minima`;
    }

    static get SELL_ZONES() {
        return `🌍 *INDICA LE ZONE COPERTE:*

Specifica dove puoi attivare ricariche.

*Esempi:*
• ITALIA E ESTERO
• LOMBARDIA  
• MILANO CENTRO
• AUTOSTRADE A1-A4
• EUROPA

Scrivi le zone che copri:`;
    }

    static get SELL_NETWORKS() {
        return `🔌 *RETI DI RICARICA DISPONIBILI*

Quali reti di colonnine puoi attivare?

🌐 *Tutte le colonnine* - Hai accesso universale
📝 *Reti specifiche* - Hai accesso a reti particolari

Seleziona un'opzione:`;
    }

    static get SELL_NETWORKS_SPECIFIC() {
        return `📝 *SPECIFICA LE RETI DISPONIBILI*

Inserisci i nomi delle reti che puoi attivare, una per riga.

*Esempi:*
ENEL X
IONITY  
BE CHARGE
TESLA SUPERCHARGER
FASTNED

Scrivi le tue reti:`;
    }

    static get SELL_AVAILABILITY() {
        return `🕐 *DISPONIBILITÀ ORARIA*

Quando sei disponibile per attivare ricariche?

*Esempi:*
• DALLE 06:30 ALLE 22:00
• H24 SU PRENOTAZIONE
• SOLO WEEKEND
• FERIALI 9-18

Scrivi la tua disponibilità:`;
    }

    static get SELL_PAYMENT() {
        return `💳 *METODO DI PAGAMENTO*

Come vuoi ricevere i pagamenti?

*Esempi:*
• PAYPAL
• REVOLUT
• BONIFICO BANCARIO
• PAYPAL, REVOLUT
• SATISPAY

Scrivi i tuoi metodi accettati:`;
    }

    static get SELL_CONDITIONS() {
        return `📋 *CONDIZIONI PARTICOLARI (opzionale)*

Hai condizioni speciali o note aggiuntive?

*Esempi:*
• RICARICA MINIMA 30 KW
• SOLO SU PRENOTAZIONE
• SCONTO PER QUANTITÀ >50KW
• PAGAMENTO ANTICIPATO

Scrivi le tue condizioni (o /skip per saltare):`;
    }

    static formatAnnouncementPreview(data) {
        return `📋 *ANTEPRIMA ANNUNCIO:*

💰 Prezzo: *${data.price}€ AL KWH*
⚡ Corrente: *${data.currentTypeText}*
🌍 Zone: *${data.zones}*
🔌 Reti: *${data.networksText}*
🕐 Disponibilità: *${data.availability}*
💳 Pagamento: *${data.paymentMethods}*
${data.conditions ? `📋 Condizioni: *${data.conditions}*` : ''}

Tutto corretto?`;
    }

    static get ANNOUNCEMENT_PUBLISHED() {
        return `✅ *ANNUNCIO PUBBLICATO CON SUCCESSO!*

Il tuo annuncio è ora visibile nel topic del gruppo.
Riceverai una notifica per ogni richiesta di acquisto.

🔔 *Attivate notifiche* per non perdere opportunità di vendita!`;
    }

    static formatContactSummary(announcement, userStats) {
        const badge = userStats.sellerBadge ? 
            `⭐ ${userStats.sellerBadge === 'TOP' ? 'VENDITORE TOP' : 'VENDITORE AFFIDABILE'} (${userStats.positivePercentage}% positivi)` : '';

        return `📋 *RIASSUNTO ANNUNCIO ${announcement.announcementId}*

👤 Venditore: @${announcement.username || 'utente'} ${badge}
💰 Prezzo: *${announcement.price}€ AL KWH*
⚡ Corrente: *${announcement.currentTypeText}*
🌍 Zone: *${announcement.zones}*
💳 Pagamento: *${announcement.paymentMethods}*

${announcement.conditions ? `📋 *CLAUSOLE DEL VENDITORE:*\n${announcement.conditions}\n\n` : ''}❓ *Hai compreso le condizioni e intendi proseguire?*`;
    }

    static get BUY_DATETIME() {
        return `📅 *QUANDO VUOI EFFETTUARE LA RICARICA?*

Inserisci data e ora nel formato:
*GG/MM/AAAA HH:MM*

*Esempi:*
• 23/05/2025 14:30
• 24/05/2025 09:15

⏰ *Importante:* Assicurati di essere disponibile all'orario indicato!`;
    }

    static get BUY_BRAND() {
        return `🏢 *QUALE BRAND DI COLONNINA UTILIZZERAI?*

Indica il gestore della colonnina dove vuoi ricaricare.

*Esempi comuni:*
• ENEL X
• IONITY
• BE CHARGE  
• TESLA SUPERCHARGER
• FASTNED
• EVWAY

Scrivi il brand:`;
    }

    static get BUY_LOCATION() {
        return `📍 *POSIZIONE DELLA COLONNINA*

Invia la posizione GPS della colonnina oppure scrivi l'indirizzo completo.

*Metodi:*
🗺️ Usa il tasto "📎 Allega" → "Posizione" 
📝 Scrivi indirizzo: "Via Roma 123, Milano"

Questo aiuta il venditore a localizzare la colonnina.`;
    }

    static get BUY_SERIAL() {
        return `🔢 *NUMERO SERIALE COLONNINA*

Inserisci il numero seriale completo della colonnina o almeno le ultime 4-6 cifre.

*Dove trovarlo:*
• Etichetta sulla colonnina
• Display iniziale
• App del gestore

*Esempi:*
• ABC123456789
• ...6789 (ultime cifre)

Scrivi il seriale:`;
    }

    static get BUY_CONNECTOR() {
        return `🔌 *QUALE CONNETTORE VUOI ATTIVARE?*

Indica il tipo di connettore che utilizzerai.

*Tipi comuni:*
• CCS2 (Combo 2) - DC
• CHAdeMO - DC  
• Type2 (Mennekes) - AC
• Type1 (J1772) - AC

*Se ci sono più connettori dello stesso tipo*, specifica anche il numero:
• CCS2 1 (primo connettore CCS)
• CCS2 2 (secondo connettore CCS)
• Type2 1 (primo connettore Type2)
• Type2 2 (secondo connettore Type2)

Scrivi il tipo di connettore (e numero se necessario):`;
    }

    static formatPurchaseRequest(transactionData, announcement) {
        return `🔔 *NUOVA RICHIESTA DI ACQUISTO*

👤 Acquirente: @${transactionData.buyerUsername}
📋 Annuncio: ${announcement.announcementId}

📅 Data/ora: *${transactionData.scheduledDate}*
🏢 Brand: *${transactionData.brand}*
⚡ Tipo: *${transactionData.currentType}*
📍 Posizione: *${transactionData.location}*
🔢 Seriale: *${transactionData.serialNumber}*
🔌 Connettore: *${transactionData.connector}*

Accetti questa richiesta?`;
    }

    static get CHARGING_TIME() {
        return `⏰ *È IL MOMENTO DELLA RICARICA!*

Tutti i dettagli sono confermati.
Quando sei pronto ad attivare la ricarica, premi il pulsante qui sotto.

🔋 *Ricorda:*
• Verifica che la colonnina sia libera
• Controlla il numero seriale
• Attiva il connettore corretto`;
    }

    static get CHARGING_ACTIVATED() {
        return `⚡ *RICARICA ATTIVATA!*

Controlla il connettore e conferma se la ricarica è iniziata.

💡 *Se non sta caricando:*
• Verifica che il cavo sia inserito bene
• Controlla che l'auto sia pronta
• Riprova l'attivazione`;
    }

    static get CHARGING_CONFIRMED() {
        return `✅ *RICARICA CONFERMATA IN CORSO!*

⏱️ La ricarica è iniziata correttamente.

Quando hai terminato di caricare, premi il pulsante per continuare.`;
    }

    static get CHARGING_FAILED_RETRY() {
        return `❌ *RICARICA NON AVVIATA*

Nessun problema! Proviamo a risolvere.

🔧 *Possibili soluzioni:*
• Riprova l'attivazione
• Cambia connettore
• Trova colonnina alternativa`;
    }

    static get PHOTO_UPLOAD_REQUEST() {
        return `📸 *CONFERMA KWH RICEVUTI*

Per completare la transazione devi:

1️⃣ *Scatta una foto* del display della colonnina che mostra i KWH ricevuti
2️⃣ *Scrivi il numero esatto* di KWH nel messaggio successivo

📷 *Consigli per la foto:*
• Inquadra tutto il display
• Assicurati che i numeri siano leggibili
• Evita riflessi e ombre
• Foto nitida e ben illuminata

*Invia prima la foto, poi il numero.*`;
    }

    static get PHOTO_RECEIVED() {
        return `📷 *Foto ricevuta!*

Ora scrivi i KWH ricevuti (solo il numero):

*Esempi:*
• 35.2
• 28.7
• 42

💡 Inserisci solo il numero, senza unità di misura.`;
    }

    static formatKwhValidation(validationResult) {
        if (validationResult.isValid) {
            return `✅ *DATI CONFERMATI DAL BOT*

📊 KWH validati: *${validationResult.declaredKwh} KWH*

Procedi con il pagamento come concordato con il venditore.`;
        } else {
            return `❌ *DISCREPANZA RILEVATA*

📷 I dati nella foto non corrispondono ai KWH dichiarati
💡 KWH dichiarati: *${validationResult.declaredKwh}*
🔍 KWH rilevati dal bot: *${validationResult.detectedKwh || 'Non rilevato'}*

Motivazione: ${validationResult.reason}

Ricontrolla e riprova.`;
        }
    }

    static formatPaymentRequest(amount, paymentMethods) {
        return `💳 *PROCEDI CON IL PAGAMENTO*

💰 Importo da pagare: *€${amount.toFixed(2)}*
💳 Metodi accettati: *${paymentMethods}*

Il venditore ti contatterà in privato per i dettagli del pagamento.

Hai completato il pagamento?`;
    }

    static formatPaymentConfirmationRequest(amount, buyerUsername) {
        return `💳 *RICHIESTA CONFERMA PAGAMENTO*

@${buyerUsername} dichiara di aver pagato *€${amount.toFixed(2)}*

Hai ricevuto il pagamento?`;
    }

    static get TRANSACTION_COMPLETED() {
        return `🎉 *TRANSAZIONE COMPLETATA CON SUCCESSO!*

La transazione è stata finalizzata.
Ora è il momento dei feedback reciproci!

⭐ Il feedback aiuta la community a crescere in sicurezza.`;
    }

    static get FEEDBACK_REQUEST() {
        return `🌟 *LASCIA UN FEEDBACK*

Come è andata la transazione?

⭐ Il tuo feedback aiuta altri utenti a scegliere venditori affidabili.`;
    }

    static get NEGATIVE_FEEDBACK_REASON() {
        return `😔 *Ci dispiace per l'esperienza negativa.*

Puoi motivare brevemente il problema?

Questo aiuterà altri utenti e permetterà al venditore di migliorare.

💡 *Scrivi una breve descrizione* del problema riscontrato.`;
    }

    static formatUserStats(userStats) {
        const badge = userStats.sellerBadge ? 
            `🏆 Status: *${userStats.sellerBadge === 'TOP' ? 'VENDITORE TOP' : 'VENDITORE AFFIDABILE'}*` : '';

        return `📊 *LE TUE STATISTICHE*

👤 @${userStats.username}
🌟 Rating: *${userStats.averageRating}/5* (${userStats.positivePercentage}% positivi)
${badge}

📈 *Riepilogo:*
✅ Transazioni positive: *${userStats.positiveCount || 0}*
⚠️ Transazioni neutre: *${userStats.totalFeedback - userStats.positiveCount - (userStats.negativeCount || 0)}*
❌ Transazioni negative: *${userStats.negativeCount || 0}*
💰 Volume totale: *${userStats.totalKwhSold || 0} KWH venduti*

${userStats.sellerBadge === 'TOP' ? '🌟 *Complimenti! Sei un VENDITORE TOP!* (>95% feedback positivi)' : 
  userStats.sellerBadge === 'AFFIDABILE' ? '✅ *Sei un VENDITORE AFFIDABILE!* (>90% feedback positivi)' : 
  '💪 *Continua così per diventare un venditore affidabile!*'}`;
    }

    static formatAdminAlert(transactionId, issue, reportedBy) {
        return `🚨 *RICHIESTA ARBITRAGGIO*

Caso ID: *${transactionId}*
Problema: *${issue}*
Segnalato da: @${reportedBy}

⏰ Richiede intervento admin immediato.`;
    }

    static get ADMIN_HELP_GUIDE() {
        return `👨‍⚖️ *GUIDA ADMIN BOT KWH*

🔧 *Comandi disponibili:*
• /admin - Dashboard amministratore
• /stats - Statistiche generali
• /disputes - Dispute aperte
• /users - Gestione utenti

⚖️ *Arbitraggio:*
Le decisioni admin sono definitive e vengono notificate a entrambe le parti.

📊 *Monitoraggio:*
Controlla regolarmente transazioni pending e problemi segnalati.`;
    }

    static ERROR_MESSAGES = {
        INVALID_PRICE: '❌ Prezzo non valido. Inserisci un numero (es: 0.35)',
        INVALID_DATE: '❌ Data non valida. Usa il formato GG/MM/AAAA HH:MM',
        IMAGE_TOO_LARGE: '❌ Immagine troppo grande. Massimo 5MB.',
        IMAGE_PROCESSING_ERROR: '❌ Errore nell\'elaborazione dell\'immagine. Riprova.',
        INVALID_KWH: '❌ Valore KWH non valido. Inserisci un numero (es: 35.2)',
        TRANSACTION_NOT_FOUND: '❌ Transazione non trovata.',
        UNAUTHORIZED: '❌ Non sei autorizzato per questa azione.',
        GENERIC_ERROR: '❌ Si è verificato un errore. Riprova o contatta l\'admin.'
    };
}

module.exports = Messages;
