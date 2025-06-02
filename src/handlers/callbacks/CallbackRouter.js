// src/handlers/callbacks/CallbackRouter.js - NUOVO FILE
const BaseHandler = require('../base/BaseHandler');

// Import all callback handlers
const NavigationCallbacks = require('./NavigationCallbacks');
const TransactionCallbacks = require('./TransactionCallbacks');
const PaymentCallbacks = require('./PaymentCallbacks');
const AnnouncementCallbacks = require('./AnnouncementCallbacks');
const ChargingCallbacks = require('./ChargingCallbacks');
const FeedbackCallbacks = require('./FeedbackCallbacks');
const AdminCallbacks = require('./AdminCallbacks');
const HelpCallbacks = require('./HelpCallbacks');

class CallbackRouter extends BaseHandler {
    constructor(bot) {
        super(bot);
        
        // Initialize all callback handlers
        this.handlers = {
            navigation: new NavigationCallbacks(bot),
            transaction: new TransactionCallbacks(bot),
            payment: new PaymentCallbacks(bot),
            announcement: new AnnouncementCallbacks(bot),
            charging: new ChargingCallbacks(bot),
            feedback: new FeedbackCallbacks(bot),
            admin: new AdminCallbacks(bot),
            help: new HelpCallbacks(bot)
        };
        
        // Route patterns
        this.routes = this.defineRoutes();
    }

    /**
     * Define callback routing patterns
     */
    defineRoutes() {
        return [
            // Navigation
            { pattern: /^back_to_/, handler: 'navigation' },
            { pattern: /^my_/, handler: 'navigation' },
            { pattern: /^tx_history$/, handler: 'navigation' },
            { pattern: /^view_tx_detail_/, handler: 'navigation' },
            
            // Transactions
            { pattern: /^accept_request_/, handler: 'transaction' },
            { pattern: /^reject_request_/, handler: 'transaction' },
            { pattern: /^contact_buyer_/, handler: 'transaction' },
            { pattern: /^view_tx_/, handler: 'transaction' },
            { pattern: /^manage_tx_/, handler: 'transaction' },
            { pattern: /^arrived_at_station_/, handler: 'transaction' },
            
            // Payment
            { pattern: /^payment_/, handler: 'payment' },
            { pattern: /^confirm_payment_/, handler: 'payment' },
            { pattern: /^select_payment_/, handler: 'payment' },
            { pattern: /^retry_payment$/, handler: 'payment' },
            
            // Announcements
            { pattern: /^view_ann_/, handler: 'announcement' },
            { pattern: /^delete_ann_/, handler: 'announcement' },
            { pattern: /^extend_ann_/, handler: 'announcement' },
            { pattern: /^refresh_ann_/, handler: 'announcement' },
            { pattern: /^stats_ann_/, handler: 'announcement' },
            { pattern: /^confirm_del_/, handler: 'announcement' },
            { pattern: /^cancel_del_/, handler: 'announcement' },
            
            // Charging
            { pattern: /^activate_charging_/, handler: 'charging' },
            { pattern: /^delay_charging_/, handler: 'charging' },
            { pattern: /^technical_issues_/, handler: 'charging' },
            { pattern: /^charging_/, handler: 'charging' },
            { pattern: /^kwh_/, handler: 'charging' },
            
            // Feedback
            { pattern: /^feedback_/, handler: 'feedback' },
            
            // Admin
            { pattern: /^admin_/, handler: 'admin' },
            
            // Help
            { pattern: /^help_/, handler: 'help' },
            { pattern: /^contact_admin$/, handler: 'help' },
            
            // Buy/Sell
            { pattern: /^buy_/, handler: 'navigation' },
            { pattern: /^sell_/, handler: 'navigation' },
            { pattern: /^view_offer_/, handler: 'navigation' },
            
            // Generic
            { pattern: /^dismiss_/, handler: 'navigation' }
        ];
    }

    /**
     * Setup all callback handlers
     */
    async setup() {
        console.log('🔧 Setting up callback router...');
        
        // Setup individual handlers
        for (const [name, handler] of Object.entries(this.handlers)) {
            if (typeof handler.setup === 'function') {
                await handler.setup();
            }
        }
        
        // Register callback query handler
        this.bot.bot.on('callback_query', async (ctx) => {
            await this.handleCallbackQuery(ctx);
        });
        
        console.log('✅ Callback router setup completed');
    }

    /**
     * Main callback query handler
     */
    async handleCallbackQuery(ctx) {
        const callbackData = ctx.callbackQuery.data;
        
        if (!callbackData) {
            await this.answerCallback(ctx);
            return;
        }
        
        try {
            // Log the action
            await this.logAction(ctx, 'callback_query', { data: callbackData });
            
            // Find matching route
            const route = this.routes.find(r => r.pattern.test(callbackData));
            
            if (!route) {
                console.warn(`No route found for callback: ${callbackData}`);
                await this.answerCallback(ctx, '❌ Azione non riconosciuta');
                return;
            }
            
            // Get handler
            const handler = this.handlers[route.handler];
            
            if (!handler) {
                console.error(`Handler not found: ${route.handler}`);
                await this.answerCallback(ctx, '❌ Errore interno');
                return;
            }
            
            // Execute handler
            await handler.handle(ctx, callbackData);
            
        } catch (error) {
            await this.handleError(ctx, error);
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        const stats = {
            totalRoutes: this.routes.length,
            handlers: {}
        };
        
        for (const [name, handler] of Object.entries(this.handlers)) {
            if (typeof handler.getStats === 'function') {
                stats.handlers[name] = handler.getStats();
            }
        }
        
        return stats;
    }
}

module.exports = CallbackRouter;
