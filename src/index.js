// src/index.js

/**
 * v.1.0.0.1
 * ------------------------------------------------------------
 * Resumo:
 * - Entrypoint principal da aplicação
 * - Inicialização do bot, dashboard e sistemas
 * - Arranque controlado do GameNews após clientReady
 *
 * Notas:
 * - Requer variáveis de ambiente (TOKEN, MONGO_URI)
 * ------------------------------------------------------------
 */

require('dotenv').config();
require('./systems/errorGuard')();
require('./database/connect');

const client = require('./bot');
const dashboard = require('./dashboard');
const config = require('./config/defaultConfig');

// módulo de estado para /health
const status = require('./systems/status');

// eventos (1 vez)
require('./events/ready')(client);
require('./events/messageCreate')(client);
require('./events/guildMemberAdd')(client);

// marca discordReady quando o cliente do Discord emite "ready"
client.once('clientReady', async () => {
  status.setDiscordReady(true);
});

// dashboard server (Railway precisa de porta aberta)
const PORT = process.env.PORT || 3000;
dashboard.server.listen(PORT, () => {
  console.log(`🚀 Dashboard running on port ${PORT}`);
});

// login
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

      // marca que o sistema de GameNews está ativo (Ponto 5)
      status.setGameNewsRunning(true);
    }
  } catch (err) {
    console.error('[GameNews] Failed to start:', err);
  }
});
