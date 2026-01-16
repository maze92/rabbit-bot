// src/events/messageCreate.js

const config = require('../config/defaultConfig');
const commandsHandler = require('../systems/commands');
const autoModeration = require('../systems/autoModeration');
const antiSpam = require('../systems/antiSpam');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    try {
      if (!message) return;

      if (message.partial) {
        try {
          await message.fetch();
        } catch {
          return;
        }
      }

      if (!message.guild) return;
      if (!message.author || message.author.bot) return;
      if (!message.content) return;

      const prefix = config.prefix || '!';
      const isCommand = message.content.startsWith(prefix);

      await antiSpam(message, client);
      await autoModeration(message, client);

      if (!isCommand) return;

      await commandsHandler(message, client);
    } catch (err) {
      console.error('[messageCreate] Critical error:', err);
    }
  });
};
