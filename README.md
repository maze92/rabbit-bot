# Ozark Bot

Ozark Bot is a modern Discord moderation and utility bot with a clean web dashboard, designed for small and medium communities that want **automation**, **transparency** and **safety** without complexity.

The project is being rebuilt from the ground up with a focus on:

- Clear and auditable moderation (everything registred as infractions)
- A trust-based system instead of hard bans/kicks
- A simple support flow based on tickets via threads
- A lightweight GameNews system for gaming communities
- Easy deployment on platforms like **Railway**

---

## Features (v1.0.0)

### 🔐 Trust‑based moderation

- Central **trust score** per user (per guild), stored in MongoDB.
- Every moderation action creates an **Infraction** (`WARN` / `MUTE`).
- Automatic **escalation** based on trust and number of warns:
  - After a configurable number of WARNs, the bot applies a temporary **mute**.
  - Mute duration scales automatically with the user's trust level.
- No automatic kicks/bans – everything is controlled by trust and mutes.
- Full history visible in the dashboard:
  - Recent infractions
  - Trust score and trust label
  - Next estimated auto‑mute (how many warns left and for how many minutes)

### 🧑‍⚖️ Moderation dashboard

Web dashboard (Express + Socket.IO) with:

- **Overview** of moderation activity for the last 24h.
- **Users panel**:
  - Search users and inspect:
    - Trust, warnings, infractions
    - Recent tickets autolinked
  - Quick actions:
    - `Warn`
    - `Unmute`
    - `Reset trust/warnings` (for false positives or manual forgiveness)
- Respect for role hierarchy:
  - The bot never acts on members with higher or equal role.
  - Certain internal roles (e.g. system roles) are hidden from the UI.

### 🎫 Ticket system via threads

- Static support message in a configurable **Ticket channel**.
- Users react on the message to open a **thread** (e.g. `ticket-001`, `ticket-002`, ...).
- Inside each ticket thread, the bot sends an initial embed with a close button:
  - Any participant in the thread can close the ticket via the button.
- Old `/ticket` and `/ticketclose` command logic has been removed.
- Ticket events are logged in the dashboard under a **Tickets** section in moderation logs.

### 📰 GameNews

- Per‑guild configuration of which RSS feeds are active.
- Simple limiter for number of posts per interval to avoid spam.
- Feeds can be toggled on/off per guild from the dashboard.
- Posts are sent directly into the configured channel(s) in a clean, minimal format.

### 🌐 Internationalization

- Full PT / EN support for:
  - Dashboard texts
  - Slash command descriptions
  - System messages (where relevant)
- Language is switchable from the dashboard.
- AutoMod messages use **generic** and user‑friendly texts (e.g. "Linguagem imprópria") instead of exposing the exact detected content.

### 🧱 Tech stack

- **Node.js** 20.x
- **discord.js** 14
- **Express** + **Socket.IO** for the dashboard
- **MongoDB** with Mongoose
- Ready for **Railway** deployment (Docker/Procfile not required, uses `node src/index.js`).

---

## Getting started

### Prerequisites

- Node.js 20.x
- A MongoDB database (Atlas or self‑hosted)
- A Discord application + bot token
- (Optional) Railway account for hosting

### Installation

```bash
git clone https://github.com/maze92/ozark-bot.git
cd ozark-bot
npm install
```

### Configuration

All main options live in `src/config/defaultConfig.js`. At minimum, you must set:

- `discord.token` – your bot token
- `mongo.uri` – Mongo connection string
- `dashboard.token` – secret token to access the web dashboard
- `gameNews` – default feed configuration (can be refined later)
- `automation.autoMute` – thresholds and durations for automatic mutes
- `trust` – base, min, max and penalty rules

Environment variables (via `.env`) can override sensitive values, for example:

```env
DISCORD_TOKEN=your-token-here
MONGO_URI=mongodb+srv://...
DASHBOARD_TOKEN=some-long-secret
PORT=3000
```

### Running locally

```bash
npm start
```

- The bot will connect to Discord and MongoDB.
- The dashboard will start on the configured port (default: `3000`).
- Open `http://localhost:3000` and enter your dashboard token.

---

## Deployment (Railway)

1. Push this repository to your own GitHub account.
2. Create a new Railway project and connect the repo.
3. Set environment variables:
   - `DISCORD_TOKEN`
   - `MONGO_URI`
   - `DASHBOARD_TOKEN`
   - `PORT`
4. Railway will run the `start` script from `package.json`:
   - `NODE_ENV=production node src/index.js`

---

## Roadmap

Some of the next planned improvements:

- More advanced GameNews UX (per‑feed control, better embeds).
- Additional moderation widgets for the dashboard.
- Optional logging to external services (e.g. webhooks).
- More granular trust visualizations and analytics.

---

## License

This project is released under the **ISC** license. See `LICENSE` for details.
