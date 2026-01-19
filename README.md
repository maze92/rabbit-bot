# ozark-bot

ozark-bot is a **Discord moderation bot** with a **web dashboard**, **Game News RSS integration**, and **MongoDB persistence**, designed to be easy to deploy on platforms like **Railway**.

It focuses on:

- Reliable moderation (warn, mute, infractions, trust score)
- Anti-spam and basic automoderation
- A simple live dashboard (logs, health, game news)
- Being production-friendly (Mongo reconnect, graceful shutdown, maintenance tasks)

> ℹ️ Bot messages/logs can be used in PT or EN. The codebase uses English for config/logs, but it includes an i18n system (`t()` helper) you can adapt to your language.

---

## Features

### 🔧 Moderation

- Text commands:
  - `!warn` – issue warnings and track them in MongoDB
  - `!mute` / `!unmute` – timeouts using Discord timeouts
  - `!clear` – clear recent messages in a channel
  - `!userinfo` – show info about a user
  - `!help` – basic help by command
- Slash commands (per guild):
  - `/warn`, `/mute`, `/unmute`, `/clear`, `/userinfo`, `/help`
- **Infractions log**:
  - Stored in MongoDB (`Infraction` model)
  - Types: `WARN`, `MUTE`, `KICK`, `BAN`
  - Includes timestamps, moderator, reason, duration

### 🧠 Trust Score & AutoModeration

- Users have a **trust** and **warnings** counter in the `User` model.
- AutoModeration system can:
  - Detect bad content / repeated patterns
  - Apply **automatic warns/mutes**
  - Use trust score + dynamic thresholds (`getEffectiveMaxWarnings`, `getEffectiveMuteDuration`)
- Protection against **double punishment**:
  - If AutoMod already acted on a message, AntiSpam won’t punish again.

### 🚫 Anti-Spam System

- Tracks recent messages per user in memory.
- Detects:
  - Very similar messages (flood of duplicates)
  - Burst of messages in a short interval
- Applies:
  - First step: Anti-Spam Warn (Discord log + DB update)
  - Next step: short mute (Discord timeout) + infraction
- Integrates with trust configuration:
  - `getEffectiveMaxMessages` based on trust/warnings
- Uses a fuzzy similarity algorithm (Levenshtein-based) to avoid false positives.

### 📰 Game News Feeds

- Uses `rss-parser` to fetch RSS feeds from game news sources (e.g. GameSpot).
- Configurable via `config.gameNews`:
  - `enabled`
  - `interval` (polling interval)
  - `maxPerCycle` – max number of news per cycle per feed
- Sends rich embeds for new items:
  - Fallbacks for missing descriptions (snippet/title/link)
  - Skips old items beyond a max age

### 🖥️ Web Dashboard

- Built with **Express** + **Socket.IO**.
- Features:
  - Live **logs** feed (actions, infractions, events)
  - **Health endpoint** (`/health`) with:
    - Discord ready / Mongo connected / GameNews running
    - Uptime
    - Simple metrics:
      - `totalCommandsExecuted`
      - `totalInfractionsCreated`
      - `autoModActions`
      - `antiSpamActions`
  - Game news overview
- Dashboard API is protected by a **token**:
  - `DASHBOARD_TOKEN` env
  - Uses bearer token (`Authorization: Bearer <token>`) or `x-dashboard-token` header.

### ⚙️ Guild-specific configuration (Mongo)

- `GuildConfig` model for per-guild settings:
  - `guildId`
  - `logChannelId` (preferred logs channel ID)
  - `staffRoleIds` (server-specific staff roles)
- Dashboard API endpoints:
  - `GET /api/guilds/:guildId/config`
  - `POST /api/guilds/:guildId/config`
- Logger:
  - Tries `GuildConfig.logChannelId` first
  - Falls back to a channel name (`config.logChannelName`)

### 🧹 Maintenance & Reliability

- **Mongo connection**:
  - Automatic reconnect with exponential backoff
  - Status integration (Mongo status exposed to dashboard)
- **ErrorGuard**:
  - Handles `unhandledRejection`, `uncaughtException`, `warning`
  - Handles `SIGINT` / `SIGTERM` with a graceful shutdown:
    - Closes Mongo connection before exiting
- **Maintenance scheduler** (`maintenance.js`):
  - Periodic cleanup:
    - Deletes infractions older than `config.maintenance.pruneInfractionsOlderThanDays`
    - Deletes dashboard logs older than `config.maintenance.pruneDashboardLogsOlderThanDays`
  - Interval defined by `config.maintenance.intervalMs` (default 6h)

---

## Requirements

- **Node.js** `20.x`
- **MongoDB** (local or a service like MongoDB Atlas)
- A Discord application + bot token

---

## Environment Variables

These are typically loaded from `.env` using `dotenv`.

Required:

- `DISCORD_TOKEN` – your Discord bot token
- `MONGO_URI` – MongoDB connection string  
  (or `MONGODB_URI`, depending on your setup)
- `DASHBOARD_TOKEN` – token to access the dashboard API
- `PORT` – port for the dashboard (default usually `3000` if not set)

Optional / recommended:

- `NODE_ENV` – `development` or `production`

---

## Configuration

Main configuration is in:

```text
src/config/defaultConfig.js
