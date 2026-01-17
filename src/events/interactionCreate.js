// src/events/interactionCreate.js

const config = require('../config/defaultConfig');

const warnSlash = require('../slash/warn');
const muteSlash = require('../slash/mute');
const userinfoSlash = require('../slash/userinfo');

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (!config.slash?.enabled) return;
      if (!interaction?.isChatInputCommand?.()) return;

      const name = interaction.commandName;

      if (name === 'warn') {
        return warnSlash(client, interaction);
      }

      if (name === 'mute') {
        return muteSlash(client, interaction);
      }

      if (name === 'userinfo') {
        return userinfoSlash(client, interaction);
      }
    } catch (err) {
      console.error('[interactionCreate] Error:', err);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            content: '❌ Error handling this command.',
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content: '❌ Error handling this command.',
            ephemeral: true
          });
        }
      } catch {
        // ignore
      }
    }
  });
};
