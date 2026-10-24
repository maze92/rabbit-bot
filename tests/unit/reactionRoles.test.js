const { test, eq } = require("./_harness");
const {
  emojiMatches,
  matchesConfiguredMessage,
} = require("../../src/systems/reactionRoles");

test("custom emoji config matches by ID, not just by name", () => {
  eq(
    emojiMatches("<:rocket:123>", {
      name: "rocket",
      id: "123",
      identifier: "rocket:123",
    }),
    true,
  );
  eq(
    emojiMatches("<:rocket:123>", {
      name: "rocket",
      id: "456",
      identifier: "rocket:456",
    }),
    false,
  );
});

test("animated custom emoji config also matches by ID", () => {
  eq(
    emojiMatches("<a:rocket:123>", {
      name: "rocket",
      id: "123",
      identifier: "rocket:123",
    }),
    true,
  );
});

test("shortcode config continues matching by emoji name", () => {
  eq(emojiMatches(":rocket:", { name: "rocket", id: "456" }), true);
});

test("reaction roles only match the configured panel when its ID exists", () => {
  const config = { channelId: "channel-1", messageId: "message-1" };
  eq(
    matchesConfiguredMessage(config, {
      channelId: "channel-1",
      id: "message-1",
    }),
    true,
  );
  eq(
    matchesConfiguredMessage(config, {
      channelId: "channel-1",
      id: "message-2",
    }),
    false,
  );
  eq(
    matchesConfiguredMessage(config, {
      channelId: "channel-2",
      id: "message-1",
    }),
    false,
  );
});

test("legacy reaction-role configs without a message ID still match by channel", () => {
  eq(
    matchesConfiguredMessage(
      { channelId: "channel-1", messageId: null },
      { channelId: "channel-1", id: "message-2" },
    ),
    true,
  );
  eq(
    matchesConfiguredMessage(
      { channelId: "channel-1", messageId: null },
      { channelId: "channel-2", id: "message-2" },
    ),
    false,
  );
});
