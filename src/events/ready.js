let started = false;

module.exports = (client) => {
  client.once('clientReady', async () => { // <- mudado de 'ready' para 'clientReady'
    console.log(`✅ ${client.user.tag} is online!`);

    if (started) return;
    started = true;

    // ==============================
    // Sistema de notícias automáticas (opcional)
    // ==============================
    try {
      const config = require('../config/defaultConfig');
      if (config.gameNews?.enabled) {
        const gameNews = require('../systems/gamenews');
        gameNews(client, config);
        console.log('📰 Game News system started.');
      }
    } catch (err) {
      console.error('[ready] Error starting Game News system:', err);
    }
  });
};
