// src/systems/infractionsService.js
// ============================================================
// Service para registar infrações no MongoDB
// - Centraliza criação (WARN/MUTE/KICK/BAN)
// - Evita confusões de nomes (infraction vs infractions)
// - Resolve o problema de case-sensitive no Railway/Linux
// ============================================================

const Infraction = require('../database/models/Infraction');

/**
 * Cria uma infração no MongoDB.
 *
 * @param {Object} params
 * @param {Guild} params.guild - Guild onde aconteceu
 * @param {User} params.user - Utilizador afetado
 * @param {User} params.moderator - Quem aplicou (pode ser o bot)
 * @param {'WARN'|'MUTE'|'KICK'|'BAN'} params.type - Tipo de infração
 * @param {string} [params.reason] - Motivo
 * @param {number|null} [params.duration] - Duração em ms (para MUTE)
 * @returns {Promise<Object|null>}
 */
async function create({ guild, user, moderator, type, reason, duration = null }) {
  if (!guild?.id) return null;
  if (!user?.id) return null;
  if (!moderator?.id) return null;
  if (!type) return null;

  const doc = await Infraction.create({
    guildId: guild.id,
    userId: user.id,
    moderatorId: moderator.id,
    type,
    reason: reason || 'No reason provided',
    duration: duration ?? null
  });

  return doc;
}

module.exports = {
  create
};
