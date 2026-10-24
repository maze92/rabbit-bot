const { test, eq } = require("./_harness");
const { isGuildChannel } = require("../../src/utils/guildChannel");

test("isGuildChannel matches direct and nested guild IDs", () => {
  eq(isGuildChannel({ guildId: "guild-1" }, "guild-1"), true);
  eq(isGuildChannel({ guild: { id: "guild-1" } }, "guild-1"), true);
});

test("isGuildChannel rejects missing and cross-guild channels", () => {
  eq(isGuildChannel(null, "guild-1"), false);
  eq(isGuildChannel({ id: "channel-1" }, "guild-1"), false);
  eq(isGuildChannel({ guildId: "guild-2" }, "guild-1"), false);
});
