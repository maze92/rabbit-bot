const fs = require("node:fs");
const path = require("node:path");
const { test, eq } = require("./_harness");
const { runFeatureTest } = require("../../src/systems/featureTests");

test("feature default-state wording avoids inherited-global language", () => {
  const en = fs.readFileSync(
    path.join(__dirname, "../../public/locales/en.js"),
    "utf8",
  );
  const pt = fs.readFileSync(
    path.join(__dirname, "../../public/locales/pt.js"),
    "utf8",
  );

  eq(en.includes('features_uses_defaults: "Default settings"'), true);
  eq(pt.includes('features_uses_defaults: "Definições predefinidas"'), true);
  eq(en.includes("inherited"), false);
  eq(pt.includes("herdado"), false);
});

test("antiSpam feature test only returns effective settings without side effects", async () => {
  const result = await runFeatureTest({
    feature: "antiSpam",
    config: {
      enabled: true,
      maxMessages: 4,
      intervalSeconds: 20,
      muteDurationMinutes: 8,
    },
  });

  eq(result.ok, true);
  eq(result.info, "antiSpam");
  eq(result.data.maxMessages, 4);
  eq(result.data.intervalSeconds, 20);
  eq(result.data.muteDurationMinutes, 8);
});

test("autoModeration simulation reports a match without Discord side effects", async () => {
  const result = await runFeatureTest({
    guild: { id: "guild-simulation" },
    feature: "autoModeration",
    config: {
      bannedWordsPt: "needle phrase",
      bannedWordsEn: "another phrase",
      maxWarnings: 3,
      muteDurationMinutes: 10,
    },
    testMessage: "This contains a needle phrase for testing.",
  });

  eq(result.ok, true);
  eq(result.info, "autoModerationMatched");
  eq(result.data.word, "needle phrase");
  eq(result.data.maxWarnings, 3);
});

test("autoModeration simulation reports non-matches", async () => {
  const result = await runFeatureTest({
    guild: { id: "guild-simulation" },
    feature: "autoModeration",
    config: { bannedWordsPt: "needle phrase", bannedWordsEn: "" },
    testMessage: "A harmless sample.",
  });

  eq(result.ok, true);
  eq(result.info, "autoModerationNoMatch");
  eq(result.data.word, null);
});

test("autoModeration simulation refreshes matchers when a draft changes", async () => {
  const guild = { id: "guild-draft-cache" };
  const first = await runFeatureTest({
    guild,
    feature: "autoModeration",
    config: { bannedWordsPt: "firstterm", bannedWordsEn: "" },
    testMessage: "This contains firstterm.",
  });
  const second = await runFeatureTest({
    guild,
    feature: "autoModeration",
    config: { bannedWordsPt: "secondterm", bannedWordsEn: "" },
    testMessage: "This contains secondterm.",
  });

  eq(first.data.word, "firstterm");
  eq(second.data.word, "secondterm");
});

test("autoModeration simulation reports when the draft is disabled", async () => {
  const result = await runFeatureTest({
    guild: { id: "guild-disabled-draft" },
    feature: "autoModeration",
    config: { enabled: false, bannedWordsEn: "blocked" },
    testMessage: "blocked",
  });

  eq(result.info, "autoModerationDisabled");
  eq(result.data.word, null);
});

test("poll feature test reports that no test action is available", async () => {
  const result = await runFeatureTest({ feature: "polls" });

  eq(result.ok, false);
  eq(result.error, "TEST_NOT_AVAILABLE");
});

test("reaction roles test requires a saved panel message ID", async () => {
  let sent = false;
  const result = await runFeatureTest({
    client: {
      channels: {
        fetch: async () => ({ id: "channel-1", send: async () => (sent = true) }),
      },
    },
    feature: "reactionRoles",
    config: {
      channelId: "channel-1",
      entries: [{ emoji: "⭐", roleId: "role-1" }],
    },
  });

  eq(result.ok, false);
  eq(result.error, "MESSAGE_REQUIRED");
  eq(sent, false);
});

test("reaction roles test adds configured reactions to the saved panel", async () => {
  const addedReactions = [];
  let sent = false;
  const panel = {
    id: "message-1",
    channelId: "channel-1",
    react: async (emoji) => addedReactions.push(emoji),
  };
  const result = await runFeatureTest({
    client: {
      channels: {
        fetch: async () => ({
          id: "channel-1",
          guildId: "guild-1",
          send: async () => (sent = true),
          messages: { fetch: async (id) => (id === panel.id ? panel : null) },
        }),
      },
    },
    guild: {
      id: "guild-1",
      members: { me: { permissions: { has: () => true } } },
      roles: { cache: { get: () => ({ editable: true }) } },
    },
    feature: "reactionRoles",
    config: {
      channelId: "channel-1",
      messageId: "message-1",
      entries: [{ emoji: "⭐", roleId: "role-1" }],
    },
  });

  eq(result.ok, true);
  eq(addedReactions[0], "⭐");
  eq(sent, false);
});

test("reaction roles test rejects a panel channel from another server", async () => {
  let reactions = 0;
  const result = await runFeatureTest({
    client: {
      channels: {
        fetch: async () => ({
          id: "channel-1",
          guildId: "guild-other",
          send: async () => null,
          messages: {
            fetch: async () => ({
              id: "message-1",
              channelId: "channel-1",
              react: async () => reactions++,
            }),
          },
        }),
      },
    },
    guild: { id: "guild-current" },
    feature: "reactionRoles",
    config: {
      channelId: "channel-1",
      messageId: "message-1",
      entries: [{ emoji: "⭐", roleId: "role-1" }],
    },
  });

  eq(result.ok, false);
  eq(result.error, "CHANNEL_NOT_FOUND");
  eq(reactions, 0);
});

test("reaction roles test reports when the bot cannot add a configured reaction", async () => {
  const result = await runFeatureTest({
    client: {
      channels: {
        fetch: async () => ({
          id: "channel-1",
          guildId: "guild-1",
          send: async () => null,
          messages: {
            fetch: async () => ({
              id: "message-1",
              channelId: "channel-1",
              react: async () => {
                throw new Error("Missing Add Reactions permission");
              },
            }),
          },
        }),
      },
    },
    guild: {
      id: "guild-1",
      members: { me: { permissions: { has: () => true } } },
      roles: { cache: { get: () => ({ editable: true }) } },
    },
    feature: "reactionRoles",
    config: {
      channelId: "channel-1",
      messageId: "message-1",
      entries: [{ emoji: "⭐", roleId: "role-1" }],
    },
  });

  eq(result.ok, true);
  eq(result.info, "reactionRolesReactionFailed");
  eq(result.data.failed, 1);
});

test("ticket test requires the saved panel message ID", async () => {
  let sent = false;
  const result = await runFeatureTest({
    client: {
      channels: {
        fetch: async () => ({
          id: "channel-1",
          send: async () => (sent = true),
        }),
      },
    },
    feature: "tickets",
    config: { channelId: "channel-1" },
  });

  eq(result.ok, false);
  eq(result.error, "MESSAGE_REQUIRED");
  eq(sent, false);
});

test("ticket test adds the open reaction to the saved panel only", async () => {
  const addedReactions = [];
  let sent = false;
  const panel = {
    id: "message-1",
    channelId: "channel-1",
    react: async (emoji) => addedReactions.push(emoji),
  };
  const result = await runFeatureTest({
    client: {
      channels: {
        fetch: async () => ({
          id: "channel-1",
          guildId: "guild-1",
          send: async () => (sent = true),
          messages: { fetch: async (id) => (id === panel.id ? panel : null) },
        }),
      },
    },
    guild: { id: "guild-1" },
    feature: "tickets",
    config: {
      channelId: "channel-1",
      messageId: "message-1",
      openEmoji: "🎫",
    },
  });

  eq(result.ok, true);
  eq(addedReactions[0], "🎫");
  eq(sent, false);
});
