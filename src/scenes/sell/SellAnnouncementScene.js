// src/scenes/sell/SellAnnouncementScene.js
const BaseScene = require('../base/BaseScene');
const PricingStep = require('./steps/PricingStep');
const DetailsStep = require('./steps/DetailsStep');
const PublishStep = require('./steps/PublishStep');
const Messages = require('../../utils/messages/Messages');
const { PRICING } = require('../../config/constants');

class SellAnnouncementScene extends BaseScene {
    constructor(bot) {
        super('sellAnnouncement', bot);
        
        // Initialize steps
        this.steps = {
            pricing: new PricingStep(bot),
            details: new DetailsStep(bot),
            publish: new PublishStep(bot)
        };
    }

    // Override session keys for cleanup
    getSessionKeys() {
        return [
            'announcementData',
            'step',
            'editingField',
            'pricingType'
        ];
    }

    // Scene entry point
    async onSceneEnter(ctx) {
        ctx.session.announcementData = {};
        
        await this.sendMessage(ctx, Messages.SELL_WELCOME, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📝 Crea Annuncio', callback_data: 'start_announcement' }],
                    [{ text: '❌ Annulla', callback_data: 'cancel' }]
                ]
            }
        });
    }

    // Setup scene handlers
    setupHandlers() {
        // Initial action
        this.action('start_announcement', async (ctx) => {
            await ctx.answerCbQuery();
            await PricingStep.showPricingTypeSelection(ctx);
        });

        // Pricing type selection
        this.action('price_fixed', async (ctx) => {
            await ctx.answerCbQuery();
            ctx.session.announcementData.pricingType = 'fixed';
            await ctx.editMessageText(
                '💵 **PREZZO FISSO**\n\nQuale prezzo vuoi impostare per KWH?\n\nInserisci un valore (es: 0.35):',
                { parse_mode: 'Markdown' }
            );
            ctx.session.step = 'price';
        });

        this.action('price_graduated', async (ctx) => {
            await ctx.answerCbQuery();
            ctx.session.announcementData.pricingType = 'graduated';
            ctx.session.announcementData.pricingTiers = [];
            await ctx.editMessageText(
                '📊 **PREZZI GRADUATI - ISTRUZIONI**\n\n' +
                '**Come funziona:**\n' +
                'Puoi impostare prezzi diversi per fasce di consumo.\n' +
                'Chi ricarica di più può avere prezzi migliori!\n\n' +
                '**Formato:** `limite prezzo` oppure `oltre X prezzo`\n\n' +
                '**Esempio completo:**\n' +
                '• `30 0.35` → 1-30 KWH a 0.35€\n' +
                '• `60 0.30` → 31-60 KWH a 0.30€\n' +
                '• `oltre 60 0.25` → Oltre 60 KWH a 0.25€\n\n' +
                '**Iniziamo con la prima fascia:**\n' +
                'Inserisci limite e prezzo (es: `30 0.35`)',
                { parse_mode: 'Markdown' }
            );
            ctx.session.step = 'graduated_tier';
        });

        this.action('price_help', async (ctx) => {
            await ctx.answerCbQuery();
            await PricingStep.showPricingHelp(ctx);
        });

        this.action('back_to_pricing', async (ctx) => {
            await ctx.answerCbQuery();
            await PricingStep.showPricingTypeSelection(ctx);
        });

        // Minimum KWH handlers
        this.action('set_minimum', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                '🎯 Inserisci il numero minimo di KWH (es: 10):',
                { parse_mode: 'Markdown' }
            );
            ctx.session.step = 'minimum_kwh';
        });

        this.action('skip_minimum', async (ctx) => {
            await ctx.answerCbQuery();
            ctx.session.announcementData.minimumKwh = null;
            await DetailsStep.askCurrentType(ctx);
        });

        // Graduated tiers handlers
        this.action('finish_tiers', async (ctx) => {
            await ctx.answerCbQuery();
            await PricingStep.finishGraduatedTiers(ctx);
        });

        this.action('confirm_no_oltre', async (ctx) => {
            await ctx.answerCbQuery();
            const tiers = ctx.session.announcementData.pricingTiers;
            const lastTier = tiers[tiers.length - 1];
            tiers.push({ 
                limit: null, 
                price: lastTier.price
            });
            await PricingStep.showMinimumKwhOption(ctx);
        });

        this.action('add_oltre_tier', async (ctx) => {
            await ctx.answerCbQuery();
            const tiers = ctx.session.announcementData.pricingTiers;
            const lastLimit = tiers[tiers.length - 1].limit;
            
            await ctx.editMessageText(
                `📊 **AGGIUNGI FASCIA FINALE**\n\n` +
                `Inserisci il prezzo per chi ricarica oltre ${lastLimit} KWH.\n\n` +
                `Formato: \`oltre ${lastLimit} prezzo\`\n` +
                `Esempio: \`oltre ${lastLimit} 0.25\``,
                { parse_mode: 'Markdown' }
            );
            ctx.session.step = 'graduated_tier';
        });

        // Current type handlers
        this.action(/^current_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const currentType = DetailsStep.handleCurrentType(ctx.match[1]);
            ctx.session.announcementData.currentType = currentType;
            await DetailsStep.askZones(ctx);
            ctx.session.step = 'zones';
        });

        // Networks handlers
        this.action('networks_all', async (ctx) => {
            await ctx.answerCbQuery();
            ctx.session.announcementData.networks = 'Tutte le reti';
            await DetailsStep.askDescription(ctx);
        });

        this.action('networks_specific', async (ctx) => {
            await ctx.answerCbQuery();
            await DetailsStep.askSpecificNetworks(ctx);
            ctx.session.step = 'networks';
        });

        // Description handlers
        this.action('add_description', async (ctx) => {
            await ctx.answerCbQuery();
            await DetailsStep.askDescriptionText(ctx);
            ctx.session.step = 'description';
        });

        this.action('skip_description', async (ctx) => {
            await ctx.answerCbQuery();
            ctx.session.announcementData.description = '';
            await DetailsStep.askAvailability(ctx);
        });

        // Availability handlers
        this.action('availability_always', async (ctx) => {
            await ctx.answerCbQuery();
            ctx.session.announcementData.availability = 'Sempre disponibile';
            await DetailsStep.askPaymentMethods(ctx);
            ctx.session.step = 'payment_methods';
        });

        this.action('availability_custom', async (ctx) => {
            await ctx.answerCbQuery();
            await DetailsStep.askCustomAvailability(ctx);
            ctx.session.step = 'availability';
        });

        // Publishing handlers
        this.action('publish_announcement', async (ctx) => {
            await ctx.answerCbQuery();
            const data = ctx.session.announcementData;
            await PublishStep.publishAnnouncement(ctx, this.bot, data);
            await this.leave();
        });

        this.action('edit_announcement', async (ctx) => {
            await ctx.answerCbQuery();
            await PublishStep.handleEdit(ctx);
        });

        // Edit field handlers
        this.action(/^edit_(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const field = ctx.match[1];
            ctx.session.editingField = field;
            await this.handleEditField(ctx, field);
        });

        this.action('back_to_preview', async (ctx) => {
            await ctx.answerCbQuery();
            await PublishStep.showPreview(ctx, ctx.session.announcementData);
        });

        // Text message handler
        this.on('text', async (ctx) => {
            await this.handleTextInput(ctx);
        });
    }

    // Handle text input based on current step
    async handleTextInput(ctx) {
        const text = ctx.message.text.trim();
        const step = ctx.session.step;

        try {
            switch (step) {
                case 'price':
                    const priceValid = await PricingStep.handleFixedPrice(ctx, text);
                    if (priceValid) {
                        ctx.session.step = null;
                    }
                    break;

                case 'graduated_tier':
                    const tierValid = await PricingStep.handleGraduatedTier(ctx, text);
                    if (tierValid && text.toLowerCase() !== 'fine') {
                        // Stay in graduated_tier step unless finished
                    }
                    break;

                case 'minimum_kwh':
                    const minValid = await PricingStep.handleMinimumKwh(ctx, text);
                    if (minValid) {
                        await DetailsStep.askCurrentType(ctx);
                        ctx.session.step = null;
                    }
                    break;

                case 'zones':
                    const zonesValid = DetailsStep.validateZones(text);
                    if (!zonesValid.valid) {
                        await ctx.reply(zonesValid.error);
                        return;
                    }
                    ctx.session.announcementData.zones = text;
                    ctx.session.announcementData.location = text;
                    await DetailsStep.askNetworks(ctx);
                    ctx.session.step = null;
                    break;

                case 'networks':
                    const networksValid = DetailsStep.validateNetworks(text);
                    if (!networksValid.valid) {
                        await ctx.reply(networksValid.error);
                        return;
                    }
                    ctx.session.announcementData.networks = text;
                    await DetailsStep.askDescription(ctx);
                    ctx.session.step = null;
                    break;

                case 'description':
                    const descValid = DetailsStep.validateDescription(text);
                    if (!descValid.valid) {
                        await ctx.reply(descValid.error);
                        return;
                    }
                    ctx.session.announcementData.description = text;
                    await DetailsStep.askAvailability(ctx);
                    ctx.session.step = null;
                    break;

                case 'availability':
                    const availValid = DetailsStep.validateAvailability(text);
                    if (!availValid.valid) {
                        await ctx.reply(availValid.error);
                        return;
                    }
                    ctx.session.announcementData.availability = text;
                    await DetailsStep.askPaymentMethods(ctx);
                    ctx.session.step = 'payment_methods';
                    break;

                case 'payment_methods':
                    const methodsValid = DetailsStep.validatePaymentMethods(text);
                    if (!methodsValid.valid) {
                        await ctx.reply(methodsValid.error);
                        return;
                    }
                    ctx.session.announcementData.paymentMethods = text;
                    await PublishStep.showPreview(ctx, ctx.session.announcementData);
                    ctx.session.step = null;
                    break;

                default:
                    await this.showError(ctx, 'Non capisco cosa vuoi fare. Usa i pulsanti del menu.');
            }
        } catch (error) {
            await this.handleError(ctx, error);
        }
    }

    // Handle field editing
    async handleEditField(ctx, field) {
        const fieldMessages = {
            'price': 'Inserisci il nuovo prezzo:',
            'zones': 'Inserisci le nuove zone:',
            'networks': 'Inserisci le nuove reti:',
            'availability': 'Inserisci la nuova disponibilità:',
            'payments': 'Inserisci i nuovi metodi di pagamento:'
        };

        const message = fieldMessages[field] || 'Inserisci il nuovo valore:';
        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
        ctx.session.step = `edit_${field}`;
    }
}

module.exports = SellAnnouncementScene;
