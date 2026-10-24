const { test, eq } = require("./_harness");
const { runFeatureTest } = require("../../src/systems/featureTests");

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

test("feature test refuses to send to a channel from another guild", async () => {
  let sends = 0;
  const result = await runFeatureTest({
    client: {
      channels: {
        fetch: async () => ({
          guildId: "guild-2",
          send: async () => {
            sends += 1;
          },
        }),
      },
    },
    guild: { id: "guild-1", name: "Guild 1" },
    feature: "welcome",
    config: { channelId: "channel-2" },
  });

  eq(result.ok, false);
  eq(result.error, "CHANNEL_REQUIRED");
  eq(sends, 0);
});

test("feature test does not send a welcome preview across guilds", async () => {
  let sent = false;
  const result = await runFeatureTest({
    client: {
      channels: {
        fetch: async () => ({
          guildId: "guild-2",
          send: async () => {
            sent = true;
          },
        }),
      },
    },
    guild: { id: "guild-1", name: "Guild 1" },
    feature: "welcome",
    config: { channelId: "channel-2" },
  });

  eq(result.ok, false);
  eq(result.error, "CHANNEL_REQUIRED");
  eq(sent, false);
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

test("missing guild context is rejected before feature preview sends", async () => {
  const result = await runFeatureTest({
    feature: "welcome",
    config: { enabled: true, channelId: "channel-1" },
    guild: null,
    client: {
      channels: {
        fetch: async () => ({ guildId: "guild-1", send: async () => {} }),
      },
    },
  });

  eq(result.ok, false);
  eq(result.error, "GUILD_REQUIRED");
});

test("poll feature test reports that no test action is available", async () => {
  const result = await runFeatureTest({ feature: "polls" });

  eq(result.ok, false);
  eq(result.error, "TEST_NOT_AVAILABLE");
});
