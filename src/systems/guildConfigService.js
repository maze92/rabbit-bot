// src/systems/guildConfigService.js

const GuildConfig = require('../database/models/GuildConfig');

const CACHE_TTL_MS = 60 * 1000; // 1 minute

const _cache = new Map();

async function getGuildConfig(guildId) {
  if (!guildId) return null;

  const now = Date.now();
  const cached = _cache.get(guildId);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const doc = await GuildConfig.findOne({ guildId }).lean().catch(() => null);
  const value = doc || null;

  _cache.set(guildId, { at: now, value });
  return value;
}

module.exports = { getGuildConfig };
