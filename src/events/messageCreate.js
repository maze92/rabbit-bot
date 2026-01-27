// src/events/messageCreate.js

const config = require('../config/defaultConfig');
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

      // A partir daqui: apenas moderação automática (AutoMod + AntiSpam).
      // Toda a moderação manual é feita via comandos slash (/warn, /mute, ...).
      if (config?.autoModeration?.enabled !== false) {
        await autoModeration(message, client);
      }

      if (config?.antiSpam?.enabled !== false) {
        await antiSpam(message, client);
      }
    } catch (err) {
      console.error('[messageCreate] Critical error:', err);
    }
  });
};

