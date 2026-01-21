// src/commands/history.js

const Infraction = require('../database/models/Infraction');
const { t } = require('../systems/i18n');
const { isStaff } = require('../utils/staff');

function parseUserId(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^<@!?(\d{16,20})>$/);
  if (m) return m[1];
  const id = String(raw).match(/^(\d{16,20})$/);
  return id ? id[1] : null;
}

module.exports = {
  name: 'history',
  description: 'Mostra o histórico de infrações de um utilizador (staff).',

  async execute(message, args = []) {
    try {
      if (!message?.guild) return;

      const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
      if (!member) return message.reply(t('commands.couldNotVerifyRoles')).catch(() => null);
      const staff = await isStaff(member).catch(() => false);
      if (!staff) return message.reply(t('common.noPermission')).catch(() => null);

      const targetId = parseUserId(args[0]) || message.author.id;
      const limitRaw = args[1] || '5';
      const limit = Math.max(1, Math.min(15, Number(limitRaw) || 5));

      const items = await Infraction.find({ guildId: message.guild.id, userId: targetId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      if (!items.length) {
        return message.reply(`📚 Sem infrações registadas para <@${targetId}>.`).catch(() => null);
      }

      const lines = items.map((it, idx) => {
        const when = it.createdAt ? new Date(it.createdAt).toISOString().slice(0, 10) : '—';
        const type = it.type || '—';
        const mod = it.moderatorId ? `<@${it.moderatorId}>` : '—';
        const reason = (it.reason || 'Sem motivo').slice(0, 120);
        const dur = it.duration ? ` • ${it.duration}ms` : '';
        return `${idx + 1}. **${type}**${dur} • ${when} • mod: ${mod}\n   ${reason}`;
      });

      return message.reply(`📚 Histórico de <@${targetId}> (últimas ${items.length}):\n\n${lines.join('\n')}`).catch(() => null);
    } catch (err) {
      console.error('[history] Error:', err);
      return message.reply(t('common.unexpectedError') || 'Erro inesperado.').catch(() => null);
    }
  }
};
