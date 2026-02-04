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

// -----------------------------
// Mongo status wiring
// -----------------------------
if (mongoose && mongoose.connection) {
  const conn = mongoose.connection;

  // Initial state (in case we're already connected)
  status.setMongoConnected(conn.readyState === 1);
  if (conn.readyState === 1) {
    status.setMongoConnected(true);
  }

  conn.on('connected', () => {
    status.setMongoConnected(true);
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

// Support both legacy 'ready' and the newer 'clientReady' events.
// The startup guard ensures this only runs once.
client.once('ready', handleClientReady);
client.once('clientReady', handleClientReady);

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
const PORT = Number(process.env.PORT || portFromConfig || 3000);

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
