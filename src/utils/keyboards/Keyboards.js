// src/utils/keyboards/Keyboards.js - NUOVO FILE (sostituisce il vecchio)
const MainMenuKeyboard = require('./MainMenuKeyboard');
const TransactionKeyboards = require('./TransactionKeyboards');
const AnnouncementKeyboards = require('./AnnouncementKeyboards');
const PaymentKeyboards = require('./PaymentKeyboards');
const ChargingKeyboards = require('./ChargingKeyboards');
const FeedbackKeyboards = require('./FeedbackKeyboards');
const HelpKeyboards = require('./HelpKeyboards');
const AdminKeyboards = require('./AdminKeyboards');
const { Markup } = require('telegraf');

class Keyboards {
    // Main menu
    static get MAIN_MENU() {
        return MainMenuKeyboard.getMainMenu();
    }
    
    // Generic keyboards
    static get CANCEL_ONLY() {
        return Markup.keyboard([
            ['❌ Annulla']
        ]).resize().oneTime();
    }
    
    static getBackToMainMenuKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Torna al menu principale', 'back_to_main')]
        ]);
    }
    
    static removeKeyboard() {
        return Markup.removeKeyboard();
    }
    
    // Module exports
    static transaction = TransactionKeyboards;
    static announcement = AnnouncementKeyboards;
    static payment = PaymentKeyboards;
    static charging = ChargingKeyboards;
    static feedback = FeedbackKeyboards;
    static help = HelpKeyboards;
    static admin = AdminKeyboards;
}

module.exports = Keyboards;
