// src/index.js

require('dotenv').config();
require('./systems/errorGuard')();

const status = require('./systems/status');
const { startMaintenance } = require('./systems/maintenance');

// Liga ao Mongo e atualiza status conforme o resultado (sem crashar o bot)
try {
  const mongoose = require('./database/connect');

  if (mongoose?.connection) {
    const conn = mongoose.connection;

    // Se já estiver ligado no momento do require
    status.setMongoConnected(conn.readyState === 1);

    conn.on('connected', () => status.setMongoConnected(true));
    conn.on('disconnected', () => status.setMongoConnected(false));
    conn.on('error', () => status.setMongoConnected(false));
  }
} catch {
  status.setMongoConnected(false);
}

const client = require('./bot');
const dashboard = require('./dashboard');
const config = require('./config/defaultConfig');


// Allow dashboard to perform safe actions via API
dashboard.setClient?.(client);

require('./events/ready')(client);
require('./events/messageCreate')(client);
require('./events/guildMemberAdd')(client);
require('./events/interactionCreate')(client);

client.once('clientReady', async () => {
  status.setDiscordReady(true);
});

const registerSlashCommands = require('./slash/register');

client.once('clientReady', async () => {
  try {
    const slashCfg = config.slash || {};
    if (slashCfg.enabled === false) return;
    if (slashCfg.registerOnStartup === false) return;
    await registerSlashCommands(client);
  } catch (err) {
    console.error('[Slash] Failed to register slash commands:', err);
  }
});

// Dashboard server (Railway precisa de porta aberta)
const PORT = process.env.PORT || 3000;
dashboard.server.listen(PORT, () => {
  console.log(`🚀 Dashboard running on port ${PORT}`);
});

// Login
if (!process.env.TOKEN) {
  console.error('❌ Missing TOKEN in environment');
  process.exit(1);
}

client.login(process.env.TOKEN).catch((err) => {
  console.error('❌ Discord login failed:', err);
});

// GameNews após bot pronto
let gameNewsStarted = false;
client.once('clientReady', async () => {
  try {
    if (gameNewsStarted) return;
    gameNewsStarted = true;

    if (config.gameNews?.enabled) {
      const gameNews = require('./systems/gamenews');
      await gameNews(client, config);
      console.log('📰 Game News system started.');
      status.setGameNewsRunning(true);
    } else {
      status.setGameNewsRunning(false);
    }
  } catch (err) {
    console.error('[GameNews] Failed to start:', err);
    status.setGameNewsRunning(false);
  }
});
