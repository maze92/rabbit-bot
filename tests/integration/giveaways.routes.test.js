const test = require("node:test");
const assert = require("node:assert/strict");

const {
  registerGiveawaysRoutes,
} = require("../../src/dashboard/routes/giveaways");
const startGiveaways = require("../../src/systems/giveaways");
const {
  startApp,
  stopApp,
  passthrough,
  sanitizeId,
  sanitizeText,
} = require("./_helpers");

const GUILD = "123456789012345678";

function buildCtx(overrides = {}) {
  return {
    requireDashboardAuth: passthrough,
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    requirePremium: () => passthrough,
    rateLimit: { medium: passthrough },
    sanitizeId,
    sanitizeText,
    getClient: () => null,
    GuildConfig: {},
    GiveawayPost: null,
    ...overrides,
  };
}

test("POST /api/giveaways/trigger reports skips and upstream failures", async () => {
  const previous = startGiveaways._instance;
  let nextResult;
  startGiveaways._instance = { triggerGuild: async () => nextResult };
  const app = await startApp(registerGiveawaysRoutes, buildCtx());

  try {
    nextResult = { skipped: true, reason: "backoff", retryAfterMs: 45_000 };
    let response = await fetch(
      `${app.baseUrl}/api/giveaways/trigger?guildId=${GUILD}`,
      { method: "POST" },
    );
    assert.equal(response.status, 429);
    let body = await response.json();
    assert.equal(body.reason, "backoff");
    assert.equal(body.retryAfterMs, 45_000);

    nextResult = { ok: false, error: "GamerPower unavailable" };
    response = await fetch(
      `${app.baseUrl}/api/giveaways/trigger?guildId=${GUILD}`,
      { method: "POST" },
    );
    assert.equal(response.status, 502);
    body = await response.json();
    assert.equal(body.ok, false);

    nextResult = { ok: true, sent: 3 };
    response = await fetch(
      `${app.baseUrl}/api/giveaways/trigger?guildId=${GUILD}`,
      { method: "POST" },
    );
    assert.equal(response.status, 200);
    body = await response.json();
    assert.equal(body.sent, 3);
  } finally {
    startGiveaways._instance = previous;
    await stopApp(app.server);
  }
});

test("POST /api/giveaways/test requires Premium", async () => {
  let clientFetches = 0;
  const app = await startApp(
    registerGiveawaysRoutes,
    buildCtx({
      requirePremium: () => (_req, res) =>
        res.status(402).json({ ok: false, error: "PREMIUM_REQUIRED" }),
      getClient: () => {
        clientFetches += 1;
        return null;
      },
    }),
  );

  try {
    const response = await fetch(`${app.baseUrl}/api/giveaways/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: GUILD,
        channelId: "987654321098765432",
        platform: "steam",
      }),
    });
    assert.equal(response.status, 402);
    assert.equal(clientFetches, 0);
  } finally {
    await stopApp(app.server);
  }
});
