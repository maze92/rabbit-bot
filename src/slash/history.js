// src/slash/history.js

const Infraction = require('../database/models/Infraction');
const { t } = require('../systems/i18n');
const { isStaff } = require('../utils/staff');

module.exports = async (client, interaction) => {
  try {
    if (!interaction?.guild) return;

    const member = interaction.member;
    const staff = await isStaff(member).catch(() => false);
    if (!staff) {
      return interaction.reply({ content: t('common.noPermission'), flags: 64 }).catch(() => null);
    }

    const user = interaction.options?.getUser?.('user') || interaction.user;
    const limit = Math.max(1, Math.min(15, interaction.options?.getInteger?.('limit') || 5));

    const items = await Infraction.find({ guildId: interaction.guild.id, userId: user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (!items.length) {
      return interaction.reply({ content: `📚 Sem infrações registadas para ${user}.`, flags: 64 }).catch(() => null);
    }

    const lines = items.map((it, idx) => {
      const when = it.createdAt ? new Date(it.createdAt).toISOString().slice(0, 10) : '—';
      const type = it.type || '—';
      const mod = it.moderatorId ? `<@${it.moderatorId}>` : '—';
      const reason = (it.reason || 'Sem motivo').slice(0, 120);
      const dur = it.duration ? ` • ${it.duration}ms` : '';
      return `${idx + 1}. **${type}**${dur} • ${when} • mod: ${mod}\n   ${reason}`;
    });

    return interaction.reply({
      content: `📚 Histórico de ${user} (últimas ${items.length}):\n\n${lines.join('\n')}`,
      flags: 64
    }).catch(() => null);
  } catch (err) {
    console.error('[slash/history] Error:', err);
    try {
      const payload = { content: t('common.unexpectedError'), flags: 64 };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else await interaction.reply(payload);
    } catch {
      // ignore
    }
  }
};
