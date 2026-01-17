// src/events/interactionCreate.js

const config = require('../config/defaultConfig');

const warnSlash = require('../slash/warn');
const muteSlash = require('../slash/mute');
const userinfoSlash = require('../slash/userinfo');

module.exports = async (client, interaction) => {
  try {
    if (!config.slash?.enabled) return;

    if (!interaction?.isChatInputCommand?.()) return;

    if (interaction.commandName === 'warn') return warnSlash(client, interaction);
    if (interaction.commandName === 'mute') return muteSlash(client, interaction);
    if (interaction.commandName === 'userinfo') return userinfoSlash(client, interaction);
  } catch (err) {
    console.error('[interactionCreate] Error:', err);
    if (interaction?.deferred || interaction?.replied) {
      await interaction.followUp({ content: '❌ Error.', ephemeral: true }).catch(() => null);
    } else {
      await interaction.reply({ content: '❌ Error.', ephemeral: true }).catch(() => null);
    }
  }
};
