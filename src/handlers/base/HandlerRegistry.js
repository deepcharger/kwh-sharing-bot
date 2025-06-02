// src/handlers/base/HandlerRegistry.js - NUOVO FILE
class HandlerRegistry {
    constructor(bot) {
        this.bot = bot;
        this.handlers = new Map();
        this.middleware = [];
    }

    /**
     * Register a handler
     */
    register(name, handler) {
        if (this.handlers.has(name)) {
            console.warn(`Handler ${name} already registered, overwriting...`);
        }
        this.handlers.set(name, handler);
        console.log(`✅ Handler registered: ${name}`);
    }

    /**
     * Get a handler by name
     */
    get(name) {
        const handler = this.handlers.get(name);
        if (!handler) {
            console.error(`Handler ${name} not found`);
        }
        return handler;
    }

    /**
     * Register middleware
     */
    use(middleware) {
        this.middleware.push(middleware);
    }

    /**
     * Execute middleware chain
     */
    async executeMiddleware(ctx, next) {
        let index = 0;
        
        const dispatch = async (i) => {
            if (i <= index) {
                throw new Error('next() called multiple times');
            }
            
            index = i;
            
            if (i === this.middleware.length) {
                return next();
            }
            
            const middleware = this.middleware[i];
            return middleware(ctx, () => dispatch(i + 1));
        };
        
        return dispatch(0);
    }

    /**
     * Setup all handlers
     */
    async setupAll() {
        console.log('🔧 Setting up handlers...');
        
        for (const [name, handler] of this.handlers) {
            try {
                if (typeof handler.setup === 'function') {
                    await handler.setup();
                    console.log(`✅ Handler setup completed: ${name}`);
                }
            } catch (error) {
                console.error(`❌ Handler setup failed: ${name}`, error);
                throw error;
            }
        }
        
        console.log('✅ All handlers setup completed');
    }

    /**
     * Get handler statistics
     */
    getStats() {
        const stats = {
            totalHandlers: this.handlers.size,
            totalMiddleware: this.middleware.length,
            handlers: Array.from(this.handlers.keys())
        };
        
        // Add handler-specific stats if available
        for (const [name, handler] of this.handlers) {
            if (typeof handler.getStats === 'function') {
                stats[`${name}Stats`] = handler.getStats();
            }
        }
        
        return stats;
    }

    /**
     * Cleanup all handlers
     */
    async cleanup() {
        console.log('🧹 Cleaning up handlers...');
        
        for (const [name, handler] of this.handlers) {
            try {
                if (typeof handler.cleanup === 'function') {
                    await handler.cleanup();
                    console.log(`✅ Handler cleanup completed: ${name}`);
                }
            } catch (error) {
                console.error(`❌ Handler cleanup failed: ${name}`, error);
            }
        }
        
        this.handlers.clear();
        this.middleware = [];
        console.log('✅ All handlers cleaned up');
    }
}

module.exports = HandlerRegistry;
