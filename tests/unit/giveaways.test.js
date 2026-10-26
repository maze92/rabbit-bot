const { test, eq } = require("./_harness");
const startGiveaways = require("../../src/systems/giveaways");
const { _internals } = startGiveaways;

test("Free-To-Keep requires active guild Premium or the explicit test bypass", () => {
  eq(_internals.hasGiveawaysPremium({ premium: { enabled: false } }), false);
  eq(
    _internals.hasGiveawaysPremium({
      premium: { enabled: true, until: new Date(Date.now() - 1000) },
    }),
    false,
  );
  eq(
    _internals.hasGiveawaysPremium({
      premium: { enabled: true, until: new Date(Date.now() + 60_000) },
    }),
    true,
  );
  eq(_internals.hasGiveawaysPremium({ premium: { testBypass: true } }), true);
});

test("Free-To-Keep max posts are capped at 50 per check", () => {
  eq(_internals.effectiveMaxPerCycle({ maxPerCycle: 0 }), 50);
  eq(_internals.effectiveMaxPerCycle({ maxPerCycle: 7 }), 7);
  eq(_internals.effectiveMaxPerCycle({ maxPerCycle: 100 }), 50);
  eq(_internals.effectiveMaxPerCycle({ maxPerCycle: NaN }), 50);
});

test("Free-To-Keep scheduler skips expired Premium and active rate-limit backoff", async () => {
  const expired = await _internals.processGuild(
    {},
    {
      guildId: "guild-premium-expired",
      premium: { enabled: true, until: new Date(Date.now() - 1000) },
      giveaways: { enabled: true, channelId: "123456789012345678" },
    },
  );
  eq(expired.reason, "premium_required");
  eq(startGiveaways.getStatus("guild-premium-expired").enabled, false);

  const guildId = "guild-rate-limited";
  _internals.retryUntilByGuild.set(guildId, Date.now() + 60_000);
  try {
    const backoff = await _internals.processGuild(
      {},
      {
        guildId,
        premium: { enabled: true, until: new Date(Date.now() + 60_000) },
        giveaways: { enabled: true, channelId: "123456789012345678" },
      },
    );
    eq(backoff.reason, "backoff");
    eq(backoff.skipped, true);
  } finally {
    _internals.retryUntilByGuild.delete(guildId);
  }
});
