const autoModeration = require('../systems/autoModeration');
const commands = require('../systems/commands');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    // Ignorar mensagens de bots ou DMs
    if (!message.guild || message.author.bot) return;

    // 1️⃣ Primeiro, automod
    await autoModeration(message);

    // 2️⃣ Depois, comandos
    await commands(message, client);
  });
};
