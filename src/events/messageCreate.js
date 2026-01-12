const autoModeration = require('../systems/autoModeration');
const commands = require('../systems/commands');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    // ==============================
    // Ignorar bots e mensagens fora de guilda
    // ==============================
    if (!message.guild || message.author.bot) return;

    try {
      // ==============================
      // 1️⃣ Primeiro: AutoMod
      // ==============================
      await autoModeration(message, client);

      // ==============================
      // 2️⃣ Depois: Comandos
      // ==============================
      await commands(message, client);

    } catch (err) {
      console.error(`[messageCreate] Error handling message from ${message.author.tag}:`, err);
    }
  });
};
