// src/systems/featuresService.js
//
// Leitura normalizada das funcionalidades opcionais (GuildConfig.features).
// Um único ponto de verdade para os defaults usados pelo bot e pela dashboard.

const { getGuildConfig } = require('./guildConfigService');

const FEATURE_DEFAULTS = {
  messageLogs: { enabled: false, channelId: null, ignoreBots: true },
  reactionRoles: { enabled: false, channelId: null, messageId: null, entries: [] },
  autoKick: { enabled: false, infractionsToKick: 5 },
  levels: { enabled: false, xpMin: 15, xpMax: 25, cooldownSeconds: 60, announceChannelId: null },
  starboard: { enabled: false, channelId: null, threshold: 3, emoji: '⭐' },
  polls: { enabled: false },
  verification: { enabled: false, roleId: null, channelId: null, messageId: null, kickAfterMinutes: 0 },
  welcome: {
    enabled: false,
    channelId: null,
    message: 'Bem-vindo(a) {user} ao {server}! Já somos {memberCount} membros.',
    embed: true,
    color: '#7c3aed',
    bannerUrl: null
  },
  goodbye: {
    enabled: false,
    channelId: null,
    message: '{user} saiu do servidor.',
    embed: true,
    color: '#ef4444',
    bannerUrl: null
  },
  serverStats: {
    enabled: false,
    memberChannelId: null,
    joinsChannelId: null,
    leavesChannelId: null,
    memberTemplate: '👥 Membros: {count}',
    joinsTemplate: '📥 Entradas (7d): {count}',
    leavesTemplate: '📤 Saídas (7d): {count}'
  }
};

function normalizeFeature(name, raw) {
  const def = FEATURE_DEFAULTS[name] || {};
  const out = { ...def };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(def)) {
      if (raw[key] !== undefined && raw[key] !== null) out[key] = raw[key];
    }
  }
  return out;
}

function normalizeFeatures(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const name of Object.keys(FEATURE_DEFAULTS)) {
    out[name] = normalizeFeature(name, src[name]);
  }
  return out;
}

async function getFeatures(guildId) {
  const cfg = await getGuildConfig(guildId);
  return normalizeFeatures(cfg && cfg.features);
}

async function getFeature(guildId, name) {
  const cfg = await getGuildConfig(guildId);
  const raw = cfg && cfg.features ? cfg.features[name] : null;
  return normalizeFeature(name, raw);
}

module.exports = {
  FEATURE_DEFAULTS,
  normalizeFeature,
  normalizeFeatures,
  getFeatures,
  getFeature
};
