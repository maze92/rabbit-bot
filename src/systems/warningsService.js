// src/systems/warningsService.js
// ============================================================
// Service de warnings
// - Centraliza get/create do User
// - addWarning / resetWarnings
// - Evita duplicação entre AutoMod e comandos !warn
// ============================================================

const User = require('../database/models/User');

async function getOrCreateUser(guildId, userId) {
  let u = await User.findOne({ guildId, userId });
  if (!u) {
    u = await User.create({
      guildId,
      userId,
      warnings: 0,
      trust: 30
    });
  }
  return u;
}

async function addWarning(guildId, userId, amount = 1) {
  const u = await getOrCreateUser(guildId, userId);
  u.warnings = (u.warnings || 0) + amount;
  await u.save();
  return u;
}

async function resetWarnings(guildId, userId) {
  const u = await getOrCreateUser(guildId, userId);
  u.warnings = 0;
  await u.save();
  return u;
}

module.exports = {
  getOrCreateUser,
  addWarning,
  resetWarnings
};
