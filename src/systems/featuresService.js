// src/systems/featuresService.js
//
// Leitura normalizada das funcionalidades opcionais (GuildConfig.features).
// Um único ponto de verdade para os defaults usados pelo bot e pela dashboard.

const { getGuildConfig } = require('./guildConfigService');
const messages = require('../config/messages');

const FEATURE_DEFAULTS = {
  messageLogs: { enabled: false, channelId: null, ignoreBots: true },
  reactionRoles: { enabled: false, channelId: null, messageId: null, entries: [] },
  autoKick: { enabled: false, infractionsToKick: 5 },
  levels: { enabled: false, xpMin: 15, xpMax: 25, cooldownSeconds: 60, announceChannelId: null },
  starboard: { enabled: false, channelId: null, threshold: 3, emoji: '⭐' },
  polls: { enabled: false },
  verification: {
    enabled: false,
    roleId: null,
    channelId: null,
    messageId: null,
    kickAfterMinutes: 0,
    title: null,
    description: null,
    buttonLabel: null
  },
  tickets: {
    enabled: false,
    channelId: null,
    messageId: null,
    openEmoji: '🎫',
    closeEmoji: '🔒',
    panelTitle: null,
    panelDescription: null,
    alreadyOpenMessage: null,
    welcomeMessage: null,
    closeMessage: null
  },
  welcome: {
    enabled: false,
    channelId: null,
    message: null,
    embed: true,
    color: '#7c3aed',
    bannerUrl: null
  },
  goodbye: {
    enabled: false,
    channelId: null,
    message: null,
    embed: true,
    color: '#ef4444',
    bannerUrl: null
  },
  serverStats: {
    enabled: false,
    memberChannelId: null,
    joinsChannelId: null,
    leavesChannelId: null,
    memberTemplate: null,
    joinsTemplate: null,
    leavesTemplate: null
  }
};

const DYNAMIC_TEXT_DEFAULTS = {
  verification: {
    title: [messages.en.verify.panelTitle, messages.pt.verify.panelTitle],
    description: [messages.en.verify.panelDescription, messages.pt.verify.panelDescription],
    buttonLabel: [messages.en.verify.button, messages.pt.verify.button]
  },
  tickets: {
    panelTitle: [messages.en.tickets.panelTitle, messages.pt.tickets.panelTitle],
    panelDescription: [messages.en.tickets.panelDescription, messages.pt.tickets.panelDescription],
    alreadyOpenMessage: [messages.en.tickets.alreadyOpen, messages.pt.tickets.alreadyOpen],
    welcomeMessage: [
      messages.en.tickets.welcomeDescription({ user: '{user}', closeEmoji: '{closeEmoji}' }),
      messages.pt.tickets.welcomeDescription({ user: '{user}', closeEmoji: '{closeEmoji}' })
    ],
    closeMessage: [
      messages.en.tickets.closedBy.replace('{user}', '{user}'),
      messages.pt.tickets.closedBy.replace('{user}', '{user}')
    ]
  },
  welcome: {
    message: [messages.en.featureDefaults.welcome.message, messages.pt.featureDefaults.welcome.message]
  },
  goodbye: {
    message: [messages.en.featureDefaults.goodbye.message, messages.pt.featureDefaults.goodbye.message]
  },
  serverStats: {
    memberTemplate: [messages.en.featureDefaults.serverStats.memberTemplate, messages.pt.featureDefaults.serverStats.memberTemplate],
    joinsTemplate: [messages.en.featureDefaults.serverStats.joinsTemplate, messages.pt.featureDefaults.serverStats.joinsTemplate],
    leavesTemplate: [messages.en.featureDefaults.serverStats.leavesTemplate, messages.pt.featureDefaults.serverStats.leavesTemplate]
  }
};

function normalizeLegacyDynamicText(name, field, value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const defaults = DYNAMIC_TEXT_DEFAULTS[name] && DYNAMIC_TEXT_DEFAULTS[name][field];
  if (!Array.isArray(defaults) || !defaults.length) return value;

  return defaults.includes(trimmed) ? null : value;
}

function normalizeFeature(name, raw) {
  const def = FEATURE_DEFAULTS[name] || {};
  const out = { ...def };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(def)) {
      if (raw[key] !== undefined && raw[key] !== null) {
        out[key] = normalizeLegacyDynamicText(name, key, raw[key]);
      }
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
  const out = normalizeFeature(name, raw);
  if (name === 'tickets' && !out.channelId && cfg && cfg.ticketThreadChannelId) {
    out.channelId = cfg.ticketThreadChannelId;
    if (!raw) out.enabled = true;
  }
  return out;
}

module.exports = {
  FEATURE_DEFAULTS,
  normalizeFeature,
  normalizeFeatures,
  getFeatures,
  getFeature
};
