# Changelog

All notable changes to **Ozark Bot** will be documented in this file.

The project is being restructured as if starting fresh from **v1.0.0**, focusing on stability, trust‑based moderation and a clean dashboard.

---

## [1.0.0] – Initial stable dashboard & trust rewrite

### Core

- Reorganized project structure (`src/` for bot, dashboard and systems).
- Updated to **discord.js v14** and **Node.js 20.x**.
- Added a central **error guard** to log uncaught exceptions and unhandled rejections.
- Introduced a robust **config** layer (`defaultConfig.js`) with sensible defaults.

### Trust & infractions

- Implemented **User** model with:
  - `trust`
  - `warnings`
  - timestamps for infractions and trust updates.
- Implemented **Infraction** model with:
  - `WARN` and `MUTE` types only (no KICK/BAN).
  - Case IDs, reasons, durations and sources.
- Added **warningsService**:
  - Handles warnings, trust penalties and regeneration logic.
  - Provides `resetUser` to reset trust/warnings (for false positives).
- Added **automation** module:
  - Listens to new infractions and applies **auto‑mute** based on:
    - Number of WARN infractions.
    - Trust score and configured escalation.
  - Creates corresponding `MUTE` infractions and logs them.

### Dashboard

- Rebuilt the **Express** dashboard with:
  - Authentication via a single `DASHBOARD_TOKEN`.
  - Health endpoint with Discord and MongoDB status.
- **Overview** page:
  - Shows key stats for the last 24h, including infractions.
- **Users** page:
  - Lists guild members (with rate‑limit friendly fetching).
  - Hides internal/system roles (e.g. specific role IDs).
  - Shows per‑user panel with:
    - Trust score and **colored badge** (low / medium / high).
    - Clear indication of the **next estimated auto‑mute** (warns remaining + minutes).
    - Recent infractions and tickets.
  - Quick actions:
    - `Warn`
    - `Unmute`
    - `Reset trust/warnings`
- All strings used in the dashboard are **localized** (PT/EN).

### Tickets

- Replaced legacy `/ticket` and `/ticketclose` flows with:
  - A single support message in a configurable **Ticket channel**.
  - Reaction‑based creation of **threads** (ticket‑001, ticket‑002, ...).
  - Per‑thread embed with a **close** button available to participants.
- Removed old ticket code paths and dashboard tab in favor of the new flow.
- Added ticket logs to the dashboard, grouped with other moderation logs.

### GameNews

- Simplified **GameNews** module:
  - Per‑guild feed activation (only active feeds post).
  - Limit on number of news items per interval (anti‑spam).
  - Clean embed/message formatting in target channels.

### AutoMod

- Improved AutoMod for banned words:
  - Normalizes content (accents, links, emojis, punctuation).
  - Detects obfuscated banned words using simple replacements.
- When triggered:
  - Adds a **WARN** infraction with a **generic reason** (e.g. “Linguagem imprópria”).
  - Applies trust penalties and, when thresholds are met, auto‑mutes.
- **No more DMs** are sent to the user for AutoMod warns/mutes:
  - All communication is done via channel messages and logs.

### UX and safety

- Prevents moderation actions against members with equal or higher roles than the bot.
- Hides specific internal roles from the users list in the dashboard.
- Avoids exposing exact banned words or message content in reasons, keeping them generic.
- Added clear error handling and toasts for failed dashboard actions.

---

[1.0.0]: https://github.com/maze92/ozark-bot/releases/tag/v1.0.0
