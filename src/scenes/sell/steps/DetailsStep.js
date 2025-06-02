// src/scenes/sell/steps/DetailsStep.js
const { Markup } = require('telegraf');
const MarkdownEscape = require('../../../utils/helpers/MarkdownEscape');

class DetailsStep {
    constructor(bot) {
        this.bot = bot;
    }

    /**
     * Ask for current type
     */
    static async askCurrentType(ctx) {
        await ctx.reply(
            '⚡ **TIPO DI CORRENTE**\n\nChe tipo di corrente offri?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔌 Solo DC', callback_data: 'current_dc_only' }],
                        [{ text: '⚡ Solo AC', callback_data: 'current_ac_only' }],
                        [{ text: '🔋 Entrambi DC e AC', callback_data: 'current_both' }],
                        [{ text: '❌ Annulla', callback_data: 'cancel' }]
                    ]
                }
            }
        );
    }

    /**
     * Handle current type selection
     */
    static handleCurrentType(selection) {
        const typeMap = {
            'dc_only': 'Solo DC',
            'ac_only': 'Solo AC',
            'both': 'Entrambi (DC e AC)'
        };
        
        return typeMap[selection] || selection;
    }

    /**
     * Ask for zones
     */
    static async askZones(ctx) {
        await ctx.editMessageText(
            '📍 **ZONE SERVITE**\n\n' +
            'In quali zone offri il servizio?\n\n' +
            '💡 **Suggerimenti:**\n' +
            '• "Italia" (tutto il paese)\n' +
            '• "Lombardia" (intera regione)\n' +
            '• "Milano e provincia"\n' +
            '• "Centro Milano, Navigli, Porta Romana"\n\n' +
            'Inserisci le zone:',
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Validate zones input
     */
    static validateZones(zones) {
        if (!zones || zones.trim().length < 3) {
            return {
                valid: false,
                error: '❌ Inserisci almeno una zona (minimo 3 caratteri)'
            };
        }
        
        if (zones.length > 200) {
            return {
                valid: false,
                error: '❌ Descrizione zone troppo lunga (max 200 caratteri)'
            };
        }
        
        return { valid: true };
    }

    /**
     * Ask for networks
     */
    static async askNetworks(ctx) {
        await ctx.reply(
            '🌐 **RETI DI RICARICA**\n\nQuale rete di ricarica usi?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🌐 Tutte le reti', callback_data: 'networks_all' }],
                        [{ text: '📝 Specifica reti', callback_data: 'networks_specific' }],
                        [{ text: '❌ Annulla', callback_data: 'cancel' }]
                    ]
                }
            }
        );
    }

    /**
     * Ask for specific networks
     */
    static async askSpecificNetworks(ctx) {
        await ctx.editMessageText(
            '🌐 Inserisci le reti disponibili separate da virgola\n\n' +
            'Esempio: Enel X, Be Charge, Ionity',
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Validate networks input
     */
    static validateNetworks(networks) {
        if (!networks || networks.trim().length < 3) {
            return {
                valid: false,
                error: '❌ Inserisci almeno una rete'
            };
        }
        
        if (networks.length > 200) {
            return {
                valid: false,
                error: '❌ Elenco reti troppo lungo (max 200 caratteri)'
            };
        }
        
        return { valid: true };
    }

    /**
     * Ask for description
     */
    static async askDescription(ctx) {
        await ctx.reply(
            '📝 **DESCRIZIONE** (opzionale)\n\n' +
            'Vuoi aggiungere una descrizione?\n' +
            'Puoi specificare dettagli come orari preferiti, tipo di colonnine disponibili, ecc.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Sì, aggiungi', callback_data: 'add_description' }],
                        [{ text: '❌ No, continua', callback_data: 'skip_description' }],
                        [{ text: '🔙 Annulla', callback_data: 'cancel' }]
                    ]
                }
            }
        );
    }

    /**
     * Ask for description text
     */
    static async askDescriptionText(ctx) {
        await ctx.editMessageText(
            '📝 Inserisci una breve descrizione (max 500 caratteri)\n\n' +
            'Esempio: "Disponibile per ricariche veloci DC fino a 150kW. ' +
            'Accesso 24/7, parcheggio gratuito durante la ricarica"',
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Validate description
     */
    static validateDescription(description) {
        if (description.length > 500) {
            return {
                valid: false,
                error: '❌ La descrizione deve essere massimo 500 caratteri. Riprova:'
            };
        }
        
        return { valid: true };
    }

    /**
     * Ask for availability
     */
    static async askAvailability(ctx) {
        await ctx.reply(
            '⏰ **DISPONIBILITÀ**\n\nQuando sei disponibile per attivare le ricariche?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🕐 Sempre disponibile', callback_data: 'availability_always' }],
                        [{ text: '⏰ Specifica orari', callback_data: 'availability_custom' }],
                        [{ text: '❌ Annulla', callback_data: 'cancel' }]
                    ]
                }
            }
        );
    }

    /**
     * Ask for custom availability
     */
    static async askCustomAvailability(ctx) {
        await ctx.editMessageText(
            '⏰ Inserisci gli orari di disponibilità\n\n' +
            'Esempi:\n' +
            '• "Lun-Ven 8:00-18:00"\n' +
            '• "Tutti i giorni 7:00-22:00"\n' +
            '• "Weekend e festivi 24h"',
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Validate availability
     */
    static validateAvailability(availability) {
        if (!availability || availability.trim().length < 5) {
            return {
                valid: false,
                error: '❌ Inserisci una disponibilità valida'
            };
        }
        
        if (availability.length > 200) {
            return {
                valid: false,
                error: '❌ La disponibilità deve essere massimo 200 caratteri'
            };
        }
        
        return { valid: true };
    }

    /**
     * Ask for payment methods
     */
    static async askPaymentMethods(ctx) {
        await ctx.reply(
            '💳 **METODI DI PAGAMENTO**\n\n' +
            'Quali metodi di pagamento accetti?\n\n' +
            'Inserisci i metodi separati da virgola.\n' +
            'Esempio: PayPal, Satispay, Bonifico',
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Validate payment methods
     */
    static validatePaymentMethods(methods) {
        if (!methods || methods.trim().length < 3) {
            return {
                valid: false,
                error: '❌ Inserisci almeno un metodo di pagamento'
            };
        }
        
        if (methods.length > 200) {
            return {
                valid: false,
                error: '❌ Elenco metodi troppo lungo (max 200 caratteri)'
            };
        }
        
        // Check for common payment methods
        const commonMethods = ['paypal', 'satispay', 'bonifico', 'contanti', 'revolut'];
        const hasValidMethod = commonMethods.some(method => 
            methods.toLowerCase().includes(method)
        );
        
        if (!hasValidMethod) {
            return {
                valid: false,
                error: '⚠️ Assicurati di includere almeno un metodo di pagamento comune'
            };
        }
        
        return { valid: true };
    }

    /**
     * Generate location examples based on zones
     */
    static generateLocationExamples(zones) {
        const examples = [];
        
        if (zones.toLowerCase().includes('milano')) {
            examples.push(
                'Via Dante 15, Milano',
                'Piazza Duomo, Milano',
                'Corso Buenos Aires 45, Milano'
            );
        } else if (zones.toLowerCase().includes('roma')) {
            examples.push(
                'Via del Corso 100, Roma',
                'Piazza Navona, Roma',
                'Via Nazionale 50, Roma'
            );
        } else {
            examples.push(
                'Via Roma 1, [Città]',
                'Piazza Centrale, [Città]',
                'Corso Principale 10, [Città]'
            );
        }
        
        return examples;
    }

    /**
     * Validate all details
     */
    static validateAllDetails(data) {
        const required = ['currentType', 'zones', 'networks', 'availability', 'paymentMethods'];
        const missing = [];
        
        for (const field of required) {
            if (!data[field]) {
                missing.push(field);
            }
        }
        
        if (missing.length > 0) {
            return {
                valid: false,
                error: `Mancano i seguenti campi: ${missing.join(', ')}`
            };
        }
        
        return { valid: true };
    }
}

module.exports = DetailsStep;
