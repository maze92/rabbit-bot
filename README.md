# Ozark Bot

**Ozark Bot** is a production‑ready Discord moderation bot with a real‑time web dashboard, MongoDB persistence, and automated background maintenance. It is designed for reliability, clarity, and easy deployment (Railway‑ready).

> Built with **Node.js 20**, **discord.js v14**, **Express**, **Socket.IO**, and **MongoDB (Mongoose)**.

---

## ✨ Key Capabilities

### Moderation

* Commands: `warn`, `mute`, `unmute`, `clear`, `userinfo`, `help`
* Slash commands supported per guild
* Persistent infractions (WARN / MUTE / KICK / BAN)
* Configurable staff permissions

### Anti‑Spam & Auto‑Moderation

* Burst and duplicate message detection
* Trust‑based thresholds (dynamic limits per user)
* Automatic warn/mute escalation
* Protection against double punishment (AutoMod vs Anti‑Spam)

### Web Dashboard

* Live logs via Socket.IO
* Health endpoint with runtime status and metrics
* Token‑protected API
* Guild‑specific configuration (MongoDB)

### Game News System

* RSS feeds (e.g., GameSpot)
* Deduplication and age filtering
* Rich embeds sent to Discord channels

### Reliability & Ops

* MongoDB auto‑reconnect
* Centralized process error handling (ErrorGuard)
* Graceful shutdown (SIGINT / SIGTERM)
* Scheduled maintenance (log & infraction pruning)

---

## 📊 Observability

The `/health` endpoint exposes:

* Discord readiness
* MongoDB connection state
* GameNews runtime state
* Uptime
* Metrics:

  * `totalCommandsExecuted`
  * `totalInfractionsCreated`
  * `autoModActions`
  * `antiSpamActions`

---

## 🧩 Architecture Overview

```
src/
├─ index.js              # Entry point
├─ dashboard.js          # Express + Socket.IO dashboard
├─ events/               # Discord lifecycle events
├─ systems/              # Core systems (logger, status, automod, maintenance)
├─ database/             # Mongo connection & models
├─ utils/                # Helpers (time, trust, permissions)
└─ config/               # Central configuration
```

---

## ⚙️ Configuration

Primary configuration file:

```
src/config/defaultConfig.js
```

Example (dashboard section):

```js
dashboard: {
  enabled: true,
  maxLogs: 200,
  maxDbLogs: 1000,
  requireAuth: true,
  allowedOrigins: ['https://ozark-bot-production.up.railway.app']
}
```

Guild‑specific overrides are stored in MongoDB via the `GuildConfig` model.

---

## 🔐 Environment Variables

Required:

* `DISCORD_TOKEN` — Discord bot token
* `MONGO_URI` — MongoDB connection string
* `DASHBOARD_TOKEN` — Dashboard API access token

Optional:

* `PORT` — Dashboard port (default: 3000)
* `NODE_ENV` — `development` | `production`

---

## ▶️ Running Locally

```bash
npm install
npm run dev
```

For production:

```bash
npm start
```

---

## 🚀 Deployment (Railway)

1. Create a Railway project
2. Upload the flat project (package.json at root)
3. Configure environment variables
4. Ensure Node.js `20.x`
5. Deploy

Expected startup logs:

```
🛡️ ErrorGuard initialized
🚀 Dashboard running on port 3000
✅ Bot is online
🟢 MongoDB connected
```

---

## 🧪 Tests

A lightweight test runner is included:

```bash
npm test
```

(Currently validates utility helpers and configuration integrity.)

---

## 🗺️ Roadmap

* Discord OAuth2 authentication for dashboard
* Advanced dashboard filters and guild settings UI
* Extended AutoMod rules (links, caps, emojis)
* Full i18n support (PT / EN)

---

## 📄 License

ISC — free to use, modify, and distribute.
