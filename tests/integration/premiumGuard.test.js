const test = require('node:test');
const assert = require('node:assert/strict');
const { createPremiumGuard } = require('../../src/dashboard/routes/premium');

const GUILD_ID = '123456789012345678';
const USER_ID = '987654321098765432';

function makeGuard({ entitlement, guildPremium } = {}) {
  let storedPremium = guildPremium || { enabled: false };
  const GuildConfig = {
    findOne() {
      return {
        select() { return this; },
        lean: async () => ({ guildId: GUILD_ID, premium: storedPremium })
      };
    },
    findOneAndUpdate(query, update) {
      storedPremium = update.$set.premium;
      return {
        lean: async () => ({ guildId: query.guildId, premium: storedPremium })
      };
    },
    getPremium() { return storedPremium; }
  };
  const PremiumEntitlement = {
    findOne() { return { lean: async () => entitlement || null }; }
  };
  return createPremiumGuard({
    GuildConfig,
    PremiumEntitlement,
    sanitizeId: (value) => String(value || '').replace(/\D/g, '')
  })();
}

async function runGuard(middleware, role, userId = USER_ID) {
  let statusCode = null;
  let body = null;
  let passed = false;
  const req = {
    dashboardUser: role ? { _id: userId, role } : null,
    body: { guildId: GUILD_ID }
  };
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; }
  };
  await middleware(req, res, () => { passed = true; });
  return { passed, statusCode, body };
}

test('a user entitlement unlocks premium features in another managed guild', async () => {
  const guard = makeGuard({ entitlement: { enabled: true, until: new Date(Date.now() + 86_400_000) } });
  const result = await runGuard(guard, 'GUILD_ADMIN');
  assert.equal(result.passed, true);
});

test('an expired account entitlement does not unlock premium features', async () => {
  const guard = makeGuard({ entitlement: { enabled: true, until: new Date(Date.now() - 1000) } });
  const result = await runGuard(guard, 'GUILD_ADMIN');
  assert.equal(result.statusCode, 402);
  assert.equal(result.body.error, 'PREMIUM_REQUIRED');
});

test('bot admin test access bypasses Premium without creating a paid entitlement', async () => {
  const guard = makeGuard();
  const result = await runGuard(guard, 'BOT_ADMIN');
  assert.equal(result.passed, true);
});