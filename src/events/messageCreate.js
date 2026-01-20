// src/events/messageCreate.js

const config = require('../config/defaultConfig');
const commandsHandler = require('../systems/commands');
const autoModeration = require('../systems/autoModeration');
const antiSpam = require('../systems/antiSpam');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    try {
      if (!message) return;

      // Garantir que a mensagem está completa (caso seja partial)
      if (message.partial) {
        try {
          await message.fetch();
        } catch {
          return;
        }
      }

      // Ignorar DMs, bots e mensagens sem autor
      if (!message.guild) return;
      if (!message.author || message.author.bot) return;

      const content = message.content;
      if (!content || typeof content !== 'string') return;

      const prefix = config.prefix || '!';
      const isCommand = content.startsWith(prefix);

      // 1) Comandos primeiro (sem passar por AutoMod/AntiSpam)
      if (isCommand) {
        await commandsHandler(message, client);
        return;
      }

      // 2) Mensagens normais → AutoMod + AntiSpam
      await autoModeration(message, client);
      await antiSpam(message, client);
    } catch (err) {
      console.error('[messageCreate] Critical error:', err);
    }
  });
};
