// src/events/interactionCreate.js

const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');

const warnSlash = require('../slash/warn');
const muteSlash = require('../slash/mute');
const unmuteSlash = require('../slash/unmute');
const clearSlash = require('../slash/clear');
const userinfoSlash = require('../slash/userinfo');
const ticketSlash = require('../slash/ticket');
const helpSlash = require('../slash/help');

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (!config.slash?.enabled) return;
      if (!interaction?.isChatInputCommand?.()) return;

      const name = interaction.commandName;

      if (name === 'warn') return warnSlash(client, interaction);
      if (name === 'mute') return muteSlash(client, interaction);
      if (name === 'unmute') return unmuteSlash(client, interaction);
      if (name === 'clear') return clearSlash(client, interaction);
      if (name === 'userinfo') return userinfoSlash(client, interaction);
      if (name === 'ticket') return ticketSlash(client, interaction);
      if (name === 'help') return helpSlash(client, interaction);
    } catch (err) {
      console.error('[interactionCreate] Error:', err);
      try {
        const payload = { content: t('common.unexpectedError'), flags: 64 }; // 64 = Ephemeral
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
        else await interaction.reply(payload);
      } catch {
        // ignore
      }
    }
  });
};
