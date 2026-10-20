const test = require('node:test');
const assert = require('node:assert/strict');
const { registerFeaturesRoutes } = require('../../src/dashboard/routes/features');
const { startApp, stopApp, passthrough, sanitizeId } = require('./_helpers');

test('feature updates are recorded without including custom message content', async () => {
  let auditEntry = null;
  const app = await startApp(registerFeaturesRoutes, {
    requireDashboardAuth(req, res, next) {
      req.dashboardUser = { username: 'guild-admin' };
      next();
    },
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig: {
      findOneAndUpdate() {
        return { lean: async () => ({}) };
      }
    },
    getClient: () => null,
    getActorFromRequest: (req) => req.dashboardUser.username,
    recordAudit: async (entry) => { auditEntry = entry; }
  });

  try {
    const response = await fetch(app.baseUrl + '/api/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guildId: '123456789012345678',
        feature: 'welcome',
        value: { enabled: true, message: 'custom welcome message' }
      })
    });
    assert.equal(response.status, 200);
    assert.equal(auditEntry.action, 'features.update');
    assert.equal(auditEntry.guildId, '123456789012345678');
    assert.equal(auditEntry.actor, 'guild-admin');
    assert.deepEqual(auditEntry.payload, { feature: 'welcome', enabled: true });
  } finally {
    await stopApp(app.server);
  }
});