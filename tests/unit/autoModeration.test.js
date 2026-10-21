const { test, eq } = require("./_harness");
const {
  buildBannedWordMatchers,
  evaluateAutoModeration,
  normalizeAutoModerationConfig,
} = require("../../src/systems/autoModeration");

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

test("autoModeration does not inherit global thresholds or words", () => {
  const config = normalizeAutoModerationConfig({});

  eq(config.maxWarnings, 3);
  eq(config.muteDuration, 10 * 60_000);
  eq(config.bannedWords.pt.length, 0);
  eq(config.bannedWords.en.length, 0);
});
