// src/systems/warningsService.js

const User = require('../database/models/User');
const { getTrustConfig } = require('../utils/trust');

const DAY_MS = 24 * 60 * 60 * 1000;

function clampTrust(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function getOrCreateUser(guildId, userId) {
  let u = await User.findOne({ guildId, userId });

  if (!u) {
    const trustCfg = getTrustConfig();

    u = await User.create({
      guildId,
      userId,
      warnings: 0,
      trust: trustCfg.base,
      lastInfractionAt: null,
      lastTrustUpdateAt: new Date()
    });
  }

  const trustCfg = getTrustConfig();

  if (!Number.isFinite(u.trust)) u.trust = trustCfg.base;
  if (!u.lastTrustUpdateAt) u.lastTrustUpdateAt = new Date();

  const now = new Date();
  const before = u.trust;
  applyTrustRegen(u, trustCfg, now);
  if (u.trust !== before) {
    await u.save().catch(() => null);
  }

  return u;
}

function applyTrustRegen(u, trustCfg, now) {
  if (!trustCfg.enabled) return;

  const last =
    u.lastInfractionAt ||
    u.lastTrustUpdateAt ||
    u.createdAt ||
    now;

  const diffMs = now.getTime() - last.getTime();
  if (diffMs < DAY_MS) return;

  let days = Math.floor(diffMs / DAY_MS);
  if (days > trustCfg.regenMaxDays) {
    days = trustCfg.regenMaxDays;
  }

  const bonus = days * trustCfg.regenPerDay;
  if (bonus <= 0) return;

  u.trust = clampTrust(
    u.trust + bonus,
    trustCfg.min,
    trustCfg.max
  );

  u.lastTrustUpdateAt = now;
}

function applyTrustPenalty(u, trustCfg, type, now) {
  if (!trustCfg.enabled) return;

  let penalty = 0;
  if (type === 'WARN') penalty = trustCfg.warnPenalty;
  if (type === 'MUTE') penalty = trustCfg.mutePenalty;

  if (penalty > 0) {
    u.trust = clampTrust(
      u.trust - penalty,
      trustCfg.min,
      trustCfg.max
    );
  }

  u.lastInfractionAt = now;
  u.lastTrustUpdateAt = now;
}

async function addWarning(guildId, userId, amount = 1) {
  const trustCfg = getTrustConfig();
  const now = new Date();

  const u = await getOrCreateUser(guildId, userId);

  applyTrustRegen(u, trustCfg, now);

  u.warnings = (u.warnings || 0) + amount;

  applyTrustPenalty(u, trustCfg, 'WARN', now);

  await u.save();
  return u;
}

async function applyMutePenalty(guildId, userId) {
  const trustCfg = getTrustConfig();
  const now = new Date();

  const u = await getOrCreateUser(guildId, userId);

  applyTrustRegen(u, trustCfg, now);

  applyTrustPenalty(u, trustCfg, 'MUTE', now);

  await u.save();
  return u;
}

async function resetUser(guildId, userId, baseTrust, reason) {
  const trustCfg = getTrustConfig();
  const u = await getOrCreateUser(guildId, userId);

  u.warnings = 0;

  const minTrust = typeof trustCfg.minTrust === 'number' ? trustCfg.minTrust : -100;
  const maxTrust = typeof trustCfg.maxTrust === 'number' ? trustCfg.maxTrust : 100;
  const nextTrust =
    typeof baseTrust === 'number'
      ? baseTrust
      : (typeof trustCfg.base === 'number' ? trustCfg.base : 0);

  u.trust = clampTrust(nextTrust, minTrust, maxTrust);

  await u.save();
  return u;
}

async function resetWarnings(guildId, userId) {
  const u = await getOrCreateUser(guildId, userId);
  u.warnings = 0;
  await u.save();
  return u;
}

async function removeInfractionEffects(guildId, userId, type) {
  const trustCfg = getTrustConfig();
  const u = await getOrCreateUser(guildId, userId);

  if (type === 'WARN') {
    const currentWarnings = typeof u.warnings === 'number' ? u.warnings : 0;
    u.warnings = currentWarnings > 0 ? currentWarnings - 1 : 0;

    if (trustCfg.enabled && typeof trustCfg.warnPenalty === 'number') {
      u.trust = clampTrust(
        u.trust + trustCfg.warnPenalty,
        trustCfg.min,
        trustCfg.max
      );
    }
  }

  if (type === 'MUTE') {
    if (trustCfg.enabled && typeof trustCfg.mutePenalty === 'number') {
      u.trust = clampTrust(
        u.trust + trustCfg.mutePenalty,
        trustCfg.min,
        trustCfg.max
      );
    }
  }

  await u.save();
  return u;
}

module.exports = {
  getOrCreateUser,
  addWarning,
  resetWarnings,
  applyMutePenalty,
  resetUser,
  removeInfractionEffects
};
