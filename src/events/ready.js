let started = false;

module.exports = (client) => {
  client.once('clientReady', async () => {
    console.log(`${client.user.tag} is online!`);

    if (started) return;
    started = true;

    const gameNews = require('../systems/gamenews');
    const config = require('../config/defaultConfig');

    // Iniciar sistema de notícias automáticas
    gameNews(client, config);
  });
};
