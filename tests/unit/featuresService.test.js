const { test, eq, deepEq } = require("./_harness");
const { PermissionsBitField } = require("discord.js");
const {
  FEATURE_DEFAULTS,
  FEATURE_DIAGNOSTICS,
  FEATURE_DIAGNOSTIC_FIELD_ISSUES,
  normalizeFeature,
} = require("../../src/systems/featuresService");
const GuildConfig = require("../../src/database/models/GuildConfig");
const { resolveGuildAntiSpamConfig } = require("../../src/systems/antiSpam");
const { applyPatch, getValue } = require("../../src/systems/configManager");
const {
  diagnoseFeature,
  cleanFeatureValue,
} = require("../../src/dashboard/routes/features");
const gameNewsSystem = require("../../src/systems/gamenews");

test("serverStats keeps all metrics enabled for existing guild configs", () => {
  const feature = normalizeFeature("serverStats", { enabled: true });
  eq(feature.showMembers, true);
  eq(feature.showJoins, true);
  eq(feature.showLeaves, true);
});

test("serverStats preserves independently disabled metrics", () => {
  const feature = normalizeFeature("serverStats", {
    showMembers: true,
    showJoins: false,
    showLeaves: false,
  });
  eq(feature.showMembers, true);
  eq(feature.showJoins, false);
  eq(feature.showLeaves, false);
});

test("feature diagnostic metadata covers every registered feature", () => {
  eq(
    Object.keys(FEATURE_DIAGNOSTICS).sort().join(","),
    Object.keys(FEATURE_DEFAULTS).sort().join(","),
  );
  eq(FEATURE_DIAGNOSTICS.verification.requiredFields.includes("roleId"), true);
  eq(
    FEATURE_DIAGNOSTICS.verification.guildPermissions.includes("ManageRoles"),
    true,
  );
  eq(
    FEATURE_DIAGNOSTICS.tickets.channelPermissions.includes(
      "CreatePrivateThreads",
    ),
    true,
  );
  for (const diagnostics of Object.values(FEATURE_DIAGNOSTICS)) {
    for (const field of diagnostics.requiredFields || []) {
      eq(
        typeof FEATURE_DIAGNOSTIC_FIELD_ISSUES[field],
        "string",
        `${field} issue code`,
      );
    }
  }
});

test("feature defaults and diagnostic metadata are deeply immutable", () => {
  eq(Object.isFrozen(FEATURE_DEFAULTS), true);
  eq(Object.isFrozen(FEATURE_DEFAULTS.reactionRoles.entries), true);
  eq(
    Object.isFrozen(FEATURE_DIAGNOSTICS.reactionRoles.channelPermissions),
    true,
  );

  const normalized = normalizeFeature("reactionRoles", null);
  eq(Object.isFrozen(normalized.entries), false);
});

test("empty feature payloads use the canonical defaults", () => {
  const sanitizeId = (value) => value.replace(/\D/g, "");

  for (const [name, defaults] of Object.entries(FEATURE_DEFAULTS)) {
    const cleaned = cleanFeatureValue(name, {}, sanitizeId);
    eq(cleaned !== null, true, `${name} should be cleanable`);
    for (const [field, expected] of Object.entries(defaults)) {
      deepEq(cleaned[field], expected, `${name}.${field}`);
    }
  }
});

test("GuildConfig feature defaults match the service defaults", () => {
  const guildConfig = new GuildConfig({ guildId: "defaults-contract" });

  for (const [name, defaults] of Object.entries(FEATURE_DEFAULTS)) {
    const modelDefaults = guildConfig.get(`features.${name}`);
    deepEq(
      normalizeFeature(name, modelDefaults),
      defaults,
      `${name} Mongoose defaults`,
    );
  }
});

test("normalized defaults do not share mutable arrays between calls", () => {
  const reactionRoles = normalizeFeature("reactionRoles", null);
  reactionRoles.entries.push({ emoji: "⭐", roleId: "role-1" });

  const autoModeration = normalizeFeature("autoModeration", null);
  autoModeration.bypassRoleIds.push("role-2");

  eq(normalizeFeature("reactionRoles", null).entries.length, 0);
  eq(normalizeFeature("autoModeration", null).bypassRoleIds.length, 0);
  eq(FEATURE_DEFAULTS.reactionRoles.entries.length, 0);
  eq(FEATURE_DEFAULTS.autoModeration.bypassRoleIds.length, 0);
});

test("normalized persisted arrays do not share references with source config", () => {
  const raw = {
    entries: [{ emoji: "⭐", roleId: "role-1" }],
  };
  const feature = normalizeFeature("reactionRoles", raw);

  feature.entries[0].roleId = "role-2";
  feature.entries.push({ emoji: "🔥", roleId: "role-3" });

  eq(raw.entries.length, 1);
  eq(raw.entries[0].roleId, "role-1");
});

test("null booleans use defaults while explicit false remains false", () => {
  const sanitizeId = (value) => value.replace(/\D/g, "");

  for (const [name, defaults] of Object.entries(FEATURE_DEFAULTS)) {
    for (const [field, defaultValue] of Object.entries(defaults)) {
      if (typeof defaultValue !== "boolean") continue;
      const withNull = cleanFeatureValue(name, { [field]: null }, sanitizeId);
      const withFalse = cleanFeatureValue(name, { [field]: false }, sanitizeId);
      eq(withNull[field], defaultValue, `${name}.${field} null fallback`);
      eq(withFalse[field], false, `${name}.${field} explicit false`);
    }
  }
});

test("numeric feature settings reject malformed and fractional values", () => {
  const sanitizeId = (value) => value.replace(/\D/g, "");

  eq(
    cleanFeatureValue("autoKick", { infractionsToKick: "4abc" }, sanitizeId)
      .infractionsToKick,
    FEATURE_DEFAULTS.autoKick.infractionsToKick,
  );
  for (const invalidValue of [true, [], {}]) {
    eq(
      cleanFeatureValue(
        "autoKick",
        { infractionsToKick: invalidValue },
        sanitizeId,
      ).infractionsToKick,
      FEATURE_DEFAULTS.autoKick.infractionsToKick,
    );
  }
  eq(
    cleanFeatureValue("levels", { xpMin: 2.5 }, sanitizeId).xpMin,
    FEATURE_DEFAULTS.levels.xpMin,
  );
  eq(
    cleanFeatureValue("starboard", { threshold: "12" }, sanitizeId).threshold,
    12,
  );
  eq(cleanFeatureValue("starboard", { threshold: 0 }, sanitizeId).threshold, 1);
});

test("welcome banner URLs must be valid, bounded HTTP(S) URLs", () => {
  const sanitizeId = (value) => value.replace(/\D/g, "");
  const clean = (bannerUrl) =>
    cleanFeatureValue("welcome", { bannerUrl }, sanitizeId).bannerUrl;

  eq(
    clean(" https://example.com/banner.png "),
    "https://example.com/banner.png",
  );
  eq(clean("https://"), null);
  eq(clean("javascript:alert(1)"), null);
  eq(clean("https://user:pass@example.com/banner.png"), null);
  eq(clean(`https://example.com/${"x".repeat(512)}`), null);
});

test("levels normalizes XP maximum to be at least the minimum", () => {
  const sanitizeId = (value) => value.replace(/\D/g, "");
  const feature = cleanFeatureValue(
    "levels",
    { xpMin: 80, xpMax: 20 },
    sanitizeId,
  );

  eq(feature.xpMin, 80);
  eq(feature.xpMax, 80);
});

test("antiSpam is disabled until configured for a guild", () => {
  const feature = normalizeFeature("antiSpam", null);
  eq(feature.enabled, false);
  eq(feature.maxMessages, 5);
  eq(feature.intervalSeconds, 10);
});

test("antiSpam normalizes guild overrides and converts units at runtime", () => {
  const feature = normalizeFeature("antiSpam", {
    enabled: true,
    maxMessages: 4,
    intervalSeconds: 20,
    muteDurationMinutes: 8,
    actionCooldownSeconds: 30,
    softActionsEnabled: false,
    strikeWindowSeconds: 90,
    strikesToMute: 3,
    minLength: 4,
    similarityThreshold: 0.9,
    ignoreAttachments: false,
    bypassAdmins: true,
    sendMessage: false,
  });
  const runtime = resolveGuildAntiSpamConfig(feature);

  eq(runtime.enabled, true);
  eq(runtime.maxMessages, 4);
  eq(runtime.interval, 20_000);
  eq(runtime.muteDuration, 8 * 60_000);
  eq(runtime.actionCooldown, 30_000);
  eq(runtime.softActions.enabled, false);
  eq(runtime.softActions.strikeWindowMs, 90_000);
  eq(runtime.softActions.strikesToMute, 3);
  eq(Object.keys(runtime.channels).length, 0);
  eq(runtime.bypassRoles.length, 0);
});

test("antiSpam defaults are independent of global activation", () => {
  eq(FEATURE_DEFAULTS.antiSpam.enabled, false);
  eq(FEATURE_DEFAULTS.antiSpam.similarityThreshold, 0.85);
});

test("runtime config accepts dashboard-style antiSpam aliases", () => {
  const res = applyPatch({
    patches: [
      { path: "antiSpam.intervalSeconds", value: 20 },
      { path: "antiSpam.muteDurationMinutes", value: 8 },
      { path: "antiSpam.actionCooldownSeconds", value: 30 },
      { path: "antiSpam.softActionsEnabled", value: false },
      { path: "antiSpam.strikeWindowSeconds", value: 90 },
      { path: "antiSpam.strikesToMute", value: 3 },
    ],
  });

  eq(res.ok, true);
  eq(res.applied.includes("antiSpam.intervalSeconds"), true);
  eq(getValue("antiSpam.interval"), 20_000);
  eq(getValue("antiSpam.muteDuration"), 8 * 60_000);
  eq(getValue("antiSpam.actionCooldown"), 30_000);
  eq(getValue("antiSpam.softActions.enabled"), false);
  eq(getValue("antiSpam.softActions.strikeWindowMs"), 90_000);
  eq(getValue("antiSpam.softActions.strikesToMute"), 3);
});

test("feature diagnosis flags missing channel setup for memes", async () => {
  const diagnosis = await diagnoseFeature({
    client: { channels: { fetch: async () => null } },
    guild: {
      id: "guild-1",
      members: { me: { permissions: { has: () => true } } },
      roles: { cache: new Map() },
    },
    feature: "memes",
    config: { enabled: true, channelId: null, intervalMinutes: 60 },
  });

  eq(diagnosis.status, "incomplete");
  eq(
    diagnosis.issues.some((issue) => issue.code === "missing_channel"),
    true,
  );
});

test("feature diagnosis treats whitespace-only required values as missing", async () => {
  const diagnosis = await diagnoseFeature({
    client: { channels: { fetch: async () => null } },
    guild: {
      id: "guild-1",
      members: { me: { permissions: { has: () => true } } },
      roles: { cache: new Map() },
    },
    feature: "messageLogs",
    config: { enabled: true, channelId: "   " },
  });

  eq(
    diagnosis.issues.some(
      (issue) =>
        issue.code === "missing_channel" && issue.field === "channelId",
    ),
    true,
  );
});

test("levels diagnosis requires permission to embed level-up announcements", async () => {
  const diagnosis = await diagnoseFeature({
    client: {
      channels: {
        fetch: async () => ({
          guildId: "guild-1",
          permissionsFor: () => ({
            has: (permission) =>
              permission !== PermissionsBitField.Flags.EmbedLinks,
          }),
        }),
      },
    },
    guild: {
      id: "guild-1",
      members: { me: { permissions: { has: () => true } } },
      roles: { cache: new Map() },
    },
    feature: "levels",
    config: { enabled: true, announceChannelId: "channel-1" },
  });

  eq(diagnosis.status, "blocked");
  eq(
    diagnosis.issues.some(
      (issue) =>
        issue.code === "permission_missing" &&
        issue.permission === "EmbedLinks",
    ),
    true,
  );
});

test("feature diagnosis flags missing AutoMod rules", async () => {
  const diagnosis = await diagnoseFeature({
    client: { channels: { fetch: async () => null } },
    guild: {
      id: "guild-1",
      members: { me: { permissions: { has: () => true } } },
      roles: { cache: new Map() },
    },
    feature: "autoModeration",
    config: { enabled: true, bannedWordsPt: "", bannedWordsEn: "" },
  });

  eq(diagnosis.status, "incomplete");
  eq(
    diagnosis.issues.some((issue) => issue.code === "missing_automod_rules"),
    true,
  );
});

test("AutoMod and antiSpam diagnosis require timeout permission", async () => {
  for (const [feature, config] of [
    [
      "autoModeration",
      { enabled: true, bannedWordsPt: "spam", bannedWordsEn: "" },
    ],
    ["antiSpam", { enabled: true }],
  ]) {
    const diagnosis = await diagnoseFeature({
      client: { channels: { fetch: async () => null } },
      guild: {
        id: "guild-1",
        members: { me: { permissions: { has: () => false } } },
        roles: { cache: new Map() },
      },
      feature,
      config,
    });

    eq(diagnosis.status, "blocked", `${feature} status`);
    eq(
      diagnosis.issues.some(
        (issue) =>
          issue.code === "permission_missing" &&
          issue.permission === "ModerateMembers",
      ),
      true,
      `${feature} timeout permission`,
    );
  }
});

test("feature diagnosis flags an unavailable reaction-role panel", async () => {
  const diagnosis = await diagnoseFeature({
    client: {
      channels: {
        fetch: async () => ({
          guildId: "guild-1",
          messages: { fetch: async () => null },
          permissionsFor: () => ({ has: () => true }),
        }),
      },
    },
    guild: {
      id: "guild-1",
      members: { me: { permissions: { has: () => true } } },
      roles: { cache: new Map([["role-1", { editable: true }]]) },
    },
    feature: "reactionRoles",
    config: {
      enabled: true,
      channelId: "channel-1",
      messageId: "message-1",
      entries: [{ emoji: "⭐", roleId: "role-1" }],
    },
  });

  eq(diagnosis.status, "incomplete");
  eq(
    diagnosis.issues.some((issue) => issue.code === "message_unavailable"),
    true,
  );
});

test("tickets diagnosis requires permission to manage private threads", async () => {
  const diagnosis = await diagnoseFeature({
    client: {
      channels: {
        fetch: async () => ({
          guildId: "guild-1",
          permissionsFor: () => ({
            has: (permission) =>
              permission !== PermissionsBitField.Flags.ManageThreads,
          }),
        }),
      },
    },
    guild: {
      id: "guild-1",
      members: { me: { permissions: { has: () => true } } },
      roles: { cache: new Map() },
    },
    feature: "tickets",
    config: { enabled: true, channelId: "channel-1" },
  });

  eq(diagnosis.status, "blocked");
  eq(
    diagnosis.issues.some(
      (issue) =>
        issue.code === "permission_missing" &&
        issue.permission === "ManageThreads",
    ),
    true,
  );
});

test("feature diagnosis flags incomplete serverStats setup", async () => {
  const diagnosis = await diagnoseFeature({
    client: { channels: { fetch: async () => null } },
    guild: {
      id: "guild-1",
      members: { me: { permissions: { has: () => true } } },
      roles: { cache: new Map() },
    },
    feature: "serverStats",
    config: {
      enabled: true,
      showMembers: false,
      showJoins: false,
      showLeaves: false,
    },
  });

  eq(diagnosis.status, "incomplete");
  eq(
    diagnosis.issues.some((issue) => issue.code === "missing_stats_metric"),
    true,
  );
});

test("starboard diagnosis requires message history in its output channel", async () => {
  const diagnosis = await diagnoseFeature({
    client: {
      channels: {
        fetch: async () => ({
          guildId: "guild-1",
          permissionsFor: () => ({
            has: (permission) =>
              permission !== PermissionsBitField.Flags.ReadMessageHistory,
          }),
        }),
      },
    },
    guild: {
      id: "guild-1",
      members: { me: { permissions: { has: () => true } } },
      roles: { cache: new Map() },
    },
    feature: "starboard",
    config: { enabled: true, channelId: "channel-1" },
  });

  eq(diagnosis.status, "blocked");
  eq(
    diagnosis.issues.some(
      (issue) =>
        issue.code === "permission_missing" &&
        issue.permission === "ReadMessageHistory",
    ),
    true,
  );
});

test("gameNews accepts a one-minute global interval in milliseconds", () => {
  const res = applyPatch({
    patches: [{ path: "gameNews.interval", value: 60 * 1000 }],
  });

  eq(res.ok, true);
  eq(res.applied.includes("gameNews.interval"), true);
});

test("gameNews scheduler respects the shortest active feed interval", () => {
  const interval = gameNewsSystem._internals.computeGameNewsPollInterval(
    { gameNews: { interval: 30 * 60 * 1000 } },
    [{ intervalMs: 60 * 1000 }, { intervalMs: 5 * 60 * 1000 }],
  );

  eq(interval, 60 * 1000);
});

test("antiSpam partial overrides retain local defaults without activation", () => {
  const feature = normalizeFeature("antiSpam", {
    maxMessages: 7,
    enabled: null,
    similarityThreshold: null,
  });

  eq(feature.enabled, false);
  eq(feature.maxMessages, 7);
  eq(feature.similarityThreshold, 0.85);
});

test("autoModeration is disabled with no inherited global word lists", () => {
  const feature = normalizeFeature("autoModeration", null);
  eq(feature.enabled, false);
  eq(feature.maxWarnings, 3);
  eq(feature.muteDurationMinutes, 10);
  eq(feature.bannedWordsPt, "");
  eq(feature.bannedWordsEn, "");
});
