// src/events/interactionCreate.js
//
// Central handler for all slash commands.

const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');
const logger = require('../systems/logger');
const { getGuildConfig } = require('../systems/guildConfigService');
const { isStaff } = require('../utils/staff');
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

      // Guild maintenance mode (per-guild, configured via dashboard)
      try {
        const guildId = interaction.guildId;
        if (guildId) {
          const guildCfg = await getGuildConfig(guildId);
          const mm = guildCfg && guildCfg.maintenanceMode ? guildCfg.maintenanceMode : null;
          if (mm && mm.enabled === true) {
            const allowStaff = mm.allowStaff !== false;
            const ok = allowStaff ? await isStaff(interaction.member) : false;
            if (!ok) {
              const msg = (typeof mm.message === 'string' && mm.message.trim())
                ? mm.message.trim()
                : 'O bot está em modo de manutenção. Tenta novamente mais tarde.';
              await safeReply(interaction, { content: msg }, { ephemeral: true });
              return;
            }
          }
        }
      } catch (mmErr) {
        // If anything fails, do not block the command.
      }

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
