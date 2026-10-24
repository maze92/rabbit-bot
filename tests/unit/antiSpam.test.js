const { test, eq } = require("./_harness");
const { shouldSkipAntiSpam } = require("../../src/systems/antiSpam");

test("antiSpam skips messages already acted on by AutoMod", () => {
  eq(
    shouldSkipAntiSpam({
      guild: { id: "guild" },
      author: { id: "user", bot: false },
      _autoModActionTaken: true,
    }),
    true,
  );
});

test("antiSpam still evaluates ordinary human guild messages", () => {
  eq(
    shouldSkipAntiSpam({
      guild: { id: "guild" },
      author: { id: "user", bot: false },
      _autoModActionTaken: false,
    }),
    false,
  );
});
