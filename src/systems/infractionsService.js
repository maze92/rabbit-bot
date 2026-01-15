// src/systems/infractionsService.js
// ============================================================
// Service para registar infrações no MongoDB
// - Centraliza criação (WARN/MUTE/KICK/BAN)
// ============================================================

const Infraction = require('../database/models/Infraction');

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

module.exports = { create };
