const { test, eq, deepEq } = require("./_harness");
const { matchEmoji, _internals } = require("../../src/systems/starboard");

test("starboard custom emoji uses the exact configured ID", () => {
  eq(
    matchEmoji(
      { emoji: { name: "sparkle", id: "123", identifier: "sparkle:123" } },
      "<:sparkle:123>",
    ),
    true,
  );
  eq(
    matchEmoji(
      { emoji: { name: "sparkle", id: "456", identifier: "sparkle:456" } },
      "<:sparkle:123>",
    ),
    false,
  );
});

test("starboard keeps matching Unicode emoji and shortcode names", () => {
  eq(matchEmoji({ emoji: { name: "⭐", id: null } }, "⭐"), true);
  eq(matchEmoji({ emoji: { name: "sparkle", id: "123" } }, ":sparkle:"), true);
});

test("starboard serializes concurrent updates for the same message", async () => {
  let active = 0;
  let maxActive = 0;
  const order = [];
  const run = (value) =>
    _internals.serializeByKey("guild-1:message-1", async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(value);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
    });

  await Promise.all([run("first"), run("second")]);

  eq(maxActive, 1);
  deepEq(order, ["first", "second"]);
});

test("starboard publication queues are independent across messages", async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let secondStarted = false;
  const first = _internals.serializeByKey("guild-1:message-1", async () => {
    await firstGate;
  });
  const second = _internals.serializeByKey("guild-1:message-2", async () => {
    secondStarted = true;
  });

  await second;
  eq(secondStarted, true);
  releaseFirst();
  await first;
});
