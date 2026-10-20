const test = require('node:test');
const assert = require('node:assert/strict');
const { registerGuildsRoutes } = require('../../src/dashboard/routes/guilds');
const { startApp, stopApp, passthrough, sanitizeId } = require('./_helpers');

async function createApp(user) {
  return startApp(registerGuildsRoutes, {
    requireDashboardAuth(req, res, next) {
      req.dashboardUser = user;
      next();
    },
    requireGuildAccess: () => passthrough,
    getClient: () => ({ guilds: { cache: new Map() } }),
    sanitizeId
  });
}

test('bot operators can keep an OAuth session without any eligible guilds', async () => {
  const app = await createApp({
    _id: '987654321098765432',
    role: 'BOT_OWNER',
    oauth: true,
    allowedGuildIds: [],
    allowedGuilds: []
  });
  try {
    const response = await fetch(app.baseUrl + '/api/guilds');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, items: [] });
  } finally {
    await stopApp(app.server);
  }
});

test('regular OAuth users without eligible guilds are still asked to re-authenticate', async () => {
  const app = await createApp({
    _id: '987654321098765432',
    role: 'USER',
    oauth: true,
    allowedGuildIds: [],
    allowedGuilds: []
  });
  try {
    const response = await fetch(app.baseUrl + '/api/guilds');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reason, 'NO_ELIGIBLE_GUILDS');
  } finally {
    await stopApp(app.server);
  }
});
