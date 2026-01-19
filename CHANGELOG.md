
---

## 3️⃣ `CHANGELOG.md`

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.1.0] - 2026-01-19

### Added

- **Maintenance scheduler**:
  - Periodic cleanup of old infractions (default: older than 180 days).
  - Periodic cleanup of old dashboard logs (default: older than 60 days).
  - Interval configurable via `config.maintenance.intervalMs` (default: 6h).

- **Simple usage metrics** in `status.js`:
  - `totalCommandsExecuted`
  - `totalInfractionsCreated`
  - `autoModActions`
  - `antiSpamActions`
  - Exposed via the `/health` dashboard endpoint.

- **GuildConfig model**:
  - Stores per-guild configuration:
    - `guildId`
    - `logChannelId`
    - `staffRoleIds`
  - New dashboard API endpoints:
    - `GET /api/guilds/:guildId/config`
    - `POST /api/guilds/:guildId/config`

- **Dashboard actor support**:
  - New helper `getActorFromRequest(req)` reads:
    - `actor` field from request body, or
    - `x-dashboard-actor` header.
  - Dashboard moderation routes `/api/mod/warn`, `/api/mod/mute`, `/api/mod/unmute`:
    - Include the actor in log descriptions:
      - `Executor (dashboard): **<actor>**`
    - Append the actor to the infraction reason:
      - e.g. `Spam (dashboard: Maze)`.

- **Logger integration with GuildConfig**:
  - Logger now attempts to use `GuildConfig.logChannelId` as the preferred log channel.
  - Falls back to `config.logChannelName` when no guild-specific channel is configured.

### Changed

- **Dashboard CORS behaviour**:
  - Added support for explicitly configured allowed origins:
    - `config.dashboard.allowedOrigins`
    - (Previously: only environment variable based).
  - In production configuration, `allowedOrigins` is set to:
    - `['https://ozark-bot-production.up.railway.app']`
  - Removed generic “no CORS origins configured” warnings once an origin is set.

- **Status module**:
  - Extended the status payload to include usage metrics.
  - `/health` now returns a `metrics` object along with `ok`, `discordReady`, `mongoConnected` and `uptimeSeconds`.

### Fixed

- **Circular dependency warning** between `logger.js` and `dashboard.js`:
  - Introduced `dashboardBridge.js` to decouple logger from dashboard.
  - Logger now emits events via the bridge instead of requiring `dashboard` directly.
  - Dashboard registers its `sendToDashboard` function into the bridge at startup.

- **Mongoose index warning** in `GuildConfig`:
  - Removed redundant manual index on `guildId` and rely on `unique: true` in the schema field.

---

## [1.0.2] - 2026-01-17

### Added

- Game news system using RSS (`rss-parser`):
  - Periodic fetch of configured feeds.
  - Embeds sent to configured Discord channels.
  - Basic duplicate/age filtering.

- Web dashboard:
  - Express-based backend with Socket.IO.
  - Basic logs view and health check.
  - Token-based authentication using `DASHBOARD_TOKEN`.

- Anti-spam system:
  - Tracks recent messages per user.
  - Warns/mutes on repeated spam patterns.

- Auto-moderation:
  - Integrates with trust and warnings.
  - Applies automatic actions for repeated violations.

### Changed

- Refactored MongoDB connection logic into `src/database/connect.js`.
- Improved error handling with `ErrorGuard` (process-level handlers).

### Fixed

- Various minor bugs and inconsistencies in commands and event handlers.

---

## [1.0.0] - Initial Release

- Basic Discord bot skeleton.
- Core moderation commands (`warn`, `mute`, `unmute`, `clear`, `userinfo`, `help`).
- Simple logging to a fixed channel name.
- MongoDB integration for users and infractions.
