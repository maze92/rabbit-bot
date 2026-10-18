const test = require('node:test');
const assert = require('node:assert/strict');
const { registerPremiumRoutes } = require('../../src/dashboard/routes/premium');
const { startApp, stopApp, passthrough, sanitizeId } = require('./_helpers');

const GUILD_ID = '123456789012345678';
const USER_ID = '987654321098765432';

function makeHarness(options) {
  const settings = options || {};
  let currentUser = { _id: USER_ID, username: 'guild-admin', role: 'GUILD_ADMIN' };
  let guildConfig = { guildId: GUILD_ID, premium: { enabled: false } };
  let premiumSettings = null;
  const payments = [];
  let sequence = 0;

  function chain(value) {
    const result = {
      select() { return result; },
      sort() { return result; },
      limit() { return result; },
      lean() { return Promise.resolve(value); }
    };
    return result;
  }

  const GuildConfig = {
    findOne(query) { return chain(query && query.guildId === guildConfig.guildId ? guildConfig : null); },
    find(query) {
      if (!query || Object.keys(query).length === 0) return chain([guildConfig]);
      const includeEnabled = query['premium.enabled'] === true;
      return chain(includeEnabled && guildConfig.premium.enabled ? [guildConfig] : []);
    },
    findOneAndUpdate(query, update) {
      if (!guildConfig || guildConfig.guildId !== query.guildId) {
        guildConfig = { guildId: query.guildId, premium: { enabled: false } };
      }
      Object.entries(update.$set).forEach(([key, value]) => {
        if (key === 'premium') guildConfig.premium = value;
        else if (key.startsWith('premium.')) guildConfig.premium[key.slice('premium.'.length)] = value;
      });
      return chain(guildConfig);
    }
  };

  const PremiumPayment = {
    async create(data) {
      const payment = Object.assign({ _id: 'payment-' + (++sequence) }, data);
      payments.push(payment);
      return payment;
    },
    findOne(query) {
      return chain(payments.find((item) => Object.entries(query).every(([key, value]) => item[key] === value)) || null);
    },
    findById(id) {
      return chain(payments.find((item) => item._id === id) || null);
    },
    findOneAndUpdate(query, update) {
      const payment = payments.find((item) => item._id === query._id && item.status === query.status);
      if (payment) Object.assign(payment, update.$set);
      return chain(payment ? Object.assign({}, payment) : null);
    },
    async updateOne(query, update) {
      const payment = payments.find((item) => item._id === query._id || item.paypalOrderId === query.paypalOrderId);
      if (payment) Object.assign(payment, update.$set);
    },
    find() { return chain(payments.filter((item) => item.status === 'COMPLETED')); }
  };

  const PremiumSettings = {
    findById() { return chain(premiumSettings); },
    findOneAndUpdate(query, update) {
      premiumSettings = Object.assign({}, premiumSettings || {}, update.$set, { _id: query._id });
      return chain(premiumSettings);
    }
  };

  const paypal = {
    isConfigured: () => true,
    getPlan: () => ({ amount: '6.50', currency: 'EUR', durationDays: 30 }),
    normalizePlan: (plan) => ({
      amount: Number(plan.amount).toFixed(2),
      currency: String(plan.currency).toUpperCase(),
      durationDays: Number(plan.durationDays)
    }),
    createOrder: async (options) => ({
      id: 'ORDER-123456',
      approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-123456',
      plan: options.plan || { amount: '6.50', currency: 'EUR', durationDays: 30 }
    }),
    captureOrder: async () => ({
      id: 'ORDER-123456',
      status: 'COMPLETED',
      payer: { payer_id: 'PAYER-123', email_address: 'payer@example.com' },
      purchase_units: [{
        custom_id: settings.captureUserId || USER_ID,
        reference_id: settings.captureGuildId || GUILD_ID,
        payments: { captures: [{ id: 'CAPTURE-123', status: 'COMPLETED', amount: { value: settings.captureAmount || '6.50', currency_code: 'EUR' } }] }
      }]
    }),
    verifyWebhook: async () => true
  };
  const ownerUser = { id: '111111111111111111', username: 'server-owner', globalName: 'Server Owner' };
  const guild = {
    id: GUILD_ID,
    name: 'Rabbit Guild',
    ownerId: ownerUser.id,
    members: {
      cache: new Map([[ownerUser.id, { user: ownerUser }]]),
      fetch: async () => ({ user: ownerUser })
    }
  };
  const client = {
    guilds: { cache: new Map([[GUILD_ID, guild]]) },
    users: { cache: new Map([[ownerUser.id, ownerUser]]) }
  };

  const appPromise = startApp(registerPremiumRoutes, {
    requireDashboardAuth(req, res, next) { req.dashboardUser = currentUser; next(); },
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig,
    PremiumPayment,
    PremiumSettings,
    getClient: () => client,
    config: { dashboard: { allowedOrigins: ['https://dashboard.example'] } },
    paypal
  });

  return {
    appPromise,
    payments,
    getSettings: () => premiumSettings,
    getGuildConfig: () => guildConfig,
    setUser(user) { currentUser = user; }
  };
}

test('Premium checkout creates a pending PayPal order and verified capture activates its guild', async () => {
  const harness = makeHarness();
  const app = await harness.appPromise;
  try {
    const checkout = await fetch(app.baseUrl + '/api/premium/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: GUILD_ID })
    });
    assert.equal(checkout.status, 200);
    const checkoutBody = await checkout.json();
    assert.equal(checkoutBody.approvalUrl, 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-123456');
    assert.equal(harness.payments[0].status, 'PENDING');
    assert.equal(harness.payments[0].purchaserDiscordUserId, USER_ID);
    assert.equal(harness.payments[0].discordUserId, undefined);

    const returned = await fetch(app.baseUrl + '/api/premium/paypal/return?token=ORDER-123456', { redirect: 'manual' });
    assert.equal(returned.status, 302);
    assert.match(returned.headers.get('location'), /premiumPayment=success/);
    assert.equal(harness.getGuildConfig().premium.enabled, true);
    assert.equal(harness.getGuildConfig().premium.purchasedByUserId, USER_ID);
    assert.equal(harness.payments[0].status, 'COMPLETED');
    assert.equal(harness.payments[0].paypalPayerEmail, 'payer@example.com');

    const status = await fetch(app.baseUrl + '/api/premium?guildId=' + GUILD_ID);
    const statusBody = await status.json();
    assert.equal(statusBody.server.name, 'Rabbit Guild');
    assert.equal(statusBody.server.ownerId, '111111111111111111');
    assert.equal(statusBody.server.ownerName, 'Server Owner');
    assert.equal(statusBody.server.purchaserDiscordUserId, USER_ID);
    assert.equal(statusBody.server.purchaserDiscordUsername, 'guild-admin');
  } finally {
    await stopApp(app.server);
  }
});

test('Premium payment history is visible only to the bot administrator', async () => {
  const harness = makeHarness();
  const app = await harness.appPromise;
  try {
    const denied = await fetch(app.baseUrl + '/api/premium/payments');
    assert.equal(denied.status, 403);

    harness.setUser({ _id: USER_ID, username: 'bot-admin', role: 'BOT_ADMIN' });
    const allowed = await fetch(app.baseUrl + '/api/premium/payments');
    assert.equal(allowed.status, 200);
    assert.deepEqual((await allowed.json()).items, []);
  } finally {
    await stopApp(app.server);
  }
});

test('delegated bot admin can manage server licenses but only bot owner can change global plan', async () => {
  const harness = makeHarness();
  const app = await harness.appPromise;
  harness.setUser({ _id: USER_ID, username: 'bot-admin', role: 'BOT_ADMIN' });
  try {
    const settingsDenied = await fetch(app.baseUrl + '/api/premium/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: '9.99', currency: 'USD', durationDays: 60, paymentLink: 'https://paypal.me/example' })
    });
    assert.equal(settingsDenied.status, 403);

    const settingsReadDenied = await fetch(app.baseUrl + '/api/premium/admin/settings');
    assert.equal(settingsReadDenied.status, 403);

    const grant = await fetch(app.baseUrl + '/api/premium/admin/guilds/' + GUILD_ID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, until: null, note: 'manual test' })
    });
    assert.equal(grant.status, 200);
    assert.equal((await grant.json()).premium.active, true);
    assert.equal(harness.getGuildConfig().premium.note, 'manual test');
    const guilds = await fetch(app.baseUrl + '/api/premium/admin/guilds');
    const listedGuild = (await guilds.json()).items.find((item) => item.guildId === GUILD_ID);
    assert.equal(listedGuild.guildName, 'Rabbit Guild');
    assert.equal(listedGuild.ownerId, '111111111111111111');

    const revoke = await fetch(app.baseUrl + '/api/premium/admin/guilds/' + GUILD_ID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, until: null, note: 'revoked' })
    });
    assert.equal(revoke.status, 200);
    assert.equal((await revoke.json()).premium.active, false);
    const revokedGuilds = await fetch(app.baseUrl + '/api/premium/admin/guilds');
    assert.equal((await revokedGuilds.json()).items.find((item) => item.guildId === GUILD_ID).enabled, false);

    harness.setUser({ _id: USER_ID, username: 'bot-owner', role: 'BOT_OWNER' });
    const settings = await fetch(app.baseUrl + '/api/premium/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: '9.99', currency: 'USD', durationDays: 60, paymentLink: 'https://paypal.me/example' })
    });
    assert.equal(settings.status, 200);
    assert.equal(harness.getSettings().amount, '9.99');

    harness.setUser({ _id: USER_ID, username: 'test-user', role: 'GUILD_ADMIN' });
    const checkout = await fetch(app.baseUrl + '/api/premium/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: GUILD_ID })
    });
    assert.equal(checkout.status, 200);
    assert.equal(harness.payments[harness.payments.length - 1].amount, '9.99');
    assert.equal(harness.payments[harness.payments.length - 1].durationDays, 60);
  } finally {
    await stopApp(app.server);
  }
});

test('a guild license applies to everyone in that guild, not to the payer on another guild', async () => {
  const harness = makeHarness();
  const app = await harness.appPromise;
  try {
    harness.setUser({ _id: USER_ID, username: 'bot-admin', role: 'BOT_ADMIN' });
    const grant = await fetch(app.baseUrl + '/api/premium/admin/guilds/' + GUILD_ID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, until: null, note: 'paid' })
    });
    assert.equal(grant.status, 200);

    harness.setUser({ _id: '111111111111111111', username: 'other-admin', role: 'GUILD_ADMIN' });
    const guildResponse = await fetch(app.baseUrl + '/api/premium?guildId=' + GUILD_ID);
    assert.equal((await guildResponse.json()).premium.active, true);
    const otherGuildResponse = await fetch(app.baseUrl + '/api/premium?guildId=222222222222222222');
    assert.equal((await otherGuildResponse.json()).premium.active, false);
  } finally {
    await stopApp(app.server);
  }
});

test('Premium is not activated when the captured amount differs from the order', async () => {
  const harness = makeHarness({ captureAmount: '1.00' });
  const app = await harness.appPromise;
  try {
    await fetch(app.baseUrl + '/api/premium/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: GUILD_ID })
    });
    const returned = await fetch(app.baseUrl + '/api/premium/paypal/return?token=ORDER-123456', { redirect: 'manual' });
    assert.match(returned.headers.get('location'), /premiumPayment=error/);
    assert.equal(harness.getGuildConfig().premium.enabled, false);
    assert.equal(harness.payments[0].status, 'FAILED');
  } finally {
    await stopApp(app.server);
  }
});

test('Premium is not activated when the capture buyer does not match the checkout buyer', async () => {
  const harness = makeHarness({ captureUserId: '111111111111111111' });
  const app = await harness.appPromise;
  try {
    await fetch(app.baseUrl + '/api/premium/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: GUILD_ID })
    });
    const returned = await fetch(app.baseUrl + '/api/premium/paypal/return?token=ORDER-123456', { redirect: 'manual' });
    assert.match(returned.headers.get('location'), /premiumPayment=error/);
    assert.equal(harness.getGuildConfig().premium.enabled, false);
    assert.equal(harness.payments[0].status, 'FAILED');
  } finally {
    await stopApp(app.server);
  }
});

test('A verified PayPal capture webhook activates Premium without a browser return', async () => {
  const harness = makeHarness();
  const app = await harness.appPromise;
  try {
    await fetch(app.baseUrl + '/api/premium/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: GUILD_ID })
    });
    process.env.PAYPAL_WEBHOOK_ID = 'test-webhook-id';
    const webhook = await fetch(app.baseUrl + '/api/premium/paypal/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'CAPTURE-123',
          status: 'COMPLETED',
          amount: { value: '6.50', currency_code: 'EUR' },
          custom_id: USER_ID,
          payer: { payer_id: 'PAYER-123', email_address: 'payer@example.com' },
          supplementary_data: { related_ids: { order_id: 'ORDER-123456' } }
        }
      })
    });
    assert.equal(webhook.status, 200);
    assert.equal(harness.getGuildConfig().premium.enabled, true);
    assert.equal(harness.payments[0].status, 'COMPLETED');
  } finally {
    delete process.env.PAYPAL_WEBHOOK_ID;
    await stopApp(app.server);
  }
});