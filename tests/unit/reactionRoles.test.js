const { test, eq } = require("./_harness");
const { matchesConfiguredPanel } = require("../../src/systems/reactionRoles");

test("reaction roles match only the configured message when a message ID exists", () => {
  const config = {
    channelId: "channel-1",
    messageId: "message-1",
  };

  eq(
    matchesConfiguredPanel(config, {
      id: "message-1",
      channelId: "channel-1",
    }),
    true,
  );
  eq(
    matchesConfiguredPanel(config, {
      id: "message-2",
      channelId: "channel-1",
    }),
    false,
  );
});

test("reaction roles fall back to the configured channel for legacy panels", () => {
  eq(
    matchesConfiguredPanel(
      { channelId: "channel-1", messageId: null },
      { id: "message-2", channelId: "channel-1" },
    ),
    true,
  );
  eq(
    matchesConfiguredPanel(
      { channelId: "channel-1", messageId: null },
      { id: "message-2", channelId: "channel-2" },
    ),
    false,
  );
});