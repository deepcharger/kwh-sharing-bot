// src/scenes/base/SceneFactory.js
const logger = require('../../utils/logger');

class SceneFactory {
    constructor() {
        this.scenes = new Map();
    }

    /**
     * Register a scene creator
     */
    register(name, creator) {
        if (typeof creator !== 'function') {
            throw new Error(`Scene creator for ${name} must be a function`);
        }
        this.scenes.set(name, creator);
        logger.debug(`Scene registered: ${name}`);
    }

    /**
     * Create a scene instance
     */
    create(name, bot) {
        const creator = this.scenes.get(name);
        
        if (!creator) {
            throw new Error(`Scene ${name} not found`);
        }
        
        try {
            const scene = creator(bot);
            logger.debug(`Scene created: ${name}`);
            return scene;
        } catch (error) {
            logger.error(`Error creating scene ${name}:`, error);
            throw error;
        }
    }

    /**
     * Create all registered scenes
     */
    createAll(bot) {
        const createdScenes = [];
        
        for (const [name, creator] of this.scenes) {
            try {
                const scene = creator(bot);
                createdScenes.push(scene);
                logger.debug(`Scene created: ${name}`);
            } catch (error) {
                logger.error(`Error creating scene ${name}:`, error);
            }
        }
        
        return createdScenes;
    }

    /**
     * Get list of registered scenes
     */
    getRegisteredScenes() {
        return Array.from(this.scenes.keys());
    }

    /**
     * Clear all registered scenes
     */
    clear() {
        this.scenes.clear();
    }
}

// Singleton instance
const sceneFactory = new SceneFactory();

// Register default scenes
sceneFactory.register('sellAnnouncement', (bot) => {
    const { createSellAnnouncementScene } = require('../SellAnnouncementScene');
    return createSellAnnouncementScene(bot);
});

sceneFactory.register('contactSeller', (bot) => {
    const { createContactSellerScene } = require('../ContactSellerScene');
    return createContactSellerScene(bot);
});

sceneFactory.register('transaction', (bot) => {
    const { createTransactionScene } = require('../TransactionScene');
    return createTransactionScene(bot);
});

module.exports = sceneFactory;
