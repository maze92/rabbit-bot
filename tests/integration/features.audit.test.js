const test = require("node:test");
const assert = require("node:assert/strict");
const {
  registerFeaturesRoutes,
} = require("../../src/dashboard/routes/features");
const { FEATURE_DEFAULTS } = require("../../src/systems/featuresService");
const GuildConfigModel = require("../../src/database/models/GuildConfig");
const {
  getGuildConfig,
  invalidateGuildConfig,
} = require("../../src/systems/guildConfigService");
const { startApp, stopApp, passthrough, sanitizeId } = require("./_helpers");

test("feature updates are recorded without including custom message content", async () => {
  let auditEntry = null;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth(req, res, next) {
      req.dashboardUser = { username: "guild-admin" };
      next();
    },
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOneAndUpdate() {
        return { lean: async () => ({}) };
      },
    },
    getClient: () => null,
    getActorFromRequest: (req) => req.dashboardUser.username,
    recordAudit: async (entry) => {
      auditEntry = entry;
    },
  });

  try {
    const response = await fetch(app.baseUrl + "/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: "123456789012345678",
        feature: "welcome",
        value: { enabled: true, message: "custom welcome message" },
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(auditEntry.action, "features.update");
    assert.equal(auditEntry.guildId, "123456789012345678");
    assert.equal(auditEntry.actor, "guild-admin");
    assert.deepEqual(auditEntry.payload, { feature: "welcome", enabled: true });
  } finally {
    await stopApp(app.server);
  }
});

test("feature saves invalidate cached config even if audit recording fails", async () => {
  const guildId = "123456789012345678";
  const originalFindOne = GuildConfigModel.findOne;
  let storedConfig = {
    guildId,
    features: { antiSpam: { enabled: false } },
  };
  GuildConfigModel.findOne = () => ({ lean: async () => storedConfig });
  invalidateGuildConfig(guildId);

  try {
    await getGuildConfig(guildId);
    const app = await startApp(registerFeaturesRoutes, {
      requireDashboardAuth: passthrough,
      requirePerm: () => passthrough,
      requireGuildAccess: () => passthrough,
      sanitizeId,
      GuildConfig: {
        findOneAndUpdate() {
          storedConfig = {
            guildId,
            features: { antiSpam: { enabled: true } },
          };
          return { lean: async () => ({}) };
        },
      },
      recordAudit: async () => {
        throw new Error("audit unavailable");
      },
    });

    try {
      const response = await fetch(app.baseUrl + "/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId,
          feature: "antiSpam",
          value: { enabled: true },
        }),
      });

      assert.equal(response.status, 500);
      const refreshed = await getGuildConfig(guildId);
      assert.equal(refreshed.features.antiSpam.enabled, true);
    } finally {
      await stopApp(app.server);
    }
  } finally {
    GuildConfigModel.findOne = originalFindOne;
    invalidateGuildConfig(guildId);
  }
});

test("feature loading distinguishes saved features from normalized defaults", async () => {
  const guildId = "123456789012345678";
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOne() {
        return {
          lean: async () => ({
            guildId,
            ticketThreadChannelId: "22222",
            features: { welcome: { enabled: false, channelId: "11111" } },
          }),
        };
      },
    },
  });

  try {
    const response = await fetch(
      app.baseUrl + "/api/features?guildId=" + guildId,
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.configuredFeatures.welcome, true);
    assert.equal(result.configuredFeatures.messageLogs, false);
    assert.equal(result.configuredFeatures.antiSpam, false);
    assert.equal(result.configuredFeatures.tickets, false);
    assert.equal(result.features.welcome.enabled, false);
    assert.equal(result.features.tickets.enabled, false);
    assert.equal(result.features.tickets.channelId, null);
    assert.equal(
      result.features.antiSpam.intervalSeconds,
      FEATURE_DEFAULTS.antiSpam.intervalSeconds,
    );
  } finally {
    await stopApp(app.server);
  }
});

test("feature loading returns defaults without creating a GuildConfig", async () => {
  let createCalls = 0;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOne: () => ({ lean: async () => null }),
      create: async () => {
        createCalls += 1;
        throw new Error("GET should not create a GuildConfig");
      },
    },
  });

  try {
    const response = await fetch(
      app.baseUrl + "/api/features?guildId=123456789012345678",
    );
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.features.antiSpam.enabled, false);
    assert.equal(
      result.features.antiSpam.intervalSeconds,
      FEATURE_DEFAULTS.antiSpam.intervalSeconds,
    );
    assert.equal(result.configuredFeatures.antiSpam, false);
    assert.equal(createCalls, 0);
  } finally {
    await stopApp(app.server);
  }
});

test("antiSpam feature updates are clamped and saved per server", async () => {
  let update;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOneAndUpdate(filter, value) {
        update = { filter, value };
        return { lean: async () => ({}) };
      },
    },
    getClient: () => null,
  });

  try {
    const response = await fetch(app.baseUrl + "/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: "123456789012345678",
        feature: "antiSpam",
        value: {
          enabled: true,
          maxMessages: 1,
          intervalSeconds: 500,
          muteDurationMinutes: 0,
          similarityThreshold: 2,
          softActionsEnabled: true,
        },
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.value, {
      enabled: true,
      intervalSeconds: 120,
      maxMessages: 2,
      muteDurationMinutes: 1,
      actionCooldownSeconds: 120,
      softActionsEnabled: true,
      strikeWindowSeconds: 600,
      strikesToMute: 2,
      minLength: 6,
      similarityThreshold: 1,
      ignoreAttachments: true,
      bypassAdmins: true,
      sendMessage: true,
    });
    assert.equal(update.filter.guildId, "123456789012345678");
    assert.deepEqual(update.value.$addToSet.featuresConfigured, "antiSpam");
  } finally {
    await stopApp(app.server);
  }
});

test("Starboard shortcode saves as a canonical custom emoji", async () => {
  let update;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOneAndUpdate(_filter, value) {
        update = value;
        return { lean: async () => ({}) };
      },
    },
    getClient: () => ({
      channels: {
        fetch: async (id) => ({
          id,
          guildId: "123456789012345678",
        }),
      },
      guilds: {
        fetch: async () => ({
          emojis: {
            cache: {
              find: (predicate) => {
                const emoji = { name: "sparkle", id: "345678901234567890" };
                return predicate(emoji) ? emoji : null;
              },
            },
          },
        }),
      },
    }),
  });

  try {
    const response = await fetch(app.baseUrl + "/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: "123456789012345678",
        feature: "starboard",
        value: {
          enabled: true,
          channelId: "234567890123456789",
          emoji: ":sparkle:",
        },
      }),
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.value.emoji, "<:sparkle:345678901234567890>");
    assert.equal(
      update.$set["features.starboard"].emoji,
      "<:sparkle:345678901234567890>",
    );
  } finally {
    await stopApp(app.server);
  }
});

test("AutoMod simulation uses the unsaved draft without persisting it", async () => {
  const guildId = "123456789012345678";
  let writes = 0;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOne: () => ({ lean: async () => ({ guildId, features: {} }) }),
      findOneAndUpdate: async () => {
        writes++;
      },
    },
    getClient: () => ({ guilds: { fetch: async () => ({ id: guildId }) } }),
  });

  try {
    const response = await fetch(
      app.baseUrl + "/api/features/autoModeration/test",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId,
          testMessage: "This sample contains a testphrase.",
          config: {
            enabled: true,
            maxWarnings: 4,
            muteDurationMinutes: 12,
            bannedWordsEn: "testphrase",
            bannedWordsPt: "",
          },
        }),
      },
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.info, "autoModerationMatched");
    assert.equal(result.data.word, "testphrase");
    assert.equal(writes, 0);
  } finally {
    await stopApp(app.server);
  }
});

test("AutoMod rules are deduplicated and bounded before persistence", async () => {
  let update;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOneAndUpdate(filter, value) {
        update = { filter, value };
        return { lean: async () => ({}) };
      },
    },
    getClient: () => ({
      channels: {
        fetch: async (id) => ({
          id,
          guildId: "123456789012345678",
        }),
      },
    }),
  });

  try {
    const response = await fetch(app.baseUrl + "/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: "123456789012345678",
        feature: "autoModeration",
        value: {
          enabled: true,
          maxWarnings: 99,
          muteDurationMinutes: 0,
          bannedWordsPt: "Termo\ntermo\n" + "x".repeat(80),
          bannedWordsEn: "word",
          bypassRoleIds: [
            "222222222222222222",
            "invalid",
            "222222222222222222",
          ],
          bypassChannelIds: ["333333333333333333", "invalid"],
        },
      }),
    });
    assert.equal(response.status, 200);
    const { value } = await response.json();
    assert.equal(value.maxWarnings, 10);
    assert.equal(value.muteDurationMinutes, 1);
    assert.equal(value.bannedWordsPt, `Termo\n${"x".repeat(64)}`);
    assert.equal(value.bannedWordsEn, "word");
    assert.deepEqual(value.bypassRoleIds, ["222222222222222222"]);
    assert.deepEqual(value.bypassChannelIds, ["333333333333333333"]);
    assert.equal(update.value.$addToSet.featuresConfigured, "autoModeration");
  } finally {
    await stopApp(app.server);
  }
});

test("memes and Twitch feature updates are normalized before persistence", async () => {
  const updates = [];
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOneAndUpdate(filter, update) {
        updates.push({ filter, update });
        return { lean: async () => ({}) };
      },
    },
    getClient: () => ({
      channels: {
        fetch: async (id) => ({ id, guildId: "123456789012345678" }),
      },
    }),
  });

  async function updateFeature(feature, value) {
    return fetch(app.baseUrl + "/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId: "123456789012345678", feature, value }),
    });
  }

  try {
    const memesResponse = await updateFeature("memes", {
      enabled: true,
      channelId: "123456789012345678",
      intervalMinutes: 5,
    });
    assert.equal(memesResponse.status, 200);
    assert.deepEqual((await memesResponse.json()).value, {
      enabled: true,
      channelId: "123456789012345678",
      intervalMinutes: 15,
    });
    assert.equal(updates[0].update.$addToSet.featuresConfigured, "memes");

    const twitchResponse = await updateFeature("twitch", {
      enabled: true,
      streamerName: "@Example_Stream",
      channelId: "123456789012345678",
      roleId: "987654321098765432",
    });
    assert.equal(twitchResponse.status, 200);
    assert.deepEqual((await twitchResponse.json()).value, {
      enabled: true,
      streamerName: "example_stream",
      channelId: "123456789012345678",
      roleId: "987654321098765432",
    });
    assert.equal(updates[1].update.$addToSet.featuresConfigured, "twitch");
    assert.equal(updates.length, 2);
  } finally {
    await stopApp(app.server);
  }
});

test("feature saves reject channel IDs owned by another guild", async () => {
  let writes = 0;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOneAndUpdate() {
        writes += 1;
        return { lean: async () => ({}) };
      },
    },
    getClient: () => ({
      channels: {
        fetch: async (id) => ({ id, guildId: "999999999999999999" }),
      },
    }),
  });

  try {
    const response = await fetch(app.baseUrl + "/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: "123456789012345678",
        feature: "welcome",
        value: {
          enabled: true,
          channelId: "234567890123456789",
        },
      }),
    });
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.equal(result.error, "CHANNEL_NOT_IN_GUILD");
    assert.equal(writes, 0);
  } finally {
    await stopApp(app.server);
  }
});

test("feature diagnostics report missing setup and Discord permissions", async () => {
  const originalTwitchClientId = process.env.TWITCH_CLIENT_ID;
  const originalTwitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
  let diagnoseRateLimitCalls = 0;
  let featureReadRateLimitCalls = 0;
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.TWITCH_CLIENT_SECRET;
  const guildId = "123456789012345678";
  const config = {
    enabled: true,
    channelId: "987654321098765432",
    intervalMinutes: 60,
  };
  const channel = {
    guildId,
    permissionsFor: () => ({ has: () => false }),
  };
  const guild = {
    id: guildId,
    members: { me: { permissions: { has: () => true } } },
    roles: { cache: { get: () => null } },
  };
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    rateLimit: (options) => (req, res, next) => {
      if (options.keyPrefix === "rl:features:diagnose:") {
        diagnoseRateLimitCalls += 1;
      }
      if (options.keyPrefix === "rl:features:read:") {
        featureReadRateLimitCalls += 1;
      }
      next();
    },
    sanitizeId,
    GuildConfig: {
      findOne: () => ({
        lean: async () => ({
          features: {
            memes: config,
            autoModeration: {
              enabled: true,
              bannedWordsPt: "",
              bannedWordsEn: "",
            },
          },
        }),
      }),
    },
    getClient: () => ({
      guilds: { fetch: async () => guild },
      channels: { fetch: async () => channel },
    }),
  });

  try {
    const featuresResponse = await fetch(
      app.baseUrl + `/api/features?guildId=${guildId}`,
    );
    assert.equal(featuresResponse.status, 200);
    assert.equal(featureReadRateLimitCalls, 1);
    assert.equal(diagnoseRateLimitCalls, 0);

    const blockedResponse = await fetch(
      app.baseUrl + `/api/features/memes/diagnose?guildId=${guildId}`,
    );
    assert.equal(blockedResponse.status, 200);
    const blocked = (await blockedResponse.json()).diagnosis;
    assert.equal(blocked.status, "blocked");
    assert.ok(
      blocked.issues.some((issue) => issue.code === "permission_missing"),
    );

    const disabledResponse = await fetch(
      app.baseUrl + `/api/features/twitch/diagnose?guildId=${guildId}`,
    );
    assert.equal(disabledResponse.status, 200);
    const disabledTwitch = (await disabledResponse.json()).diagnosis;
    assert.equal(disabledTwitch.status, "disabled");
    assert.ok(
      disabledTwitch.issues.some((issue) => issue.code === "missing_streamer"),
    );
    assert.ok(
      disabledTwitch.issues.some(
        (issue) => issue.code === "missing_twitch_credentials",
      ),
    );

    const autoModerationResponse = await fetch(
      app.baseUrl + `/api/features/autoModeration/diagnose?guildId=${guildId}`,
    );
    assert.equal(autoModerationResponse.status, 200);
    const autoModeration = (await autoModerationResponse.json()).diagnosis;
    assert.equal(autoModeration.status, "incomplete");
    assert.ok(
      autoModeration.issues.some(
        (issue) => issue.code === "missing_automod_rules",
      ),
    );
    assert.equal(diagnoseRateLimitCalls, 3);
    assert.equal(featureReadRateLimitCalls, 1);
  } finally {
    await stopApp(app.server);
    if (originalTwitchClientId === undefined)
      delete process.env.TWITCH_CLIENT_ID;
    else process.env.TWITCH_CLIENT_ID = originalTwitchClientId;
    if (originalTwitchClientSecret === undefined)
      delete process.env.TWITCH_CLIENT_SECRET;
    else process.env.TWITCH_CLIENT_SECRET = originalTwitchClientSecret;
  }
});

test("feature test actions are rate limited before running", async () => {
  let testRateLimitOptions = null;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    rateLimit: (options) => {
      if (options.keyPrefix !== "rl:features:test:") return passthrough;
      testRateLimitOptions = options;
      return (req, res) =>
        res.status(429).json({ ok: false, error: "RATE_LIMITED" });
    },
    sanitizeId,
    GuildConfig: {
      findOne() {
        throw new Error("rate limit should stop before loading config");
      },
    },
  });

  try {
    const response = await fetch(app.baseUrl + "/api/features/welcome/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId: "123456789012345678" }),
    });

    assert.equal(response.status, 429);
    assert.deepEqual(testRateLimitOptions, {
      windowMs: 60_000,
      max: 5,
      keyPrefix: "rl:features:test:",
    });
  } finally {
    await stopApp(app.server);
  }
});

test("feature saves are rate limited before database or Discord work", async () => {
  let saveRateLimitOptions = null;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    rateLimit: (options) => {
      if (options.keyPrefix !== "rl:features:save:") return passthrough;
      saveRateLimitOptions = options;
      return (req, res) =>
        res.status(429).json({ ok: false, error: "RATE_LIMITED" });
    },
    sanitizeId,
    GuildConfig: {
      findOneAndUpdate() {
        throw new Error("rate limit should stop before saving config");
      },
    },
    getClient() {
      throw new Error("rate limit should stop before Discord provisioning");
    },
  });

  try {
    const response = await fetch(app.baseUrl + "/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: "123456789012345678",
        feature: "serverStats",
        value: { enabled: true },
      }),
    });

    assert.equal(response.status, 429);
    assert.deepEqual(saveRateLimitOptions, {
      windowMs: 60_000,
      max: 20,
      keyPrefix: "rl:features:save:",
    });
  } finally {
    await stopApp(app.server);
  }
});

test("feature panel publishing is rate limited before Discord work", async () => {
  let publishRateLimitOptions = null;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    rateLimit: (options) => {
      if (options.keyPrefix !== "rl:features:publish:") return passthrough;
      publishRateLimitOptions = options;
      return (req, res) =>
        res.status(429).json({ ok: false, error: "RATE_LIMITED" });
    },
    sanitizeId,
    GuildConfig: {
      findOne() {
        throw new Error("rate limit should stop before loading config");
      },
    },
    getClient() {
      throw new Error("rate limit should stop before publishing");
    },
  });

  try {
    const response = await fetch(
      app.baseUrl + "/api/features/verification/publish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: "123456789012345678" }),
      },
    );

    assert.equal(response.status, 429);
    assert.deepEqual(publishRateLimitOptions, {
      windowMs: 60_000,
      max: 5,
      keyPrefix: "rl:features:publish:",
    });
  } finally {
    await stopApp(app.server);
  }
});

test("feature panel publishing edits the saved panel instead of duplicating it", async () => {
  const guildId = "123456789012345678";
  const channelId = "234567890123456789";
  const messageId = "345678901234567890";
  let sentMessages = 0;
  let editedMessages = 0;
  let fetchedMessageId = null;
  let savedUpdate = null;
  const existingMessage = {
    id: messageId,
    async edit() {
      editedMessages += 1;
      return existingMessage;
    },
  };
  const channel = {
    guildId,
    messages: {
      async fetch(id) {
        fetchedMessageId = id;
        return existingMessage;
      },
    },
    async send() {
      sentMessages += 1;
      return { id: "456789012345678901" };
    },
  };
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOne: () => ({
        lean: async () => ({
          features: {
            verification: {
              enabled: true,
              roleId: "567890123456789012",
              channelId,
              messageId,
              title: "Verification",
              description: "Verify to get access.",
              buttonLabel: "Verify",
            },
          },
        }),
      }),
      findOneAndUpdate(_filter, update) {
        savedUpdate = update;
        return { lean: async () => ({}) };
      },
    },
    getClient: () => ({ channels: { fetch: async () => channel } }),
  });

  try {
    const response = await fetch(
      app.baseUrl + "/api/features/verification/publish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId }),
      },
    );
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(fetchedMessageId, messageId);
    assert.equal(editedMessages, 1);
    assert.equal(sentMessages, 0);
    assert.equal(result.value.messageId, messageId);
    assert.equal(
      savedUpdate.$set["features.verification"].messageId,
      messageId,
    );
  } finally {
    await stopApp(app.server);
  }
});

test("feature panel publishing refuses a channel from another guild", async () => {
  let sends = 0;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOne: () => ({
        lean: async () => ({
          features: {
            verification: {
              enabled: true,
              roleId: "567890123456789012",
              channelId: "234567890123456789",
              title: "Verification",
              description: "Verify to get access.",
              buttonLabel: "Verify",
            },
          },
        }),
      }),
    },
    getClient: () => ({
      channels: {
        fetch: async () => ({
          guildId: "999999999999999999",
          send: async () => {
            sends += 1;
          },
        }),
      },
    }),
  });

  try {
    const response = await fetch(
      app.baseUrl + "/api/features/verification/publish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: "123456789012345678" }),
      },
    );
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.equal(result.error, "CHANNEL_NOT_FOUND");
    assert.equal(sends, 0);
  } finally {
    await stopApp(app.server);
  }
});
