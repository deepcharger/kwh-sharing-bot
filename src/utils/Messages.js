class Messages {
    // Messaggi di benvenuto
    static get WELCOME() {
        return `🔋 **Benvenuto nel Marketplace Energia!**

Qui puoi comprare e vendere energia per auto elettriche in modo sicuro e conveniente.

🌟 **Funzionalità principali:**
• Pubblica offerte di ricarica
• Cerca le migliori tariffe
• Sistema di pagamento sicuro
• Valutazioni e recensioni

Usa i pulsanti per iniziare!`;
    }

    static get SELL_WELCOME() {
        return `🔋 **VENDI LA TUA ENERGIA**

Guadagna condividendo l'accesso alle tue ricariche!

💰 **Vantaggi:**
• Imposta prezzi fissi o graduati
• Controllo totale sulle condizioni
• Pagamenti diretti
• Sistema di recensioni

Pronto a creare il tuo primo annuncio?`;
    }

    // Messaggi per prezzi graduati
    static formatGraduatedPricingExplanation() {
        return `📊 **COME FUNZIONANO I PREZZI GRADUATI**

I prezzi graduati permettono di offrire sconti per quantità maggiori.

**Esempio:**
• 0-30 KWH: TUTTO a 0,45€/KWH
• 31-60 KWH: TUTTO a 0,40€/KWH  
• Oltre 60 KWH: TUTTO a 0,35€/KWH

**Calcoli:**
• Chi ricarica 25 KWH → 25 × 0,45€ = €11,25
• Chi ricarica 45 KWH → 45 × 0,40€ = €18,00
• Chi ricarica 80 KWH → 80 × 0,35€ = €28,00

Il prezzo si applica a TUTTA la quantità, non solo alla fascia.`;
    }

    static formatMinimumGuaranteeExplanation() {
        return `🎯 **MINIMO GARANTITO**

Il minimo garantito assicura un guadagno minimo anche per ricariche piccole.

**Esempio con minimo 15 KWH:**
• Chi ricarica 8 KWH → paga per 15 KWH
• Chi ricarica 20 KWH → paga per 20 KWH

È utile per:
• Coprire costi fissi di attivazione
• Garantire un compenso minimo
• Scoraggiare ricariche troppo piccole`;
    }

    // Template per annunci
    static formatAnnouncementDisplay(announcement, userStats) {
        let message = `🔋 **OFFERTA ENERGIA**\n\n`;
        
        // Info venditore
        const username = announcement.userId.username || announcement.userId.firstName || 'Utente';
        message += `👤 **Venditore:** @${username}\n`;
        
        // Badge venditore se disponibile
        if (userStats && userStats.rating.totalRatings >= 5) {
            const rating = userStats.rating.avgRating;
            if (rating >= 4.5) {
                message += `⭐ **VENDITORE TOP** (${rating.toFixed(1)}/5)\n`;
            } else if (rating >= 4.0) {
                message += `✅ **VENDITORE AFFIDABILE** (${rating.toFixed(1)}/5)\n`;
            }
        }
        
        message += `\n📍 **Posizione:** ${announcement.location}\n`;
        message += `📝 **Descrizione:** ${announcement.description}\n`;
        message += `⏰ **Disponibilità:** ${announcement.availability}\n`;
        
        // Pricing - NUOVO FORMATO
        message += `\n${this.formatPricingDisplay(announcement)}\n`;
        
        if (announcement.contactInfo) {
            message += `📞 **Contatti:** ${announcement.contactInfo}\n`;
        }
        
        message += `\n📅 Pubblicato: ${announcement.createdAt.toLocaleDateString('it-IT')}`;
        
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

    // Calcolo esempi di prezzo
    static formatPriceExamples(announcement, exampleKwh = [10, 30, 50, 100]) {
        let examples = `💡 **Esempi di costo:**\n`;
        
        for (const kwh of exampleKwh) {
            try {
                const calculation = this.calculateExamplePrice(announcement, kwh);
                examples += `• ${kwh} KWH → €${calculation.totalAmount.toFixed(2)}`;
                
                if (calculation.appliedMinimum) {
                    examples += ` *(minimo ${calculation.kwhUsed} KWH)*`;
                }
                
                examples += `\n`;
            } catch (error) {
                // Salta esempi che non si possono calcolare
                continue;
            }
        }
        
        return examples.trim();
    }

    static calculateExamplePrice(announcement, kwhAmount) {
        // Applica minimo se presente
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
            // Trova la fascia appropriata
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

    // Messaggi per transazioni
    static formatTransactionRequest(transaction, announcement) {
        let message = `💰 **NUOVA RICHIESTA DI ACQUISTO**\n\n`;
        
        const buyerName = transaction.buyerId.username || transaction.buyerId.firstName || 'Acquirente';
        message += `👤 **Da:** @${buyerName}\n`;
        message += `⚡ **Quantità:** ${transaction.kwhAmount} KWH\n`;
        
        // Calcolo prezzo con nuovo sistema
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
        
        message += `📍 **Posizione:** ${announcement?.location || 'Non specificata'}\n`;
        message += `📅 **Richiesta il:** ${transaction.createdAt.toLocaleDateString('it-IT')}`;
        
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
        
        // Calcola prezzo effettivo per KWH richiesto
        const effectivePrice = transaction.totalAmount / transaction.kwhAmount;
        if (Math.abs(effectivePrice - transaction.pricePerKwh) > 0.01) {
            message += `• Prezzo effettivo: ${effectivePrice.toFixed(3)}€/KWH\n`;
        }
        
        if (transaction.status === 'completed' && transaction.completedAt) {
            message += `\n✅ **Completata il:** ${transaction.completedAt.toLocaleDateString('it-IT')}`;
        }
        
        return message;
    }

    // Messaggi per il processo di acquisto
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
        
        message += `📍 **Posizione:** ${announcement.location}\n`;
        message += `📞 **Contatti:** ${announcement.contactInfo}\n\n`;
        
        message += `Confermi l'acquisto?`;
        
        return message;
    }

    // Messaggi di stato
    static getStatusText(status) {
        const statusMap = {
            'pending': '⏳ In attesa di conferma',
            'confirmed': '✅ Confermata dal venditore',
            'completed': '🎉 Completata con successo',
            'cancelled': '❌ Annullata'
        };
        return statusMap[status] || status;
    }

    static getStatusEmoji(status) {
        const emojiMap = {
            'pending': '⏳',
            'confirmed': '✅',
            'completed': '🎉',
            'cancelled': '❌'
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
            GENERIC_ERROR: '❌ Si è verificato un errore. Riprova tra qualche minuto.'
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

• Verifica sempre l'identità del venditore
• Controlla le recensioni prima di acquistare
• Paga solo dopo aver ricevuto l'energia
• Usa metodi di pagamento tracciabili
• Segnala comportamenti sospetti
• Non condividere dati personali sensibili`
        };
    }

    // Messaggi per feedback e recensioni
    static formatFeedbackRequest(transaction, userRole) {
        const otherUserRole = userRole === 'buyer' ? 'venditore' : 'acquirente';
        
        return `⭐ **LASCIA UNA RECENSIONE**

Come è andata la transazione con questo ${otherUserRole}?

La tua recensione aiuta altri utenti a scegliere in sicurezza.

**Transazione:** ${transaction._id.toString().slice(-8)}
**Importo:** €${transaction.totalAmount.toFixed(2)}
**KWH:** ${transaction.kwhAmount}

Seleziona il tuo voto:`;
    }

    // Messaggi per notifiche
    static formatNotification(type, data) {
        switch (type) {
            case 'new_request':
                return `🔔 **NUOVA RICHIESTA**\n\nHai ricevuto una richiesta di acquisto per ${data.kwhAmount} KWH!\n\n💰 Guadagno: €${data.totalAmount.toFixed(2)}`;
                
            case 'request_confirmed':
                return `✅ **RICHIESTA CONFERMATA**\n\nIl venditore ha accettato la tua richiesta!\n\n⚡ KWH: ${data.kwhAmount}\n💰 Totale: €${data.totalAmount.toFixed(2)}`;
                
            case 'transaction_completed':
                return `🎉 **TRANSAZIONE COMPLETATA**\n\nComplimenti! La transazione è stata completata con successo.\n\n💰 Importo: €${data.totalAmount.toFixed(2)}`;
                
            default:
                return `🔔 **NOTIFICA**\n\n${data.message}`;
        }
    }
}

module.exports = Messages;
