// src/slash/history.js

const Infraction = require('../database/models/Infraction');
const { t } = require('../systems/i18n');
const { isStaff } = require('./utils');
const { replyEphemeral, safeReply } = require('../utils/discord');

module.exports = async (client, interaction) => {
  try {
    if (!interaction?.guild) return;

    const member = interaction.member;
    const staff = await isStaff(member, 'moderation').catch(() => false);
    if (!staff) {
      return replyEphemeral(interaction, t('common.noPermission'));
    }

    const user = interaction.options?.getUser?.('user') || interaction.user;
    const limit = Math.max(1, Math.min(50, interaction.options?.getInteger?.('limit') || 5));

    const items = await Infraction.find({ guildId: interaction.guild.id, userId: user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (!items.length) {
      return replyEphemeral(interaction, `📚 Sem infrações registadas para ${user}.`);
    }

    const formatEntry = (it, idx) => {
      const when = it.createdAt ? new Date(it.createdAt).toISOString().slice(0, 10) : '—';
      const type = it.type || '—';
      const mod = it.moderatorId ? `<@${it.moderatorId}>` : '—';
      const reason = (it.reason || 'Sem motivo').slice(0, 120);
      const dur = it.duration ? ` • ${it.duration}ms` : '';
      return `${idx + 1}. **${type}**${dur} • ${when} • mod: ${mod}\n   ${reason}`;
    };

    // Discord messages cap at 2000 chars, so stop before overflowing.
    const MAX_BODY = 1900;
    const lines = [];
    let length = 0;
    let omitted = 0;
    for (let idx = 0; idx < items.length; idx += 1) {
      const entry = formatEntry(items[idx], idx);
      if (length + entry.length + 1 > MAX_BODY) {
        omitted = items.length - idx;
        break;
      }
      lines.push(entry);
      length += entry.length + 1;
    }

    const suffix = omitted > 0 ? `\n… (+${omitted} não mostrados)` : '';
    return replyEphemeral(
      interaction,
      `📚 Histórico de ${user} (últimas ${items.length}):\n\n${lines.join('\n')}${suffix}`
    );
  } catch (err) {
    console.error('[slash/history] Error:', err);
    try {
      await safeReply(interaction, { content: t('common.unexpectedError') }, { ephemeral: true });
    } catch {
      // ignore
    }
  }
};
