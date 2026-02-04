// src/events/interactionCreate.js
//
// Central handler for all slash commands.

const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');
const logger = require('../systems/logger');
const { safeReply } = require('../utils/discord');

const warnSlash = require('../slash/warn');
const muteSlash = require('../slash/mute');
const unmuteSlash = require('../slash/unmute');
const clearSlash = require('../slash/clear');
const userinfoSlash = require('../slash/userinfo');
const historySlash = require('../slash/history');
const helpSlash = require('../slash/help');

// Simple command registry instead of a long if/else chain
const commandHandlers = new Map([
  ['warn', warnSlash],
  ['mute', muteSlash],
  ['unmute', unmuteSlash],
  ['clear', clearSlash],
  ['userinfo', userinfoSlash],
  ['history', historySlash],
  ['help', helpSlash],
]);

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
          .map((opt) => {
            const v = opt.value;
            return `${opt.name}=${typeof v === 'string' ? v : (v ?? '')}`;
          })
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

      const handler = commandHandlers.get(name);
      if (!handler) return;

      return handler(client, interaction);
    } catch (err) {
      console.error('[interactionCreate] Error:', err);
      try {
        await safeReply(
          interaction,
          { content: t('common.unexpectedError') },
          { ephemeral: true }
        );
      } catch {
        // ignore
      }
    }
  });
};
