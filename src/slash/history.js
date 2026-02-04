// src/slash/history.js

const Infraction = require('../database/models/Infraction');
const { t } = require('../systems/i18n');
const { isStaff } = require('./utils');
const { replyEphemeral, safeReply } = require('../utils/discord');

module.exports = async (client, interaction) => {
  try {
    if (!interaction?.guild) return;

    const member = interaction.member;
    const staff = await isStaff(member).catch(() => false);
    if (!staff) {
      return replyEphemeral(interaction, t('common.noPermission'));
    }

    const user = interaction.options?.getUser?.('user') || interaction.user;
    const limit = Math.max(1, Math.min(15, interaction.options?.getInteger?.('limit') || 5));

    const items = await Infraction.find({ guildId: interaction.guild.id, userId: user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (!items.length) {
      return replyEphemeral(interaction, `📚 Sem infrações registadas para ${user}.`);
    }

    const lines = items.map((it, idx) => {
      const when = it.createdAt ? new Date(it.createdAt).toISOString().slice(0, 10) : '—';
      const type = it.type || '—';
      const mod = it.moderatorId ? `<@${it.moderatorId}>` : '—';
      const reason = (it.reason || 'Sem motivo').slice(0, 120);
      const dur = it.duration ? ` • ${it.duration}ms` : '';
      return `${idx + 1}. **${type}**${dur} • ${when} • mod: ${mod}\n   ${reason}`;
    });

    return replyEphemeral(
      interaction,
      `📚 Histórico de ${user} (últimas ${items.length}):\n\n${lines.join('\n')}`
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
