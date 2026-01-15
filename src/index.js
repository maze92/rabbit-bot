// src/index.js
// ============================================================
// Entrypoint principal
// - errorGuard
// - DB
// - client
// - dashboard (porta aberta -> Railway fica Running)
// - eventos
// - gamenews no clientReady
// ============================================================

require('dotenv').config();
require('./systems/errorGuard')();
require('./database/connect');

const client = require('./bot');
const dashboard = require('./dashboard');
const config = require('./config/defaultConfig');

// Eventos (1x)
require('./events/ready')(client);
require('./events/messageCreate')(client);
require('./events/guildMemberAdd')(client);

// Dashboard server
const PORT = process.env.PORT || 3000;
dashboard.server.listen(PORT, () => {
  console.log(`🚀 Dashboard running on port ${PORT}`);
});

// Login
if (!process.env.TOKEN) {
  console.error('❌ Missing TOKEN in environment');
  process.exit(1);
}

client.login(process.env.TOKEN).catch(err => {
  console.error('❌ Discord login failed:', err);
});

// GameNews após clientReady
let gameNewsStarted = false;
client.once('clientReady', async () => {
  try {
    if (gameNewsStarted) return;
    gameNewsStarted = true;

    if (config.gameNews?.enabled) {
      const gameNews = require('./systems/gamenews');
      await gameNews(client, config);
      console.log('📰 Game News system started.');
    }
  } catch (err) {
    console.error('[GameNews] Failed to start:', err);
  }
});
