// src/dashboard/routes/features.js
//
// Rotas da tab "Funcionalidades": leitura e escrita de GuildConfig.features.
// Cada funcionalidade é guardada individualmente (um cartão por funcionalidade),
// o que evita que a dashboard tenha de enviar o objeto inteiro.

const { invalidateGuildConfig } = require("../../systems/guildConfigService");
const {
  FEATURE_DEFAULTS,
  FEATURE_DIAGNOSTICS,
  FEATURE_DIAGNOSTIC_FIELD_ISSUES,
  normalizeFeature,
  normalizeFeatures,
} = require("../../systems/featuresService");
const { getFeatureText, applyTemplate } = require("../../systems/featureText");
const { getGuildLang } = require("../../systems/i18n");
const { isGuildChannel } = require("../../utils/guildChannel");
const { PermissionsBitField } = require("discord.js");

const FEATURE_NAMES = Object.keys(FEATURE_DEFAULTS);

function hasLegacyFeatureConfig(name, value) {
  if (!value || typeof value !== "object") return false;
  if (value.enabled === true) return true;
  const defaults = FEATURE_DEFAULTS[name] || {};
  return Object.keys(defaults).some((field) => {
    if (
      field === "enabled" ||
      value[field] === null ||
      value[field] === undefined
    )
      return false;
    return JSON.stringify(value[field]) !== JSON.stringify(defaults[field]);
  });
}

function isEmptyFeatureValue(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

async function diagnoseFeature({ client, guild, feature, config }) {
  const issues = [];
  const addIssue = (code, details = {}) => issues.push({ code, ...details });
  const value = config || {};
  const diagnostics = FEATURE_DIAGNOSTICS[feature] || {};

  for (const field of diagnostics.requiredFields || []) {
    if (isEmptyFeatureValue(value[field])) {
      addIssue(
        FEATURE_DIAGNOSTIC_FIELD_ISSUES[field] || "missing_configuration",
        {
          field,
        },
      );
    }
  }
  for (const issue of diagnostics.validateConfig?.(value) || []) {
    addIssue(issue.code, issue.details);
  }

  let member = guild.members && guild.members.me;
  const needsGuildPermissions = [...(diagnostics.guildPermissions || [])];
  if (feature === "verification" && Number(value.kickAfterMinutes) > 0) {
    needsGuildPermissions.push("KickMembers");
  }
  const needsRoleHierarchy = diagnostics.roleHierarchy === true;
  const channelField = diagnostics.channelField;
  const channelId = channelField ? value[channelField] : null;
  const shouldInspectMember =
    needsGuildPermissions.length > 0 ||
    needsRoleHierarchy ||
    (channelId && diagnostics.channelPermissions);

  if (
    shouldInspectMember &&
    !member &&
    guild.members &&
    guild.members.fetchMe
  ) {
    member = await guild.members.fetchMe().catch(() => null);
  }

  if (shouldInspectMember && !member) {
    addIssue("bot_member_unavailable");
  } else if (member) {
    for (const permissionName of needsGuildPermissions) {
      const flag = PermissionsBitField.Flags[permissionName];
      if (flag && !member.permissions.has(flag)) {
        addIssue("permission_missing", { permission: permissionName });
      }
    }
  }

  if (feature === "twitch" && value.roleId) {
    const role = guild.roles.cache.get(value.roleId);
    if (!role) addIssue("role_unavailable", { field: "roleId" });
  }

  const roleIds =
    feature === "reactionRoles"
      ? Array.isArray(value.entries)
        ? value.entries.map((entry) => entry && entry.roleId).filter(Boolean)
        : []
      : feature === "verification" && value.roleId
        ? [value.roleId]
        : [];
  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      addIssue("role_unavailable", { field: "roleId" });
      continue;
    }
    if (member && !role.editable) {
      addIssue("role_not_manageable", { field: "roleId" });
      break;
    }
  }

  let inspectedChannel = null;
  if (channelId && diagnostics.channelPermissions) {
    inspectedChannel = await client.channels.fetch(channelId).catch(() => null);
    if (!inspectedChannel || inspectedChannel.guildId !== guild.id) {
      addIssue("channel_unavailable", { field: channelField });
    } else if (member) {
      const channelPermissions = inspectedChannel.permissionsFor(member);
      if (!channelPermissions) {
        addIssue("channel_permissions_unavailable", { field: channelField });
      } else {
        const requiredChannelPermissions = [...diagnostics.channelPermissions];
        if (
          (feature === "welcome" || feature === "goodbye") &&
          value.embed === true
        ) {
          requiredChannelPermissions.push("EmbedLinks");
        }
        for (const permissionName of requiredChannelPermissions) {
          const flag = PermissionsBitField.Flags[permissionName];
          if (flag && !channelPermissions.has(flag)) {
            addIssue("permission_missing", {
              field: channelField,
              permission: permissionName,
            });
          }
        }
      }
    }
  }
  if (
    inspectedChannel &&
    diagnostics.messageField &&
    value[diagnostics.messageField]
  ) {
    const messages = inspectedChannel.messages;
    const message =
      messages && typeof messages.fetch === "function"
        ? await messages
            .fetch(value[diagnostics.messageField])
            .catch(() => null)
        : null;
    if (!message) {
      addIssue("message_unavailable", { field: diagnostics.messageField });
    }
  }

  const hasPermissionIssue = issues.some((issue) =>
    [
      "permission_missing",
      "role_unavailable",
      "role_not_manageable",
      "channel_unavailable",
      "channel_permissions_unavailable",
      "bot_member_unavailable",
      "missing_twitch_credentials",
    ].includes(issue.code),
  );
  const hasConfigIssue = issues.some(
    (issue) =>
      issue.code.startsWith("missing_") || issue.code === "message_unavailable",
  );
  const status =
    value.enabled !== true
      ? "disabled"
      : hasPermissionIssue
        ? "blocked"
        : hasConfigIssue
          ? "incomplete"
          : "ready";

  return { feature, status, issues, checkedAt: new Date().toISOString() };
}

function toBool(v, fallback = false) {
  if (v === null || v === undefined) return fallback;
  return v === true || v === "true" || v === 1 || v === "1";
}

function toInt(v, fallback, min, max) {
  if (typeof v !== "number" && typeof v !== "string") return fallback;
  if (typeof v === "string" && !v.trim()) {
    return fallback;
  }
  const n = Number(v);
  if (!Number.isInteger(n)) return fallback;
  if (typeof min === "number" && n < min) return min;
  if (typeof max === "number" && n > max) return max;
  return n;
}

function clampOptionalText(v, max) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

function normalizeWordList(value, fallback) {
  const source =
    typeof value === "string"
      ? value
      : typeof fallback === "string"
        ? fallback
        : "";
  const seen = new Set();
  return source
    .split(/\r?\n/)
    .map((word) => word.trim().slice(0, 64))
    .filter((word) => {
      const normalized = word.toLocaleLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 100)
    .join("\n");
}

// Cor no formato #rrggbb; devolve o fallback se inválida.
function normalizeColor(v, fallback) {
  const s = typeof v === "string" ? v.trim() : "";
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
}

function formatPanelDate(lang, now) {
  try {
    return new Intl.DateTimeFormat(lang === "pt" ? "pt-PT" : "en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now || new Date());
  } catch {
    return "";
  }
}

// URL http(s) opcional (usada no banner das mensagens).
function urlOrNull(v, max) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > max) return null;
  try {
    const url = new URL(s);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Normaliza o valor recebido da dashboard para o formato persistido.
 * Devolve sempre um objeto com apenas as chaves conhecidas da feature.
 */
function cleanFeatureValue(name, raw, sanitizeId) {
  const src = raw && typeof raw === "object" ? raw : {};
  const id = (v) => {
    const s = sanitizeId(String(v === null || v === undefined ? "" : v));
    return s || null;
  };
  const idList = (value) =>
    Array.isArray(value)
      ? Array.from(new Set(value.map(id).filter(Boolean))).slice(0, 100)
      : [];

  switch (name) {
    case "autoModeration": {
      const defaults = FEATURE_DEFAULTS.autoModeration;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        maxWarnings: toInt(src.maxWarnings, defaults.maxWarnings, 1, 10),
        muteDurationMinutes: toInt(
          src.muteDurationMinutes,
          defaults.muteDurationMinutes,
          1,
          1440,
        ),
        bannedWordsPt: normalizeWordList(
          src.bannedWordsPt,
          defaults.bannedWordsPt,
        ),
        bannedWordsEn: normalizeWordList(
          src.bannedWordsEn,
          defaults.bannedWordsEn,
        ),
        bypassRoleIds: idList(src.bypassRoleIds),
        bypassChannelIds: idList(src.bypassChannelIds),
      };
    }

    case "antiSpam": {
      const defaults = FEATURE_DEFAULTS.antiSpam;
      const rawSimilarity =
        src.similarityThreshold === null ||
        src.similarityThreshold === undefined ||
        src.similarityThreshold === ""
          ? NaN
          : Number(src.similarityThreshold);
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        intervalSeconds: toInt(
          src.intervalSeconds,
          defaults.intervalSeconds,
          1,
          120,
        ),
        maxMessages: toInt(src.maxMessages, defaults.maxMessages, 2, 30),
        muteDurationMinutes: toInt(
          src.muteDurationMinutes,
          defaults.muteDurationMinutes,
          1,
          1440,
        ),
        actionCooldownSeconds: toInt(
          src.actionCooldownSeconds,
          defaults.actionCooldownSeconds,
          0,
          3600,
        ),
        softActionsEnabled: toBool(
          src.softActionsEnabled,
          defaults.softActionsEnabled,
        ),
        strikeWindowSeconds: toInt(
          src.strikeWindowSeconds,
          defaults.strikeWindowSeconds,
          1,
          3600,
        ),
        strikesToMute: toInt(src.strikesToMute, defaults.strikesToMute, 1, 10),
        minLength: toInt(src.minLength, defaults.minLength, 0, 100),
        similarityThreshold: Number.isFinite(rawSimilarity)
          ? Math.min(1, Math.max(0.5, rawSimilarity))
          : defaults.similarityThreshold,
        ignoreAttachments: toBool(
          src.ignoreAttachments,
          defaults.ignoreAttachments,
        ),
        bypassAdmins: toBool(src.bypassAdmins, defaults.bypassAdmins),
        sendMessage: toBool(src.sendMessage, defaults.sendMessage),
      };
    }

    case "messageLogs": {
      const defaults = FEATURE_DEFAULTS.messageLogs;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        channelId: id(src.channelId),
        ignoreBots: toBool(src.ignoreBots, defaults.ignoreBots),
      };
    }

    case "reactionRoles": {
      const defaults = FEATURE_DEFAULTS.reactionRoles;
      const entries = Array.isArray(src.entries)
        ? src.entries
        : defaults.entries;
      const cleaned = [];
      for (const e of entries) {
        if (!e || typeof e !== "object") continue;
        const emoji =
          typeof e.emoji === "string" ? e.emoji.trim().slice(0, 64) : "";
        const roleId = id(e.roleId);
        if (!emoji || !roleId) continue;
        cleaned.push({ emoji, roleId });
        if (cleaned.length >= 20) break;
      }
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        channelId: id(src.channelId),
        messageId: id(src.messageId),
        entries: cleaned,
      };
    }

    case "autoKick": {
      const defaults = FEATURE_DEFAULTS.autoKick;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        infractionsToKick: toInt(
          src.infractionsToKick,
          defaults.infractionsToKick,
          1,
          100,
        ),
      };
    }

    case "levels": {
      const defaults = FEATURE_DEFAULTS.levels;
      const xpMin = toInt(src.xpMin, defaults.xpMin, 1, 1000);
      const xpMax = Math.max(xpMin, toInt(src.xpMax, defaults.xpMax, 1, 1000));
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        xpMin,
        xpMax,
        cooldownSeconds: toInt(
          src.cooldownSeconds,
          defaults.cooldownSeconds,
          0,
          86400,
        ),
        announceChannelId: id(src.announceChannelId),
      };
    }

    case "starboard": {
      const defaults = FEATURE_DEFAULTS.starboard;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        channelId: id(src.channelId),
        threshold: toInt(src.threshold, defaults.threshold, 1, 100),
        emoji:
          typeof src.emoji === "string" && src.emoji.trim()
            ? src.emoji.trim().slice(0, 64)
            : defaults.emoji,
      };
    }

    case "polls": {
      const defaults = FEATURE_DEFAULTS.polls;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
      };
    }

    case "verification": {
      const defaults = FEATURE_DEFAULTS.verification;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        roleId: id(src.roleId),
        channelId: id(src.channelId),
        messageId: id(src.messageId),
        kickAfterMinutes: toInt(
          src.kickAfterMinutes,
          defaults.kickAfterMinutes,
          0,
          10080,
        ),
        title: clampOptionalText(src.title, 120),
        description: clampOptionalText(src.description, 500),
        buttonLabel: clampOptionalText(src.buttonLabel, 80),
      };
    }

    case "tickets": {
      const defaults = FEATURE_DEFAULTS.tickets;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        channelId: id(src.channelId),
        messageId: id(src.messageId),
        openEmoji:
          typeof src.openEmoji === "string" && src.openEmoji.trim()
            ? src.openEmoji.trim().slice(0, 64)
            : defaults.openEmoji,
        closeEmoji:
          typeof src.closeEmoji === "string" && src.closeEmoji.trim()
            ? src.closeEmoji.trim().slice(0, 64)
            : defaults.closeEmoji,
        panelTitle: clampOptionalText(src.panelTitle, 120),
        panelDescription: clampOptionalText(src.panelDescription, 500),
        alreadyOpenMessage: clampOptionalText(src.alreadyOpenMessage, 300),
        welcomeMessage: clampOptionalText(src.welcomeMessage, 1200),
        closeMessage: clampOptionalText(src.closeMessage, 300),
      };
    }

    case "welcome": {
      const defaults = FEATURE_DEFAULTS.welcome;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        channelId: id(src.channelId),
        message: clampOptionalText(src.message, 500),
        embed: toBool(src.embed, defaults.embed),
        color: normalizeColor(src.color, defaults.color),
        bannerUrl: urlOrNull(src.bannerUrl, 512),
      };
    }

    case "goodbye": {
      const defaults = FEATURE_DEFAULTS.goodbye;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        channelId: id(src.channelId),
        message: clampOptionalText(src.message, 500),
        embed: toBool(src.embed, defaults.embed),
        color: normalizeColor(src.color, defaults.color),
        bannerUrl: urlOrNull(src.bannerUrl, 512),
      };
    }

    case "serverStats": {
      const defaults = FEATURE_DEFAULTS.serverStats;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        showMembers: toBool(src.showMembers, defaults.showMembers),
        showJoins: toBool(src.showJoins, defaults.showJoins),
        showLeaves: toBool(src.showLeaves, defaults.showLeaves),
        categoryId: id(src.categoryId),
        memberChannelId: id(src.memberChannelId),
        joinsChannelId: id(src.joinsChannelId),
        leavesChannelId: id(src.leavesChannelId),
        memberTemplate: clampOptionalText(src.memberTemplate, 100),
        joinsTemplate: clampOptionalText(src.joinsTemplate, 100),
        leavesTemplate: clampOptionalText(src.leavesTemplate, 100),
      };
    }

    case "memes": {
      const defaults = FEATURE_DEFAULTS.memes;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        channelId: id(src.channelId),
        intervalMinutes: toInt(
          src.intervalMinutes,
          defaults.intervalMinutes,
          15,
          1440,
        ),
      };
    }

    case "twitch": {
      const rawStreamer =
        typeof src.streamerName === "string"
          ? src.streamerName.trim().replace(/^@/, "").toLowerCase()
          : "";
      const streamerName = /^[a-z0-9_]{1,25}$/.test(rawStreamer)
        ? rawStreamer
        : null;
      const defaults = FEATURE_DEFAULTS.twitch;
      return {
        enabled: toBool(src.enabled, defaults.enabled),
        streamerName,
        channelId: id(src.channelId),
        roleId: id(src.roleId),
      };
    }

    default:
      return null;
  }
}

/**
 * Garante que a mensagem de reaction roles tem as reações configuradas.
 * Falha em silêncio (a configuração já foi guardada).
 */
async function ensureReactions(message, entries) {
  const { emojiMatches, toReactable } = require("../../systems/reactionRoles");
  for (const entry of entries) {
    const reactable = toReactable(entry && entry.emoji);
    if (!reactable) continue;
    const existing =
      message && message.reactions && message.reactions.cache
        ? message.reactions.cache.find((r) =>
            emojiMatches(entry.emoji, r.emoji),
          )
        : null;
    if (existing) continue;
    try {
      await message.react(reactable);
    } catch (err) {
      console.warn(
        `[Dashboard] reactionRoles: não foi possível reagir com "${entry.emoji}":`,
        err?.message || err,
      );
    }
  }
}

function registerFeaturesRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  rateLimit,
  requirePremium,
  sanitizeId,
  GuildConfig,
  getClient,
  recordAudit,
  getActorFromRequest,
}) {
  const guardGuildQuery =
    typeof requireGuildAccess === "function"
      ? requireGuildAccess({ from: "query", key: "guildId" })
      : (req, res, next) => next();

  const guardGuildBody =
    typeof requireGuildAccess === "function"
      ? requireGuildAccess({ from: "body", key: "guildId" })
      : (req, res, next) => next();

  const canViewConfig =
    typeof requirePerm === "function"
      ? requirePerm({ anyOf: ["canViewConfig", "canEditConfig"] })
      : (req, res, next) => next();

  const canEditConfig =
    typeof requirePerm === "function"
      ? requirePerm({ anyOf: ["canEditConfig"] })
      : (req, res, next) => next();

  const diagnoseRateLimit =
    typeof rateLimit === "function"
      ? rateLimit({
          windowMs: 60_000,
          max: 30,
          keyPrefix: "rl:features:diagnose:",
        })
      : (req, res, next) => next();
  const featureReadRateLimit =
    typeof rateLimit === "function"
      ? rateLimit({
          windowMs: 60_000,
          max: 60,
          keyPrefix: "rl:features:read:",
        })
      : (req, res, next) => next();
  const featureTestRateLimit =
    typeof rateLimit === "function"
      ? rateLimit({
          windowMs: 60_000,
          max: 5,
          keyPrefix: "rl:features:test:",
        })
      : (req, res, next) => next();
  const featureSaveRateLimit =
    typeof rateLimit === "function"
      ? rateLimit({
          windowMs: 60_000,
          max: 20,
          keyPrefix: "rl:features:save:",
        })
      : (req, res, next) => next();
  const featurePublishRateLimit =
    typeof rateLimit === "function"
      ? rateLimit({
          windowMs: 60_000,
          max: 5,
          keyPrefix: "rl:features:publish:",
        })
      : (req, res, next) => next();

  const premiumGuardBody =
    typeof requirePremium === "function"
      ? requirePremium({ from: "body", key: "guildId" })
      : (req, res, next) => next();

  const guardPremiumTicketsBody = (req, res, next) => {
    const feature = String((req.body && req.body.feature) || "").trim();
    if (feature !== "tickets") return next();
    return premiumGuardBody(req, res, next);
  };

  const guardPremiumTicketsParam = (req, res, next) => {
    const feature = String((req.params && req.params.key) || "").trim();
    if (feature !== "tickets") return next();
    return premiumGuardBody(req, res, next);
  };

  // GET /api/features?guildId=123
  app.get(
    "/api/features",
    requireDashboardAuth,
    canViewConfig,
    guardGuildQuery,
    featureReadRateLimit,
    async (req, res) => {
      try {
        const guildId = sanitizeId(req.query.guildId || "");
        if (!guildId)
          return res
            .status(400)
            .json({ ok: false, error: "GUILD_ID_REQUIRED" });
        if (!GuildConfig)
          return res
            .status(503)
            .json({ ok: false, error: "GUILD_CONFIG_MODEL_MISSING" });

        const cfg = await GuildConfig.findOne({ guildId }).lean();

        const configuredSet = new Set(
          Array.isArray(cfg && cfg.featuresConfigured)
            ? cfg.featuresConfigured
            : [],
        );
        const configuredFeatures = Object.keys(FEATURE_DEFAULTS).reduce(
          (configured, name) => {
            const value = cfg && cfg.features && cfg.features[name];
            configured[name] =
              configuredSet.has(name) || hasLegacyFeatureConfig(name, value);
            return configured;
          },
          {},
        );
        const features = normalizeFeatures(cfg && cfg.features);
        return res.json({ ok: true, features, configuredFeatures });
      } catch (err) {
        console.error("[Dashboard] /api/features GET error:", err);
        return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
      }
    },
  );

  app.get(
    "/api/features/:key/diagnose",
    requireDashboardAuth,
    canViewConfig,
    guardGuildQuery,
    diagnoseRateLimit,
    async (req, res) => {
      try {
        const guildId = sanitizeId(req.query.guildId || "");
        const feature = String(req.params.key || "").trim();
        if (!guildId)
          return res
            .status(400)
            .json({ ok: false, error: "GUILD_ID_REQUIRED" });
        if (!FEATURE_NAMES.includes(feature))
          return res.status(400).json({ ok: false, error: "UNKNOWN_FEATURE" });
        if (!GuildConfig)
          return res
            .status(503)
            .json({ ok: false, error: "GUILD_CONFIG_MODEL_MISSING" });

        const client = typeof getClient === "function" ? getClient() : null;
        if (!client)
          return res
            .status(503)
            .json({ ok: false, error: "CLIENT_UNAVAILABLE" });

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild)
          return res.status(400).json({ ok: false, error: "GUILD_NOT_FOUND" });

        const stored = await GuildConfig.findOne({ guildId }).lean();
        const config = normalizeFeature(
          feature,
          stored && stored.features && stored.features[feature],
        );
        const diagnosis = await diagnoseFeature({
          client,
          guild,
          feature,
          config,
        });
        return res.json({ ok: true, diagnosis });
      } catch (err) {
        console.error("[Dashboard] feature diagnose error:", err);
        return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
      }
    },
  );

  // POST /api/features  { guildId, feature, value }
  app.post(
    "/api/features",
    requireDashboardAuth,
    canEditConfig,
    guardGuildBody,
    guardPremiumTicketsBody,
    featureSaveRateLimit,
    async (req, res) => {
      try {
        const guildId = sanitizeId(req.body.guildId || "");
        if (!guildId)
          return res
            .status(400)
            .json({ ok: false, error: "GUILD_ID_REQUIRED" });
        if (!GuildConfig)
          return res
            .status(503)
            .json({ ok: false, error: "GUILD_CONFIG_MODEL_MISSING" });

        const feature = String(req.body.feature || "").trim();
        if (!FEATURE_NAMES.includes(feature)) {
          return res.status(400).json({ ok: false, error: "UNKNOWN_FEATURE" });
        }

        const value = cleanFeatureValue(feature, req.body.value, sanitizeId);
        if (!value)
          return res
            .status(400)
            .json({ ok: false, error: "INVALID_FEATURE_VALUE" });

        const client = typeof getClient === "function" ? getClient() : null;
        const channelField = FEATURE_DIAGNOSTICS[feature]?.channelField;
        const configuredChannelId = channelField && value[channelField];
        if (configuredChannelId) {
          if (!client || !client.channels) {
            return res
              .status(503)
              .json({ ok: false, error: "CLIENT_UNAVAILABLE" });
          }
          const configuredChannel = await client.channels
            .fetch(configuredChannelId)
            .catch(() => null);
          if (!isGuildChannel(configuredChannel, guildId)) {
            return res
              .status(400)
              .json({ ok: false, error: "CHANNEL_NOT_IN_GUILD" });
          }
        }

        // Cargos por reação: os atalhos ":nome:" são resolvidos para "<:nome:id>"
        // antes de persistir (o Discord só aceita o glifo ou o id do emoji).
        if (
          (feature === "reactionRoles" ||
            feature === "tickets" ||
            feature === "starboard") &&
          client
        ) {
          const guild = await client.guilds.fetch(guildId).catch(() => null);
          if (guild) {
            const {
              resolveShortcodes,
            } = require("../../systems/reactionRoles");
            if (feature === "reactionRoles" && value.entries.length) {
              value.entries = resolveShortcodes(value.entries, guild);
            }
            if (feature === "tickets") {
              const resolved = resolveShortcodes(
                [{ emoji: value.openEmoji }, { emoji: value.closeEmoji }],
                guild,
              );
              value.openEmoji =
                resolved[0] && resolved[0].emoji
                  ? resolved[0].emoji
                  : value.openEmoji;
              value.closeEmoji =
                resolved[1] && resolved[1].emoji
                  ? resolved[1].emoji
                  : value.closeEmoji;
            }
            if (feature === "starboard") {
              const resolved = resolveShortcodes(
                [{ emoji: value.emoji }],
                guild,
              );
              value.emoji =
                resolved[0] && resolved[0].emoji
                  ? resolved[0].emoji
                  : value.emoji;
            }
          }
        }

        const update = {
          $set: { [`features.${feature}`]: value },
          $addToSet: { featuresConfigured: feature },
        };
        if (feature === "tickets") {
          update.$set.ticketThreadChannelId = value.channelId || null;
        }

        await GuildConfig.findOneAndUpdate({ guildId }, update, {
          returnDocument: "after",
          upsert: true,
        }).lean();
        invalidateGuildConfig(guildId);

        if (typeof recordAudit === "function") {
          await recordAudit({
            req,
            action: "features.update",
            guildId,
            actor:
              typeof getActorFromRequest === "function"
                ? getActorFromRequest(req)
                : null,
            payload: { feature, enabled: value.enabled },
          });
        }

        let outValue = value;

        // Estatísticas do servidor: cria/atualiza os canais ao ligar e remove-os ao desligar.
        if (feature === "serverStats") {
          if (client) {
            try {
              const guild = await client.guilds
                .fetch(guildId)
                .catch(() => null);
              if (guild) {
                const {
                  refreshGuild,
                  removeGuild,
                } = require("../../systems/serverStats");
                if (value.enabled)
                  await refreshGuild(client, guild, { force: true });
                else await removeGuild(guild, value);

                // Devolver os IDs de canal efetivamente persistidos: evita que a
                // dashboard os reenvie a null (o que duplicava canais ao "Testar").
                const fresh = await GuildConfig.findOne({ guildId }).lean();
                outValue = normalizeFeature(
                  feature,
                  fresh && fresh.features && fresh.features[feature],
                );
              }
            } catch (err) {
              console.warn(
                "[Dashboard] serverStats apply failed:",
                err?.message || err,
              );
            }
          }
        }

        // Provisionamento do painel de reaction roles (adicionar reações à mensagem).
        if (
          feature === "reactionRoles" &&
          value.enabled &&
          value.channelId &&
          value.messageId &&
          value.entries.length
        ) {
          if (client) {
            try {
              const channel = await client.channels
                .fetch(value.channelId)
                .catch(() => null);
              const message = channel
                ? await channel.messages
                    .fetch(value.messageId)
                    .catch(() => null)
                : null;
              if (message) await ensureReactions(message, value.entries);
            } catch (err) {
              console.warn(
                "[Dashboard] reactionRoles provisioning failed:",
                err?.message || err,
              );
            }
          }
        }

        return res.json({ ok: true, feature, value: outValue });
      } catch (err) {
        console.error("[Dashboard] /api/features POST error:", err);
        return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
      }
    },
  );

  // POST /api/features/:key/test  { guildId }
  // Executa uma amostra da funcionalidade no servidor (envia mensagem de teste,
  // atualiza os canais de estatísticas, etc.).
  app.post(
    "/api/features/:key/test",
    requireDashboardAuth,
    canEditConfig,
    guardGuildBody,
    guardPremiumTicketsParam,
    featureTestRateLimit,
    async (req, res) => {
      try {
        const guildId = sanitizeId(req.body.guildId || "");
        const feature = String(req.params.key || "").trim();
        if (!guildId)
          return res
            .status(400)
            .json({ ok: false, error: "GUILD_ID_REQUIRED" });
        if (!FEATURE_NAMES.includes(feature))
          return res.status(400).json({ ok: false, error: "UNKNOWN_FEATURE" });
        if (!GuildConfig)
          return res
            .status(503)
            .json({ ok: false, error: "GUILD_CONFIG_MODEL_MISSING" });

        const client = typeof getClient === "function" ? getClient() : null;
        if (!client)
          return res
            .status(503)
            .json({ ok: false, error: "CLIENT_UNAVAILABLE" });

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild)
          return res.status(400).json({ ok: false, error: "GUILD_NOT_FOUND" });

        const cfg = await GuildConfig.findOne({ guildId }).lean();
        let config = normalizeFeature(
          feature,
          cfg && cfg.features && cfg.features[feature],
        );
        let testMessage;
        if (feature === "autoModeration") {
          if (
            typeof req.body.testMessage !== "string" ||
            !req.body.testMessage.trim()
          ) {
            return res
              .status(400)
              .json({ ok: false, error: "SIMULATION_MESSAGE_REQUIRED" });
          }
          testMessage = req.body.testMessage.trim().slice(0, 1000);
          if (req.body.config && typeof req.body.config === "object") {
            config = cleanFeatureValue(feature, req.body.config, sanitizeId);
          }
        }

        const { runFeatureTest } = require("../../systems/featureTests");
        const result = await runFeatureTest({
          client,
          guild,
          feature,
          config,
          testMessage,
        });
        if (!result || result.ok === false) {
          return res.status(400).json({
            ok: false,
            error: (result && result.error) || "TEST_FAILED",
          });
        }

        return res.json({
          ok: true,
          feature,
          info: result.info || null,
          data: result.data || null,
        });
      } catch (err) {
        console.error("[Dashboard] /api/features/:key/test error:", err);
        return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
      }
    },
  );

  async function publishFeatureMessage(req, res, featureKey) {
    try {
      const guildId = sanitizeId(req.body.guildId || "");
      if (!guildId)
        return res.status(400).json({ ok: false, error: "GUILD_ID_REQUIRED" });
      if (!GuildConfig)
        return res
          .status(503)
          .json({ ok: false, error: "GUILD_CONFIG_MODEL_MISSING" });

      const cfg = await GuildConfig.findOne({ guildId }).lean();
      const current = normalizeFeature(
        featureKey,
        cfg && cfg.features && cfg.features[featureKey],
      );

      const client = typeof getClient === "function" ? getClient() : null;
      if (!client)
        return res.status(503).json({ ok: false, error: "CLIENT_UNAVAILABLE" });

      if (
        featureKey === "verification" &&
        (!current.roleId || !current.channelId)
      ) {
        return res
          .status(400)
          .json({ ok: false, error: "VERIFICATION_ROLE_CHANNEL_REQUIRED" });
      }
      if (featureKey === "tickets" && !current.channelId) {
        return res
          .status(400)
          .json({ ok: false, error: "TICKETS_CHANNEL_REQUIRED" });
      }

      const channel = await client.channels
        .fetch(current.channelId)
        .catch(() => null);
      if (
        !isGuildChannel(channel, guildId) ||
        typeof channel.send !== "function"
      ) {
        return res.status(400).json({ ok: false, error: "CHANNEL_NOT_FOUND" });
      }

      const {
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        EmbedBuilder,
      } = require("discord.js");
      const { toReactable } = require("../../systems/reactionRoles");

      let payload = null;
      if (featureKey === "verification") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`verify:${current.roleId}`)
            .setLabel(
              await getFeatureText({
                guildId,
                feature: "verification",
                field: "buttonLabel",
                value: current.buttonLabel,
              }),
            )
            .setStyle(ButtonStyle.Success),
        );
        const embed = new EmbedBuilder()
          .setTitle(
            await getFeatureText({
              guildId,
              feature: "verification",
              field: "title",
              value: current.title,
            }),
          )
          .setDescription(
            await getFeatureText({
              guildId,
              feature: "verification",
              field: "description",
              value: current.description,
            }),
          );
        payload = { embeds: [embed], components: [row] };
      } else {
        const lang = await getGuildLang(guildId).catch(() => "pt");
        const panelTitle = await getFeatureText({
          guildId,
          feature: "tickets",
          field: "panelTitle",
          value: current.panelTitle,
        });
        const panelDescription = await getFeatureText({
          guildId,
          feature: "tickets",
          field: "panelDescription",
          value: current.panelDescription,
          params: { emoji: current.openEmoji },
        });
        const panelFooter = await getFeatureText({
          guildId,
          feature: "tickets",
          field: "panelFooter",
        });
        const now = new Date();
        const footerText = [panelFooter, formatPanelDate(lang, now)]
          .filter(Boolean)
          .join(" • ");
        payload = {
          embeds: [
            new EmbedBuilder()
              .setTitle(panelTitle)
              .setDescription(
                applyTemplate(panelDescription, { emoji: current.openEmoji }),
              )
              .setFooter({ text: footerText })
              .setTimestamp(now),
          ],
        };
      }

      let existingMessage = null;
      if (
        current.messageId &&
        channel.messages &&
        typeof channel.messages.fetch === "function"
      ) {
        try {
          existingMessage = await channel.messages.fetch(current.messageId);
        } catch (err) {
          if (Number(err && err.code) !== 10008) throw err;
        }
      }
      const message =
        existingMessage && typeof existingMessage.edit === "function"
          ? await existingMessage.edit(payload)
          : await channel.send(payload);

      if (featureKey === "tickets") {
        const reactable = toReactable(current.openEmoji);
        if (reactable) await message.react(reactable).catch(() => null);
      }

      const value = { ...current, messageId: message.id };
      await GuildConfig.findOneAndUpdate(
        { guildId },
        {
          $set: {
            [`features.${featureKey}`]: value,
            ...(featureKey === "tickets"
              ? { ticketThreadChannelId: value.channelId || null }
              : {}),
          },
        },
        { returnDocument: "after", upsert: true },
      ).lean();
      invalidateGuildConfig(guildId);

      return res.json({ ok: true, value });
    } catch (err) {
      console.error(
        `[Dashboard] /api/features/${featureKey}/publish error:`,
        err,
      );
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  }

  // POST /api/features/verification/publish  { guildId }
  // Publica (ou reaproveita) a mensagem de verificação com o botão e guarda o messageId.
  app.post(
    "/api/features/verification/publish",
    requireDashboardAuth,
    canEditConfig,
    guardGuildBody,
    featurePublishRateLimit,
    async (req, res) => {
      return publishFeatureMessage(req, res, "verification");
    },
  );

  // POST /api/features/tickets/publish  { guildId }
  // Publica a mensagem painel dos tickets e guarda o messageId.
  app.post(
    "/api/features/tickets/publish",
    requireDashboardAuth,
    canEditConfig,
    guardGuildBody,
    premiumGuardBody,
    featurePublishRateLimit,
    async (req, res) => {
      return publishFeatureMessage(req, res, "tickets");
    },
  );
}

module.exports = { registerFeaturesRoutes, diagnoseFeature, cleanFeatureValue };
