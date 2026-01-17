// src/systems/infractionsService.js

const Infraction = require('../database/models/Infraction');

async function create({ guild, user, moderator, type, reason, duration = null }) {
  if (!guild?.id) return null;
  if (!user?.id) return null;
  if (!moderator?.id) return null;
  if (!type) return null;

  return Infraction.create({
    guildId: guild.id,
    userId: user.id,
    moderatorId: moderator.id,
    type,
    reason: reason || 'No reason provided',
    duration: duration ?? null
  });
}

/**
 * Devolve as infrações mais recentes de um utilizador no servidor.
 * Útil para comandos tipo !history e para auditoria rápida.
 */
async function getRecentInfractions(guildId, userId, limit = 10) {
  if (!guildId || !userId) return [];

  const lim = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

  return Infraction.find({ guildId, userId })
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();
}

/**
 * Contagem rápida de infrações por tipo (ex: WARN/MUTE) para o utilizador.
 * Opcional mas útil para dashboards e resumos.
 */
async function countInfractionsByType(guildId, userId) {
  if (!guildId || !userId) return {};

  const rows = await Infraction.aggregate([
    { $match: { guildId, userId } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);

  const out = {};
  for (const r of rows) {
    if (r?._id) out[r._id] = r.count || 0;
  }
  return out;
}

module.exports = {
  create,
  getRecentInfractions,
  countInfractionsByType
};
