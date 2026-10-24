// src/systems/featuresService.js
//
// Leitura normalizada das funcionalidades opcionais (GuildConfig.features).
// Um único ponto de verdade para os defaults usados pelo bot e pela dashboard.

const { getGuildConfig } = require("./guildConfigService");
const messages = require("../config/messages");

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }
  return Object.freeze(value);
}

const autoModerationFeatureDefaults = {
  enabled: false,
  maxWarnings: 3,
  muteDurationMinutes: 10,
  bannedWordsPt: "",
  bannedWordsEn: "",
  bypassRoleIds: [],
  bypassChannelIds: [],
};
const antiSpamFeatureDefaults = {
  enabled: false,
  intervalSeconds: 10,
  maxMessages: 5,
  muteDurationMinutes: 5,
  actionCooldownSeconds: 120,
  softActionsEnabled: true,
  strikeWindowSeconds: 600,
  strikesToMute: 2,
  minLength: 6,
  similarityThreshold: 0.85,
  ignoreAttachments: true,
  bypassAdmins: true,
  sendMessage: true,
};

const FEATURE_DEFAULTS = deepFreeze({
  autoModeration: autoModerationFeatureDefaults,
  antiSpam: antiSpamFeatureDefaults,
  messageLogs: { enabled: false, channelId: null, ignoreBots: true },
  reactionRoles: {
    enabled: false,
    channelId: null,
    messageId: null,
    entries: [],
  },
  autoKick: { enabled: false, infractionsToKick: 5 },
  levels: {
    enabled: false,
    xpMin: 15,
    xpMax: 25,
    cooldownSeconds: 60,
    announceChannelId: null,
  },
  starboard: { enabled: false, channelId: null, threshold: 3, emoji: "⭐" },
  polls: { enabled: false },
  verification: {
    enabled: false,
    roleId: null,
    channelId: null,
    messageId: null,
    kickAfterMinutes: 0,
    title: null,
    description: null,
    buttonLabel: null,
  },
  tickets: {
    enabled: false,
    channelId: null,
    messageId: null,
    openEmoji: "🎫",
    closeEmoji: "🔒",
    panelTitle: null,
    panelDescription: null,
    alreadyOpenMessage: null,
    welcomeMessage: null,
    closeMessage: null,
  },
  welcome: {
    enabled: false,
    channelId: null,
    message: null,
    embed: true,
    color: "#7c3aed",
    bannerUrl: null,
  },
  goodbye: {
    enabled: false,
    channelId: null,
    message: null,
    embed: true,
    color: "#ef4444",
    bannerUrl: null,
  },
  serverStats: {
    enabled: false,
    showMembers: true,
    showJoins: true,
    showLeaves: true,
    categoryId: null,
    memberChannelId: null,
    joinsChannelId: null,
    leavesChannelId: null,
    memberTemplate: null,
    joinsTemplate: null,
    leavesTemplate: null,
  },
  memes: {
    enabled: false,
    channelId: null,
    intervalMinutes: 60,
  },
  twitch: {
    enabled: false,
    streamerName: null,
    channelId: null,
    roleId: null,
  },
});

const FEATURE_DIAGNOSTICS = deepFreeze({
  autoModeration: {
    guildPermissions: ["ModerateMembers"],
    validateConfig: (value) =>
      value.enabled === true &&
      !String(value.bannedWordsPt || "").trim() &&
      !String(value.bannedWordsEn || "").trim()
        ? [
            {
              code: "missing_automod_rules",
              details: { field: "bannedWordsEn" },
            },
          ]
        : [],
  },
  antiSpam: { guildPermissions: ["ModerateMembers"] },
  messageLogs: {
    requiredFields: ["channelId"],
    channelField: "channelId",
    channelPermissions: ["ViewChannel", "SendMessages", "EmbedLinks"],
  },
  reactionRoles: {
    requiredFields: ["channelId", "messageId", "entries"],
    channelField: "channelId",
    messageField: "messageId",
    channelPermissions: [
      "ViewChannel",
      "SendMessages",
      "EmbedLinks",
      "AddReactions",
      "ReadMessageHistory",
    ],
    guildPermissions: ["ManageRoles"],
    roleHierarchy: true,
  },
  autoKick: {
    requiredFields: ["infractionsToKick"],
    guildPermissions: ["KickMembers"],
  },
  levels: {
    requiredFields: ["announceChannelId"],
    channelField: "announceChannelId",
    channelPermissions: ["ViewChannel", "SendMessages", "EmbedLinks"],
  },
  starboard: {
    requiredFields: ["channelId"],
    channelField: "channelId",
    channelPermissions: [
      "ViewChannel",
      "SendMessages",
      "EmbedLinks",
      "ReadMessageHistory",
    ],
  },
  polls: {},
  verification: {
    requiredFields: ["channelId", "roleId"],
    channelField: "channelId",
    channelPermissions: [
      "ViewChannel",
      "SendMessages",
      "EmbedLinks",
      "ReadMessageHistory",
    ],
    guildPermissions: ["ManageRoles"],
    roleHierarchy: true,
  },
  tickets: {
    requiredFields: ["channelId"],
    channelField: "channelId",
    channelPermissions: [
      "ViewChannel",
      "SendMessages",
      "CreatePrivateThreads",
      "ManageThreads",
      "SendMessagesInThreads",
      "AddReactions",
      "ReadMessageHistory",
    ],
  },
  welcome: {
    requiredFields: ["channelId"],
    channelField: "channelId",
    channelPermissions: ["ViewChannel", "SendMessages"],
  },
  goodbye: {
    requiredFields: ["channelId"],
    channelField: "channelId",
    channelPermissions: ["ViewChannel", "SendMessages"],
  },
  serverStats: {
    guildPermissions: ["ManageChannels"],
    validateConfig: (value) =>
      value.showMembers !== true &&
      value.showJoins !== true &&
      value.showLeaves !== true
        ? [{ code: "missing_stats_metric" }]
        : [],
  },
  memes: {
    requiredFields: ["channelId", "intervalMinutes"],
    channelField: "channelId",
    channelPermissions: ["ViewChannel", "SendMessages", "EmbedLinks"],
  },
  twitch: {
    requiredFields: ["streamerName", "channelId"],
    channelField: "channelId",
    channelPermissions: ["ViewChannel", "SendMessages", "EmbedLinks"],
    validateConfig: () =>
      !process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET
        ? [{ code: "missing_twitch_credentials" }]
        : [],
  },
});

const FEATURE_DIAGNOSTIC_FIELD_ISSUES = deepFreeze({
  channelId: "missing_channel",
  announceChannelId: "missing_announce_channel",
  roleId: "missing_role",
  messageId: "missing_message",
  entries: "missing_entries",
  streamerName: "missing_streamer",
  intervalMinutes: "missing_configuration",
  infractionsToKick: "missing_configuration",
});

const DYNAMIC_TEXT_DEFAULTS = {
  verification: {
    title: [messages.en.verify.panelTitle, messages.pt.verify.panelTitle],
    description: [
      messages.en.verify.panelDescription,
      messages.pt.verify.panelDescription,
    ],
    buttonLabel: [messages.en.verify.button, messages.pt.verify.button],
  },
  tickets: {
    panelTitle: [
      messages.en.tickets.panelTitle,
      messages.pt.tickets.panelTitle,
    ],
    panelDescription: [
      messages.en.tickets.panelDescription,
      messages.pt.tickets.panelDescription,
    ],
    alreadyOpenMessage: [
      messages.en.tickets.alreadyOpen,
      messages.pt.tickets.alreadyOpen,
    ],
    welcomeMessage: [
      messages.en.tickets.welcomeDescription({
        user: "{user}",
        closeEmoji: "{closeEmoji}",
      }),
      messages.pt.tickets.welcomeDescription({
        user: "{user}",
        closeEmoji: "{closeEmoji}",
      }),
    ],
    closeMessage: [
      messages.en.tickets.closedBy.replace("{user}", "{user}"),
      messages.pt.tickets.closedBy.replace("{user}", "{user}"),
    ],
  },
  welcome: {
    message: [
      messages.en.featureDefaults.welcome.message,
      messages.pt.featureDefaults.welcome.message,
    ],
  },
  goodbye: {
    message: [
      messages.en.featureDefaults.goodbye.message,
      messages.pt.featureDefaults.goodbye.message,
    ],
  },
  serverStats: {
    memberTemplate: [
      messages.en.featureDefaults.serverStats.memberTemplate,
      messages.pt.featureDefaults.serverStats.memberTemplate,
    ],
    joinsTemplate: [
      messages.en.featureDefaults.serverStats.joinsTemplate,
      messages.pt.featureDefaults.serverStats.joinsTemplate,
    ],
    leavesTemplate: [
      messages.en.featureDefaults.serverStats.leavesTemplate,
      messages.pt.featureDefaults.serverStats.leavesTemplate,
    ],
  },
};

const LEGACY_DYNAMIC_TEXT_DEFAULTS = {
  tickets: {
    panelTitle: ["Support", "Suporte"],
    panelDescription: [
      "React with {emoji} below to open a private support ticket.",
      "Reage com {emoji} abaixo para abrir um ticket privado de suporte.",
      [
        "If you need help with the server, have moderation questions, or want to report an issue, you can open a support ticket.",
        "",
        "👉 How to open a ticket:",
        "React to this message with {emoji};",
        "A private thread will be created with you and the support team;",
        "Explain the situation with as much detail as possible to speed up the reply.",
        "",
        "⏱️ Requests are handled in arrival order. Thank you for your patience.",
        "Use this channel only for support-related requests.",
      ].join("\n"),
      [
        "Se precisares de ajuda com o servidor, tiveres dúvidas sobre moderação ou quiseres reportar um problema, podes abrir um ticket de suporte.",
        "",
        "👉 Como abrir um ticket:",
        "Reage a esta mensagem com {emoji};",
        "Será criada uma thread privada contigo e com a equipa de suporte;",
        "Explica a situação com o máximo de detalhe possível para acelerar a resposta.",
        "",
        "⏱️ Os pedidos são tratados por ordem de chegada. Agradecemos a tua compreensão.",
        "Utiliza este canal apenas para pedidos relacionados com suporte.",
      ].join("\n"),
    ],
  },
};

function normalizeLegacyDynamicText(name, field, value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const defaults =
    DYNAMIC_TEXT_DEFAULTS[name] && DYNAMIC_TEXT_DEFAULTS[name][field];
  const legacyDefaults =
    LEGACY_DYNAMIC_TEXT_DEFAULTS[name] &&
    LEGACY_DYNAMIC_TEXT_DEFAULTS[name][field];
  const acceptedDefaults = []
    .concat(Array.isArray(defaults) ? defaults : [])
    .concat(Array.isArray(legacyDefaults) ? legacyDefaults : []);
  if (!acceptedDefaults.length) return value;

  return acceptedDefaults.includes(trimmed) ? null : value;
}

function cloneFeatureValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value.toObject === "function") {
    return cloneFeatureValue(value.toObject());
  }
  if (Array.isArray(value)) return Array.from(value, cloneFeatureValue);

  const out = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    out[key] = cloneFeatureValue(nestedValue);
  }
  return out;
}

function normalizeFeature(name, raw) {
  const def = FEATURE_DEFAULTS[name] || {};
  const out = structuredClone(def);
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(def)) {
      if (raw[key] !== undefined && raw[key] !== null) {
        out[key] = cloneFeatureValue(
          normalizeLegacyDynamicText(name, key, raw[key]),
        );
      }
    }
  }
  return out;
}

function normalizeFeatures(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
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
  FEATURE_DIAGNOSTICS,
  FEATURE_DIAGNOSTIC_FIELD_ISSUES,
  normalizeFeature,
  normalizeFeatures,
  getFeatures,
  getFeature,
};
