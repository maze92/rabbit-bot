const { test, eq } = require("./_harness");
const {
  buildBannedWordMatchers,
  evaluateAutoModeration,
  normalizeAutoModerationConfig,
} = require("../../src/systems/autoModeration");
const defaultConfig = require("../../src/config/defaultConfig");

test("autoModeration matches configured words case-insensitively after normalization", () => {
  const result = evaluateAutoModeration(
    "This contains a TEST PHRASE.",
    { bannedWordsEn: "test phrase", bannedWordsPt: "" },
    "automod-normalize",
  );

  eq(result.matchedWord, "test phrase");
});

test("autoModeration treats special characters as literal configured text", () => {
  const result = evaluateAutoModeration(
    "badXXXword should not match",
    { bannedWordsEn: "bad*word", bannedWordsPt: "" },
    "automod-literal",
  );

  eq(result.matchedWord, null);
  eq(buildBannedWordMatchers({ bannedWordsEn: "bad*word" }).length, 1);
});

test("autoModeration configuration inherits global thresholds and words", () => {
  const config = normalizeAutoModerationConfig(defaultConfig, {
    enabled: true,
    maxWarnings: defaultConfig.maxWarnings,
    muteDurationMinutes: Math.round(defaultConfig.muteDuration / 60_000),
    bannedWordsPt: defaultConfig.bannedWords.pt.join("\n"),
    bannedWordsEn: defaultConfig.bannedWords.en.join("\n"),
  });

  eq(config.maxWarnings, defaultConfig.maxWarnings);
  eq(config.muteDuration, defaultConfig.muteDuration);
  eq(config.bannedWords.pt.length, defaultConfig.bannedWords.pt.length);
  eq(config.bannedWords.en.length, defaultConfig.bannedWords.en.length);
});
