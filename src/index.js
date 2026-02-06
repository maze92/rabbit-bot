// src/index.js
//
// Main entry point: connects to Mongo, starts Discord client and dashboard,
// and orchestrates all "ready" logic in a single place.

require('dotenv').config();
require('./systems/errorGuard')();

const status = require('./systems/status');
const config = require('./config/defaultConfig');

const mongoose = require('./database/connect');
const client = require('./bot');

// Attach core event handlers
require('./events/messageCreate')(client);
require('./events/guildMemberAdd')(client);
require('./events/interactionCreate')(client);
require('./events/messageReactionAdd')(client);
require('./events/voiceStateUpdate.tempVoice')(client);

// Dashboard (Express + Socket.IO)
const dashboard = require('./dashboard');

// Allow dashboard to access the Discord client (for guild list, log tests, etc.)
if (typeof dashboard.setClient === 'function') {
  dashboard.setClient(client);
}

// Slash command registration
const registerSlashCommands = require('./slash/register');

// Maintenance & background systems
const { startMaintenance } = require('./systems/maintenance');
const startGameNews = require('./systems/gamenews');

// Ensure critical MongoDB indexes (autoIndex is disabled in production).
async function ensureMongoIndexes() {
  try {
    if (!mongoose || !mongoose.connection) return;
    if (mongoose.connection.readyState !== 1) return;

    // Require models lazily to avoid circular deps
    const models = [];
    const safeRequire = (p) => {
      try { return require(p); } catch (e) { return null; }
    };

    const Ticket = safeRequire('./database/models/Ticket');
    const TicketCounter = safeRequire('./database/models/TicketCounter');
    const TicketLog = safeRequire('./database/models/TicketLog');
    const Infraction = safeRequire('./database/models/Infraction');
    const DashboardLog = safeRequire('./database/models/DashboardLog');
    const DashboardAudit = safeRequire('./database/models/DashboardAudit');
    const User = safeRequire('./database/models/User');
    const GameNewsFeed = safeRequire('./database/models/GameNewsFeed');
    const GameNews = safeRequire('./database/models/GameNews');

    [Ticket, TicketCounter, TicketLog, Infraction, DashboardLog, DashboardAudit, User, GameNewsFeed, GameNews]
      .filter(Boolean)
      .forEach((m) => models.push(m));

    for (const m of models) {
      try {
        if (typeof m.ensureIndexes === 'function') {
          await m.ensureIndexes();
        }
      } catch (e) {
        console.warn(`[Mongo] Failed to ensure indexes for ${m?.modelName || 'unknown'}:`, e?.message || e);
      }
    }

    console.log('🧱 MongoDB indexes ensured.');
  } catch (err) {
    console.warn('[Mongo] ensureMongoIndexes error:', err?.message || err);
  }
}

// -----------------------------
// Mongo status wiring
// -----------------------------
if (mongoose && mongoose.connection) {
  const conn = mongoose.connection;

  // Initial state (in case we're already connected)
  status.setMongoConnected(conn.readyState === 1);
  if (conn.readyState === 1) {
    status.setMongoConnected(true);
    ensureMongoIndexes().catch(() => null);
  }

  conn.on('connected', () => {
    status.setMongoConnected(true);
    // Best-effort index creation after connect
    ensureMongoIndexes().catch(() => null);
  });

  conn.on('disconnected', () => {
    status.setMongoConnected(false);
  });

  conn.on('error', () => {
    status.setMongoConnected(false);
  });
}

// -----------------------------
// Orchestr// -----------------------------
// Orchestrated Discord "ready"
// -----------------------------

let startupDone = false;

async function handleClientReady() {
  if (startupDone) return;
  startupDone = true;

  try {
    status.setDiscordReady(true);
    console.log(`✅ Discord client logged in as ${client.user?.tag || client.user?.id || 'unknown user'}`);

    // Register slash commands (if enabled)
    try {
      await registerSlashCommands(client);
    } catch (err) {
      console.error('[Startup] Failed to register slash commands:', err);
    }

    // Start maintenance scheduler (infractions / dashboard logs cleanup)
    try {
      startMaintenance(config);
    } catch (err) {
      console.error('[Startup] Failed to start maintenance scheduler:', err);
    }

    // Start Game News system (delegates "enabled" check to the module itself)
    try {
      await startGameNews(client, config);
      console.log('📰 Game News system started.');
      status.setGameNewsRunning(true);
    } catch (err) {
      console.error('[Startup] Failed to start Game News system:', err);
      status.setGameNewsRunning(false);
    }

    // Basic presence as a fallback; can be refined later
    try {
      if (client.user) {
        await client.user.setPresence({
          activities: [{ name: 'moderating your server', type: 0 }],
          status: 'online',
        });
      }
    } catch (err) {
      console.error('[Startup] Failed to set presence:', err);
    }
  } catch (err) {
    console.error('[Startup] Unhandled error during ready orchestration:', err);
  }
}

// discord.js v14+ exposes the "clientReady" event name ("ready" is deprecated and
// emits a deprecation warning). Use clientReady to avoid noisy logs.
let readyEventName = 'clientReady';
try {
  const v = require('discord.js/package.json').version || '14.0.0';
  const major = parseInt(String(v).split('.')[0], 10);
  // For older majors (very unlikely in this repo), fall back to the legacy name.
  if (Number.isFinite(major) && major < 14) readyEventName = 'ready';
} catch (e) {
  // ignore
}
client.once(readyEventName, handleClientReady);

// Keep presence consistent on shard resume
client.on('shardResume', async () => {
  try {
    if (client.user) {
      await client.user.setPresence({
        activities: [{ name: 'moderating your server', type: 0 }],
        status: 'online',
      });
    }
  } catch (err) {
    console.error('[Startup] Failed to refresh presence on shardResume:', err);
  }
});

// -----------------------------
// Dashboard HTTP server
// -----------------------------

const portFromConfig = config.dashboard?.port;
const PORT = Number(process.env.PORT || portFromConfig || 8000);

dashboard.server.listen(PORT, () => {
  console.log(`🚀 Dashboard running on port ${PORT}`);
});

// -----------------------------
// Login
// -----------------------------

const token = process.env.TOKEN || process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ Missing Discord bot token. Set TOKEN or DISCORD_TOKEN in environment.');
  process.exit(1);
}

client
  .login(token)
  .then(() => {
    console.log('✅ Discord login successful.');
  })
  .catch((err) => {
    console.error('❌ Failed to login to Discord:', err);
    process.exit(1);
  });
