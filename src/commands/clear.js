// src/commands/clear.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');
const logger = require('../systems/logger');
const { t } = require('../systems/i18n');

function parseAmount(raw) {
  const n = parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 100) return null;
  return n;
}

module.exports = {
  name: 'clear',
  description: 'Clear messages in the channel',

  async execute(message, args, client) {
    try {
      if (!message?.guild) return;
      if (!message.channel) return;

      const guild = message.guild;
      const botMember = guild.members.me;
      if (!botMember) return;

      const perms = message.channel.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.ManageMessages)) {
        return message
          .reply('❌ I do not have permission to manage messages in this channel.')
          .catch(() => null);
      }

      const amount = parseAmount(args?.[0]);
      if (!amount) {
        const prefix = config.prefix || '!';
        return message
          .reply(t('common.usage', null, `${prefix}clear <1-100>`))
          .catch(() => null);
      }

      // Tentamos apagar também a mensagem do comando (amount + 1)
      const toDelete = Math.min(100, amount + 1);

      let deleted = null;
      try {
        deleted = await message.channel.bulkDelete(toDelete, true);
      } catch (err) {
        console.error('[clear] bulkDelete error:', err);
        deleted = null;
      }

      if (!deleted) {
        return message
          .reply(
            '⚠️ I could not delete messages. They may be too old (14+ days) or I lack permissions.'
          )
          .catch(() => null);
      }

      // deleted inclui (provavelmente) a mensagem do comando — ajusta para o feedback
      const deletedCountRaw = deleted.size || 0;
      const removedCommandMsg = deleted.has(message.id) ? 1 : 0;
      const deletedCount = Math.max(0, deletedCountRaw - removedCommandMsg);

      const feedback = await message.channel
        .send(`🧹 Cleared **${deletedCount}** messages.`)
        .catch(() => null);

      if (feedback) {
        setTimeout(() => {
          feedback.delete().catch(() => null);
        }, 5000).unref?.();
      }

      await logger(
        client,
        'Clear Messages',
        null,
        message.author,
        `Cleared **${deletedCount}** messages in <#${message.channel.id}> (channelId: \`${message.channel.id}\`)`,
        guild
      );
    } catch (err) {
      console.error('[clear] Error:', err);
      message
        .reply(t('common.unexpectedError'))
        .catch(() => null);
    }
  }
};
