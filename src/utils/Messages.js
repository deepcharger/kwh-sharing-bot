class Messages {
    // Messaggi di benvenuto
    static get WELCOME() {
        return `🔋 **Benvenuto nel Marketplace Energia!**

Qui puoi comprare e vendere energia per auto elettriche in modo sicuro e conveniente.

🌟 **Funzionalità principali:**
- Pubblica offerte di ricarica
- Cerca le migliori tariffe
- Sistema di pagamento sicuro
- Valutazioni e recensioni

Usa i pulsanti per iniziare!`;
    }

    static get SELL_WELCOME() {
        return `🔋 **VENDI LA TUA ENERGIA**

Guadagna condividendo l'accesso alle tue ricariche!

💰 **Vantaggi:**
- Imposta prezzi fissi o graduati
- Controllo totale sulle condizioni
- Pagamenti diretti
- Sistema di recensioni

Pronto a creare il tuo primo annuncio?`;
    }

    static get HELP_TEXT() {
        return `❓ **GUIDA COMPLETA**

📋 **Come funziona:**
- Venditori pubblicano offerte di ricarica
- Acquirenti cercano e prenotano
- Il sistema gestisce la transazione
- Feedback reciproco finale

💡 **Suggerimenti:**
- Usa prezzi competitivi
- Rispondi velocemente
- Mantieni alta la reputazione

Hai bisogno di aiuto specifico?`;
    }

    // Messaggi per prezzi graduati
    static formatGraduatedPricingExplanation() {
        return `📊 **COME FUNZIONANO I PREZZI GRADUATI**

I prezzi graduati permettono di offrire sconti per quantità maggiori.

**Esempio:**
- 0-30 KWH: TUTTO a 0,45€/KWH
- 31-60 KWH: TUTTO a 0,40€/KWH  
- Oltre 60 KWH: TUTTO a 0,35€/KWH

**Calcoli:**
- Chi ricarica 25 KWH → 25 × 0,45€ = €11,25
- Chi ricarica 45 KWH → 45 × 0,40€ = €18,00
- Chi ricarica 80 KWH → 80 × 0,35€ = €28,00

Il prezzo si applica a TUTTA la quantità, non solo alla fascia.`;
    }

    static formatMinimumGuaranteeExplanation() {
        return `🎯 **MINIMO GARANTITO**

Il minimo garantito assicura un guadagno minimo anche per ricariche piccole.

**Esempio con minimo 15 KWH:**
- Chi ricarica 8 KWH → paga per 15 KWH
- Chi ricarica 20 KWH → paga per 20 KWH

È utile per:
- Coprire costi fissi di attivazione
- Garantire un compenso minimo
- Scoraggiare ricariche troppo piccole`;
    }

    // Template per annunci con campi copiabili
    static formatAnnouncementDisplay(announcement, userStats) {
        let message = `🔋 **OFFERTA ENERGIA**\n\n`;
        
        // Info venditore
        const username = announcement.userId.username || announcement.userId.firstName || 'Utente';
        message += `👤 **Venditore:** @${username}\n`;
        
        // Badge venditore se disponibile
        if (userStats && userStats.totalFeedback >= 5) {
            const rating = userStats.avgRating;
            if (userStats.positivePercentage >= 95) {
                message += `🌟 **VENDITORE TOP** (${userStats.positivePercentage}% positivi)\n`;
            } else if (userStats.positivePercentage >= 90) {
                message += `✅ **VENDITORE AFFIDABILE** (${userStats.positivePercentage}% positivi)\n`;
            }
        }
        
        // Campi principali con posizione copiabile
        message += `\n📍 **Posizione:** \`${announcement.location}\`\n`;
        message += `📝 **Descrizione:** ${announcement.description}\n`;
        message += `⏰ **Disponibilità:** ${announcement.availability}\n`;
        
        // Pricing
        message += `\n${this.formatPricingDisplay(announcement)}\n`;
        
        if (announcement.contactInfo) {
            message += `📞 **Contatti:** ${announcement.contactInfo}\n`;
        }
        
        message += `\n📅 Pubblicato: ${announcement.createdAt.toLocaleDateString('it-IT')}`;
        message += `\n🆔 ID: \`${announcement.announcementId}\``;
        
        return message;
    }

    static formatPricingDisplay(announcement) {
        if (!announcement.pricingType) {
            return '💰 **Prezzo:** Non specificato';
        }

        if (announcement.pricingType === 'fixed') {
            let pricing = `💰 **Prezzo Fisso:** ${announcement.basePrice}€/KWH`;
            
            if (announcement.minimumKwh) {
                pricing += `\n🎯 **Minimo garantito:** ${announcement.minimumKwh} KWH`;
                pricing += `\n💡 *Minimo €${(announcement.minimumKwh * announcement.basePrice).toFixed(2)}*`;
            }
            
            return pricing;
        }

        if (announcement.pricingType === 'graduated') {
            let pricing = `📊 **Prezzi Graduati:**\n`;
            
            for (let i = 0; i < announcement.pricingTiers.length; i++) {
                const tier = announcement.pricingTiers[i];
                const prevLimit = i > 0 ? announcement.pricingTiers[i-1].limit : 0;
                
                if (tier.limit === null) {
                    pricing += `• **Oltre ${prevLimit} KWH:** TUTTO a ${tier.price}€/KWH\n`;
                } else {
                    const range = i === 0 ? `0-${tier.limit}` : `${prevLimit + 1}-${tier.limit}`;
                    pricing += `• **${range} KWH:** TUTTO a ${tier.price}€/KWH\n`;
                }
            }
            
            if (announcement.minimumKwh) {
                pricing += `🎯 **Minimo garantito:** ${announcement.minimumKwh} KWH`;
            }
            
            return pricing.trim();
        }

        return '💰 **Prezzo:** Errore configurazione';
    }

    // VERSIONE MIGLIORATA: Calcolo esempi di prezzo con indicazione chiara delle fasce
    static formatPriceExamples(announcement) {
        let examples = `💡 **Esempi di costo:**\n`;
        
        // Per prezzi fissi, mantieni il comportamento attuale semplice
        if (announcement.pricingType === 'fixed') {
            const exampleKwh = [10, 30, 50];
            for (const kwh of exampleKwh) {
                const calculation = this.calculateExamplePrice(announcement, kwh);
                examples += `• ${kwh} KWH → €${calculation.totalAmount.toFixed(2)}`;
                
                if (calculation.appliedMinimum) {
                    examples += ` *(min ${calculation.kwhUsed} KWH)*`;
                }
                examples += `\n`;
            }
            return examples.trim();
        }
        
        // Per prezzi graduati, mostra chiaramente il cambio fascia
        if (announcement.pricingType === 'graduated' && announcement.pricingTiers) {
            const examples_list = [];
            
            // Per ogni fascia, mostra un esempio
            for (let i = 0; i < announcement.pricingTiers.length; i++) {
                const tier = announcement.pricingTiers[i];
                const prevTier = i > 0 ? announcement.pricingTiers[i-1] : null;
                
                if (tier.limit !== null) {
                    // Esempio al limite della fascia corrente
                    const calc = this.calculateExamplePrice(announcement, tier.limit);
                    examples_list.push({
                        kwh: tier.limit,
                        total: calc.totalAmount.toFixed(2),
                        price: calc.pricePerKwh,
                        isLimit: true
                    });
                    
                    // Se c'è una fascia successiva, mostra esempio appena oltre il limite
                    if (i < announcement.pricingTiers.length - 1) {
                        const nextCalc = this.calculateExamplePrice(announcement, tier.limit + 1);
                        examples_list.push({
                            kwh: tier.limit + 1,
                            total: nextCalc.totalAmount.toFixed(2),
                            price: nextCalc.pricePerKwh,
                            isAfterLimit: true
                        });
                    }
                } else {
                    // Fascia finale "oltre X"
                    const exampleKwh = prevTier ? prevTier.limit + 20 : 50;
                    const calc = this.calculateExamplePrice(announcement, exampleKwh);
                    examples_list.push({
                        kwh: exampleKwh,
                        total: calc.totalAmount.toFixed(2),
                        price: calc.pricePerKwh
                    });
                }
            }
            
            // Aggiungi anche un esempio iniziale se il minimo è significativo
            if (announcement.minimumKwh && announcement.minimumKwh > 5) {
                const minCalc = this.calculateExamplePrice(announcement, announcement.minimumKwh - 5);
                examples = `• ${announcement.minimumKwh - 5} KWH → €${minCalc.totalAmount.toFixed(2)} *(min ${minCalc.kwhUsed} KWH)*\n`;
            }
            
            // Costruisci gli esempi con indicazioni chiare
            let prevPrice = null;
            for (const ex of examples_list) {
                examples += `• ${ex.kwh} KWH → €${ex.total}`;
                
                // Aggiungi indicazione prezzo/kwh se cambia
                if (prevPrice !== null && ex.price !== prevPrice) {
                    examples += ` ⬇️ (ora ${ex.price}€/KWH)`;
                } else {
                    examples += ` (${ex.price}€/KWH)`;
                }
                
                examples += `\n`;
                prevPrice = ex.price;
            }
            
            // Aggiungi nota esplicativa se ci sono salti di prezzo evidenti
            if (announcement.pricingTiers.length > 1) {
                const firstTier = announcement.pricingTiers[0];
                const secondTier = announcement.pricingTiers[1];
                
                if (firstTier.limit && secondTier.price < firstTier.price) {
                    const saving = (firstTier.limit * firstTier.price) - ((firstTier.limit + 1) * secondTier.price);
                    if (saving > 0) {
                        examples += `\n💰 **Nota:** Superando i ${firstTier.limit} KWH risparmi subito €${saving.toFixed(2)}!`;
                    }
                }
            }
        }
        
        return examples.trim();
    }

    static calculateExamplePrice(announcement, kwhAmount) {
        const finalKwh = Math.max(kwhAmount, announcement.minimumKwh || 0);

        if (announcement.pricingType === 'fixed') {
            return {
                totalAmount: finalKwh * announcement.basePrice,
                kwhUsed: finalKwh,
                pricePerKwh: announcement.basePrice,
                appliedMinimum: finalKwh > kwhAmount
            };
        }

        if (announcement.pricingType === 'graduated') {
            let applicableTier = announcement.pricingTiers[announcement.pricingTiers.length - 1];
            
            for (let tier of announcement.pricingTiers) {
                if (tier.limit === null || finalKwh <= tier.limit) {
                    applicableTier = tier;
                    break;
                }
            }

            return {
                totalAmount: finalKwh * applicableTier.price,
                kwhUsed: finalKwh,
                pricePerKwh: applicableTier.price,
                appliedMinimum: finalKwh > kwhAmount
            };
        }

        throw new Error('Tipo di prezzo non supportato');
    }

    // Messaggi per transazioni con ID copiabili
    static formatTransactionRequest(transaction, announcement) {
        let message = `💰 **NUOVA RICHIESTA DI ACQUISTO**\n\n`;
        
        const buyerName = transaction.buyerId.username || transaction.buyerId.firstName || 'Acquirente';
        message += `👤 **Da:** @${buyerName}\n`;
        message += `⚡ **Quantità:** ${transaction.kwhAmount} KWH\n`;
        
        if (transaction.kwhUsedForCalculation !== transaction.kwhAmount) {
            message += `🎯 **Applicato minimo:** ${transaction.kwhUsedForCalculation} KWH\n`;
        }
        
        message += `💰 **Prezzo:** ${transaction.pricePerKwh}€/KWH\n`;
        message += `💵 **Totale:** €${transaction.totalAmount.toFixed(2)}\n\n`;
        
        if (announcement && announcement.pricingType === 'graduated' && transaction.appliedTier) {
            if (transaction.appliedTier.limit) {
                message += `📊 **Fascia applicata:** fino a ${transaction.appliedTier.limit} KWH\n`;
            } else {
                message += `📊 **Fascia applicata:** illimitata\n`;
            }
        }
        
        message += `📍 **Posizione:** \`${announcement?.location || 'Non specificata'}\`\n`;
        message += `📅 **Richiesta il:** ${transaction.createdAt.toLocaleDateString('it-IT')}\n`;
        message += `🆔 **ID Transazione:** \`${transaction.transactionId}\``;
        
        return message;
    }

    static formatTransactionSummary(transaction, announcement, userRole) {
        let message = `📋 **RIEPILOGO TRANSAZIONE**\n\n`;
        
        message += `🆔 **ID:** \`${transaction._id.toString().slice(-8)}\`\n`;
        message += `📅 **Data:** ${transaction.createdAt.toLocaleDateString('it-IT')}\n`;
        message += `📊 **Stato:** ${this.getStatusText(transaction.status)}\n\n`;
        
        const buyerName = transaction.buyerId.username || transaction.buyerId.firstName || 'Acquirente';
        const sellerName = transaction.sellerId.username || transaction.sellerId.firstName || 'Venditore';
        
        message += `👤 **Acquirente:** @${buyerName}\n`;
        message += `👤 **Venditore:** @${sellerName}\n\n`;
        
        message += `⚡ **Energia:**\n`;
        message += `• Richiesta: ${transaction.kwhAmount} KWH\n`;
        
        if (transaction.appliedMinimum) {
            message += `• Per calcolo: ${transaction.kwhUsedForCalculation} KWH *(minimo applicato)*\n`;
        }
        
        message += `\n💰 **Costi:**\n`;
        message += `• Prezzo: ${transaction.pricePerKwh}€/KWH\n`;
        
        if (announcement?.pricingType === 'graduated' && transaction.appliedTier) {
            if (transaction.appliedTier.limit) {
                message += `• Fascia: fino a ${transaction.appliedTier.limit} KWH\n`;
            } else {
                message += `• Fascia: illimitata\n`;
            }
        }
        
        message += `• **Totale: €${transaction.totalAmount.toFixed(2)}**\n`;
        
        const effectivePrice = transaction.totalAmount / transaction.kwhAmount;
        if (Math.abs(effectivePrice - transaction.pricePerKwh) > 0.01) {
            message += `• Prezzo effettivo: ${effectivePrice.toFixed(3)}€/KWH\n`;
        }
        
        if (transaction.status === 'completed' && transaction.completedAt) {
            message += `\n✅ **Completata il:** ${transaction.completedAt.toLocaleDateString('it-IT')}`;
        }
        
        return message;
    }

    // Messaggi per notifiche
    static formatContactSummary(announcement, userStats) {
        let message = `🛒 **RICHIESTA DI ACQUISTO**\n\n`;
        
        message += `📍 **Posizione:** \`${announcement.location}\`\n`;
        message += `${this.formatPricingDisplay(announcement)}\n\n`;
        
        if (userStats && userStats.totalFeedback >= 5) {
            message += `⭐ **Valutazione venditore:** ${userStats.avgRating.toFixed(1)}/5 (${userStats.totalFeedback} recensioni)\n\n`;
        }
        
        message += `Confermi di voler procedere con l'acquisto da questo venditore?`;
        
        return message;
    }

    static formatPurchaseRequest(transaction, announcement) {
        let message = `📥 **NUOVA RICHIESTA DI ACQUISTO**\n\n`;
        
        message += `👤 **Acquirente:** @${transaction.buyerUsername || 'utente'}\n`;
        message += `📅 **Data/ora richiesta:** ${transaction.scheduledDate}\n`;
        message += `🏢 **Brand colonnina:** ${transaction.brand}\n`;
        message += `⚡ **Tipo corrente:** ${transaction.currentType}\n`;
        message += `📍 **Posizione colonnina:** \`${transaction.location}\`\n`;
        message += `🔢 **Seriale:** \`${transaction.serialNumber}\`\n`;
        message += `🔌 **Connettore:** ${transaction.connector}\n\n`;
        
        if (announcement) {
            message += `💰 **Il tuo annuncio:**\n`;
            message += `${this.formatPricingDisplay(announcement)}\n\n`;
        }
        
        message += `Accetti questa richiesta?`;
        
        return message;
    }

    static formatUserStats(userStats) {
        let message = `⭐ **I TUOI FEEDBACK**\n\n`;
        
        if (userStats.totalFeedback > 0) {
            message += `📊 **Statistiche:**\n`;
            message += `• Valutazione media: ${userStats.avgRating.toFixed(1)}/5\n`;
            message += `• Totale recensioni: ${userStats.totalFeedback}\n`;
            message += `• Feedback positivi: ${userStats.positivePercentage}%\n\n`;
            
            if (userStats.sellerBadge) {
                message += `🏆 **Badge:** ${userStats.sellerBadge === 'TOP' ? '🌟 VENDITORE TOP' : '✅ VENDITORE AFFIDABILE'}\n`;
            }
        } else {
            message += 'Non hai ancora ricevuto feedback.\n\nCompleta le tue prime transazioni per ricevere valutazioni!';
        }
        
        return message;
    }

    // Messaggi di stato
    static getStatusText(status) {
        const statusMap = {
            'pending': '⏳ In attesa di conferma',
            'pending_seller_confirmation': '⏳ Attesa conferma venditore',
            'confirmed': '✅ Confermata dal venditore',
            'charging_started': '⚡ Ricarica avviata',
            'charging_in_progress': '🔋 In ricarica',
            'charging_completed': '🏁 Ricarica completata',
            'photo_uploaded': '📷 Foto caricata',
            'kwh_declared': '📊 KWH dichiarati',
            'payment_requested': '💳 Pagamento richiesto',
            'payment_declared': '💰 Pagamento dichiarato',
            'completed': '🎉 Completata con successo',
            'cancelled': '❌ Annullata',
            'disputed': '⚠️ In disputa',
            'buyer_arrived': '📍 Acquirente arrivato'
        };
        return statusMap[status] || status;
    }

    static getStatusEmoji(status) {
        const emojiMap = {
            'pending': '⏳',
            'pending_seller_confirmation': '⏳',
            'confirmed': '✅',
            'charging_started': '⚡',
            'charging_in_progress': '🔋',
            'charging_completed': '🏁',
            'photo_uploaded': '📷',
            'kwh_declared': '📊',
            'payment_requested': '💳',
            'payment_declared': '💰',
            'completed': '🎉',
            'cancelled': '❌',
            'disputed': '⚠️',
            'buyer_arrived': '📍'
        };
        return emojiMap[status] || '❓';
    }

    // Messaggi di errore
    static get ERROR_MESSAGES() {
        return {
            INVALID_AMOUNT: '❌ Quantità non valida. Inserisci un numero tra 1 e 1000 KWH.',
            INVALID_PRICE: '❌ Prezzo non valido. Inserisci un numero tra 0.01 e 10.00 €/KWH.',
            INVALID_TIER_FORMAT: '❌ Formato non valido. Usa: `limite_kwh prezzo`\n\nEsempio: `30 0.45`',
            INVALID_TIER_LIMIT: '❌ Il limite deve essere maggiore del precedente.',
            INVALID_MINIMUM: '❌ KWH minimi non validi. Inserisci un numero tra 1 e 1000.',
            ANNOUNCEMENT_NOT_FOUND: '❌ Annuncio non trovato o non più disponibile.',
            TRANSACTION_NOT_FOUND: '❌ Transazione non trovata.',
            UNAUTHORIZED: '❌ Non sei autorizzato per questa operazione.',
            CANNOT_BUY_OWN: '❌ Non puoi acquistare dalla tua stessa offerta!',
            GENERIC_ERROR: '❌ Si è verificato un errore. Riprova tra qualche minuto.',
            INVALID_DATE: '❌ Data non valida. Usa il formato GG/MM/AAAA HH:MM'
        };
    }

    // Messaggi informativi
    static get INFO_MESSAGES() {
        return {
            PRICING_EXPLANATION: this.formatGraduatedPricingExplanation(),
            MINIMUM_EXPLANATION: this.formatMinimumGuaranteeExplanation(),
            PROCESS_HELP: `📋 **COME FUNZIONA**

**Per Venditori:**
1. Crea annuncio con i tuoi prezzi
2. Ricevi richieste di acquisto
3. Conferma o rifiuta le richieste
4. Fornisci accesso alla ricarica
5. Ricevi il pagamento
6. Lascia feedback

**Per Acquirenti:**
1. Cerca offerte nella tua zona
2. Invia richiesta di acquisto
3. Attendi conferma del venditore
4. Effettua la ricarica
5. Paga come concordato
6. Lascia feedback`,

            SAFETY_TIPS: `🛡️ **CONSIGLI DI SICUREZZA**

- Verifica sempre l'identità del venditore
- Controlla le recensioni prima di acquistare
- Paga solo dopo aver ricevuto l'energia
- Usa metodi di pagamento tracciabili
- Segnala comportamenti sospetti
- Non condividere dati personali sensibili`
        };
    }

    // Altri messaggi con campi copiabili
    static get BUY_PROCESS_START() {
        return `🛒 **PROCESSO DI ACQUISTO**

Segui questi passaggi per acquistare energia:

1️⃣ **Quantità** - Specifica quanti KWH vuoi
2️⃣ **Conferma** - Verifica prezzo e condizioni  
3️⃣ **Contatto** - Il venditore ti contatterà
4️⃣ **Ricarica** - Effettua la ricarica concordata
5️⃣ **Pagamento** - Paga come concordato
6️⃣ **Valutazione** - Lascia un feedback

Iniziamo! Quanti KWH vuoi acquistare?`;
    }

    static formatBuyConfirmation(announcement, kwhAmount) {
        const calculation = this.calculateExamplePrice(announcement, kwhAmount);
        
        let message = `✅ **CONFERMA ACQUISTO**\n\n`;
        
        message += `⚡ **Quantità richiesta:** ${kwhAmount} KWH\n`;
        
        if (calculation.appliedMinimum) {
            message += `🎯 **Minimo applicato:** ${calculation.kwhUsed} KWH\n`;
        }
        
        message += `💰 **Prezzo:** ${calculation.pricePerKwh}€/KWH\n`;
        message += `💵 **Totale da pagare:** €${calculation.totalAmount.toFixed(2)}\n\n`;
        
        if (announcement.pricingType === 'graduated') {
            message += `📊 **Tipo prezzo:** Graduato\n`;
        } else {
            message += `📊 **Tipo prezzo:** Fisso\n`;
        }
        
        message += `📍 **Posizione:** \`${announcement.location}\`\n`;
        message += `📞 **Contatti:** ${announcement.contactInfo}\n\n`;
        
        message += `Confermi l'acquisto?`;
        
        return message;
    }

    static formatNotification(type, data) {
        switch (type) {
            case 'new_request':
                return `🔔 **NUOVA RICHIESTA**\n\nHai ricevuto una richiesta di acquisto per ${data.kwhAmount} KWH!\n\n💰 Guadagno: €${data.totalAmount.toFixed(2)}\n🆔 ID: \`${data.transactionId}\``;
                
            case 'request_confirmed':
                return `✅ **RICHIESTA CONFERMATA**\n\nIl venditore ha accettato la tua richiesta!\n\n⚡ KWH: ${data.kwhAmount}\n💰 Totale: €${data.totalAmount.toFixed(2)}\n🆔 ID: \`${data.transactionId}\``;
                
            case 'transaction_completed':
                return `🎉 **TRANSAZIONE COMPLETATA**\n\nComplimenti! La transazione è stata completata con successo.\n\n💰 Importo: €${data.totalAmount.toFixed(2)}\n🆔 ID: \`${data.transactionId}\``;
                
            default:
                return `🔔 **NOTIFICA**\n\n${data.message}`;
        }
    }

    // Messaggi aggiuntivi
    static get CHARGING_CONFIRMED() {
        return '⚡ **RICARICA IN CORSO**\n\nLa ricarica è stata attivata correttamente!';
    }

    static get CHARGING_TIME() {
        return '⏰ **È ORA DI ATTIVARE LA RICARICA!**\n\nL\'acquirente ti sta aspettando. Attiva la ricarica ora.';
    }

    static get TRANSACTION_COMPLETED() {
        return '🎉 **TRANSAZIONE COMPLETATA!**\n\nLa transazione è stata completata con successo.';
    }

    static get FEEDBACK_REQUEST() {
        return '⭐ **LASCIA UN FEEDBACK**\n\nCom\'è andata la transazione? La tua valutazione aiuta la community.';
    }

    static get NEGATIVE_FEEDBACK_REASON() {
        return '📝 **FEEDBACK NEGATIVO**\n\nCi dispiace che l\'esperienza non sia stata positiva. Puoi dirci cosa è andato storto?';
    }

    static get CHARGING_FAILED_RETRY() {
        return '❌ **RICARICA NON RIUSCITA**\n\nL\'acquirente segnala che la ricarica non è partita. Riprova o verifica il problema.';
    }

    static get NOT_GROUP_MEMBER() {
        return '❌ **ACCESSO NEGATO**\n\nDevi essere membro del gruppo per usare questo bot.';
    }

    static get BUY_DATETIME() {
        return '📅 **QUANDO TI SERVE LA RICARICA?**\n\nInserisci data e ora nel formato:\n`GG/MM/AAAA HH:MM`\n\nEsempio: `25/12/2024 15:30`';
    }

    static get BUY_BRAND() {
        return '🏢 **MARCA COLONNINA?**\n\nEsempio: Enel X, Be Charge, Ionity...';
    }

    static get BUY_LOCATION() {
        return '📍 **POSIZIONE ESATTA COLONNINA?**\n\nInserisci indirizzo o coordinate GPS.';
    }

    static get BUY_SERIAL() {
        return '🔢 **NUMERO SERIALE COLONNINA?**';
    }

    static get BUY_CONNECTOR() {
        return '🔌 **TIPO CONNETTORE?**\n\nEsempio: Type 2, CCS, CHAdeMO...';
    }

    static formatAdminAlert(transactionId, issue, username) {
        return `🚨 **ADMIN ALERT**\n\n**Problema:** ${issue}\n**Utente:** @${username}\n**Transazione:** \`${transactionId}\`\n\nIntervento richiesto.`;
    }
}

module.exports = Messages;
