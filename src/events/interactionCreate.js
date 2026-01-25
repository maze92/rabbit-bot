// src/events/interactionCreate.js

const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');
const logger = require('../systems/logger');

const warnSlash = require('../slash/warn');
const muteSlash = require('../slash/mute');
const unmuteSlash = require('../slash/unmute');
const clearSlash = require('../slash/clear');
const userinfoSlash = require('../slash/userinfo');
const historySlash = require('../slash/history');
const helpSlash = require('../slash/help');

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (!config.slash?.enabled) return;
      if (!interaction?.isChatInputCommand?.()) return;

      const name = interaction.commandName;

      // Log all slash commands to the moderation log + dashboard
      try {
        const user = interaction.user;
        const guild = interaction.guild;
        const rawOptions = (interaction.options && interaction.options.data) || [];
        const optStr = rawOptions
          .map((opt) => `${opt.name}=${typeof opt.value === 'string' ? opt.value : (opt.value ?? '')}`)
          .join(', ');

        const desc = optStr ? `Options: ${optStr}` : '';

        logger(
          client,
          `Slash command: /${name}`,
          user,
          client.user,
          desc,
          guild
        );
      } catch (logErr) {
        console.warn('[interactionCreate] Failed to log slash command:', logErr);
      }

      if (name === 'warn') return warnSlash(client, interaction);
      if (name === 'mute') return muteSlash(client, interaction);
      if (name === 'unmute') return unmuteSlash(client, interaction);
      if (name === 'clear') return clearSlash(client, interaction);
      if (name === 'userinfo') return userinfoSlash(client, interaction);
      if (name === 'history') return historySlash(client, interaction);
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