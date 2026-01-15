// src/events/messageCreate.js
// ============================================================
// messageCreate pipeline final:
// 1) Se for comando -> systems/commands.js
// 2) Se não for comando -> AutoMod
// 3) Depois -> AntiSpam (se enabled)
// ============================================================

const config = require('../config/defaultConfig');
const commandsHandler = require('../systems/commands');
const autoModeration = require('../systems/autoModeration');
const antiSpam = require('../systems/antiSpam');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    try {
      if (!message) return;
      if (!message.guild) return;
      if (!message.content) return;
      if (message.author?.bot) return;

      if (message.partial) {
        try { await message.fetch(); } catch { return; }
      }

      const prefix = config.prefix || '!';
      const isCommand = message.content.startsWith(prefix);

      // 1) comandos
      if (isCommand) {
        await commandsHandler(message, client);
        return;
      }

      // 2) automod
      await autoModeration(message, client);

      // 3) antispam
      await antiSpam(message, client);

    } catch (err) {
      console.error('[messageCreate] Critical error:', err);
    }
  });
};
