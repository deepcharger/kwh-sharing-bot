# KWH Sharing Bot

Bot Telegram per la gestione di annunci compro/vendo KWH per auto elettriche.

## 🚀 Deploy su Render.com

### Configurazione Environment Variables

Nel dashboard di Render.com, configura le seguenti variabili:

```env
NODE_ENV=production
BOT_TOKEN=your_telegram_bot_token
BOT_USERNAME=your_bot_username
GROUP_ID=your_telegram_group_id
TOPIC_ID=your_telegram_topic_id
ADMIN_USER_ID=your_admin_telegram_id
ADMIN_USERNAME=your_admin_username
MONGODB_URI=your_mongodb_connection_string
WEBHOOK_URL=https://your-app-name.onrender.com/webhook
WEBHOOK_SECRET=your_webhook_secret_optional
KEEP_ALIVE_URL=https://your-app-name.onrender.com
ADMIN_API_TOKEN=your_admin_api_token_optional
```

### Setup Repository

1. Fork o clona questo repository
2. Connetti il repository a Render.com
3. Seleziona "Web Service" come tipo di servizio
4. Configura:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
   - **Plan**: Free (per test) o Starter (per produzione)

## 📁 Struttura del Progetto (Refactored)

```
src/
├── index.js                     # Entry point principale (semplificato)
├── database/
│   └── Database.js              # Gestione connessione MongoDB
├── services/
│   ├── UserService.js           # Logica utenti e feedback
│   ├── AnnouncementService.js   # Gestione annunci
│   └── TransactionService.js    # Gestione transazioni
├── handlers/
│   ├── CommandHandler.js        # Gestione comandi (/start, /help, etc.)
│   ├── CallbackHandler.js       # Gestione callback buttons
│   ├── MessageHandler.js        # Gestione messaggi di testo e media
│   ├── CronJobHandler.js        # Gestione job schedulati
│   └── WebhookHandler.js        # Configurazione webhook e server
├── scenes/
│   ├── SellAnnouncementScene.js # Scene creazione annuncio
│   ├── ContactSellerScene.js    # Scene contatto venditore
│   └── TransactionScene.js      # Scene gestione transazione
└── utils/
    ├── Keyboards.js             # Tastiere inline e reply
    ├── Messages.js              # Template messaggi
    └── TransactionCache.js      # Cache per ID transazioni (NUOVO)
```

## 🔧 Caratteristiche Principali

### ✅ Funzionalità Implementate

- **Gestione Annunci**: Creazione, pubblicazione e gestione annunci di vendita KWH
- **Sistema Transazioni**: Workflow completo dalla richiesta al pagamento
- **Feedback System**: Sistema di valutazioni con badge venditore
- **Admin Dashboard**: Statistiche e gestione admin
- **Cache System**: Cache intelligente per performance migliori
- **Health Monitoring**: Endpoint per monitoraggio salute servizio
- **Cron Jobs**: Task schedulati per reminder e pulizia
- **Rate Limiting**: Protezione contro spam e abusi
- **Error Handling**: Gestione errori robusta e logging

### 🏗️ Architettura Modulare

Il refactoring ha diviso il codice in moduli specializzati:

- **Handlers**: Gestiscono specifici tipi di input (comandi, callback, messaggi)
- **Services**: Logica business per entità (users, announcements, transactions)
- **Scenes**: Flussi conversazionali complessi
- **Utils**: Utilità condivise (keyboards, messages, cache)

## 📊 Monitoring e API

### Health Check
```
GET https://your-app.onrender.com/
```
Ritorna stato del servizio e database.

### API Status
```
GET https://your-app.onrender.com/api/status
```
Statistiche in tempo reale del bot.

### Metrics (Prometheus-style)
```
GET https://your-app.onrender.com/metrics
```
Metriche per monitoring.

### Admin API
```
GET https://your-app.onrender.com/admin/stats
Authorization: Bearer your_admin_token
```

## 🔄 Workflow Transazioni

1. **Pubblicazione Annuncio**: Venditore pubblica offerta KWH
2. **Richiesta Acquisto**: Acquirente contatta venditore tramite bot
3. **Conferma Vendita**: Venditore accetta/rifiuta richiesta
4. **Attivazione Ricarica**: Venditore attiva colonnina
5. **Conferma Ricarica**: Acquirente conferma inizio ricarica
6. **Completamento**: Acquirente invia foto display con KWH
7. **Validazione**: Venditore conferma KWH dichiarati
8. **Pagamento**: Acquirente effettua pagamento
9. **Conferma Pagamento**: Venditore conferma ricezione
10. **Feedback**: Entrambi lasciano feedback reciproco

## 🛠️ Sviluppo Locale

### Prerequisiti
- Node.js 18+
- MongoDB
- Bot Telegram configurato

### Installazione
```bash
npm install
cp .env.example .env
# Configura le variabili in .env
npm run dev
```

### Script Disponibili
- `npm start`: Avvia in produzione
- `npm run dev`: Avvia con nodemon per sviluppo
- `npm run health-check`: Test di salute

## 🔒 Sicurezza

- **Rate Limiting**: 30 richieste/minuto per IP
- **Webhook Secret**: Validazione richieste Telegram
- **Admin Authorization**: Token per endpoint admin
- **Input Validation**: Validazione rigorosa input utente
- **Error Sanitization**: Log sicuri senza dati sensibili

## 📈 Performance

### Ottimizzazioni Implementate

- **Transaction Cache**: Cache LRU per ID transazioni frequenti
- **Database Indexing**: Indici ottimizzati per query comuni
- **Connection Pooling**: Pool connessioni MongoDB
- **Memory Management**: Pulizia automatica cache e sessioni
- **Webhook vs Polling**: Webhook per performance migliori in produzione

### Monitoring

- **Health Checks**: Endpoint per verifica servizio
- **Metrics**: Esportazione metriche Prometheus
- **Logging**: Log strutturati per debugging
- **Error Tracking**: Cattura e notifica errori critici

## 🔧 Troubleshooting

### Errori Comuni

1. **Bot non risponde**
   - Verifica WEBHOOK_URL in variabili ambiente
   - Controlla logs per errori webhook
   - Testa endpoint `/` per health check

2. **Database connection failed**
   - Verifica MONGODB_URI
   - Controlla whitelist IP MongoDB Atlas
   - Verifica connessioni disponibili

3. **Webhook errors**
   - Verifica WEBHOOK_SECRET
   - Controlla URL accessibile pubblicamente
   - Verifica certificato SSL

### Debug Mode

Per debug dettagliato, imposta:
```env
DEBUG=true
LOG_LEVEL=debug
```

## 🚀 Deploy Checklist

- [ ] Variabili ambiente configurate
- [ ] MongoDB URI valido e accessibile
- [ ] Bot token valido
- [ ] Webhook URL corretto
- [ ] Health check funzionante
- [ ] Test transazione completa
- [ ] Monitoring configurato

## 📝 TODO

- [ ] Implementare sistema di dispute
- [ ] Aggiungere notifiche push
- [ ] Dashboard web per admin
- [ ] API pubblica per statistiche
- [ ] Sistema di backup automatico
- [ ] Integrazione sistemi di pagamento

## 🤝 Contributi

1. Fork del repository
2. Crea feature branch
3. Commit modifiche
4. Push e crea Pull Request

## 📄 Licenza

MIT License - vedi file LICENSE per dettagli.

## 🆘 Supporto

Per supporto:
- Crea issue su GitHub
- Contatta admin bot
- Verifica documentazione API
