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
  let entitlement = null;
  const entitlements = [];
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
    findOne() { return chain(guildConfig); },
    find() { return chain([]); },
    async updateMany() { return { modifiedCount: 0 }; },
    findOneAndUpdate(query, update) {
      guildConfig = { guildId: query.guildId, premium: update.$set.premium };
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
      return chain(payments.find((item) => item.paypalOrderId === query.paypalOrderId) || null);
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

  const PremiumEntitlement = {
    findOne(query) { return chain(entitlements.find((item) => item.discordUserId === query.discordUserId) || null); },
    find() { return chain(entitlements); },
    findOneAndUpdate(query, update) {
      entitlement = Object.assign({}, entitlements.find((item) => item.discordUserId === query.discordUserId) || {}, update.$set, { discordUserId: query.discordUserId });
      const index = entitlements.findIndex((item) => item.discordUserId === query.discordUserId);
      if (index >= 0) entitlements[index] = entitlement;
      else entitlements.push(entitlement);
      return chain(entitlement);
    }
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

  const appPromise = startApp(registerPremiumRoutes, {
    requireDashboardAuth(req, res, next) { req.dashboardUser = currentUser; next(); },
    requirePerm: () => passthrough,
    requireGuildAccess: () => passthrough,
    sanitizeId,
    GuildConfig,
    PremiumPayment,
    PremiumEntitlement,
    PremiumSettings,
    config: { dashboard: { allowedOrigins: ['https://dashboard.example'] } },
    paypal
  });

  return {
    appPromise,
    payments,
    entitlements,
    getSettings: () => premiumSettings,
    getGuildConfig: () => guildConfig,
    getEntitlement: () => entitlement,
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

    const returned = await fetch(app.baseUrl + '/api/premium/paypal/return?token=ORDER-123456', { redirect: 'manual' });
    assert.equal(returned.status, 302);
    assert.match(returned.headers.get('location'), /premiumPayment=success/);
    assert.equal(harness.getEntitlement().enabled, true);
    assert.equal(harness.payments[0].status, 'COMPLETED');
    assert.equal(harness.payments[0].paypalPayerEmail, 'payer@example.com');
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

test('bot admin can configure the plan and grant/revoke a personal entitlement', async () => {
  const harness = makeHarness();
  const app = await harness.appPromise;
  harness.setUser({ _id: USER_ID, username: 'bot-admin', role: 'BOT_ADMIN' });
  try {
    const settings = await fetch(app.baseUrl + '/api/premium/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: '9.99', currency: 'USD', durationDays: 60, paymentLink: 'https://paypal.me/example' })
    });
    assert.equal(settings.status, 200);
    assert.equal(harness.getSettings().amount, '9.99');

    const grant = await fetch(app.baseUrl + '/api/premium/admin/users/' + USER_ID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, until: null, username: 'test-user', note: 'manual test', paymentLink: 'https://paypal.me/example' })
    });
    assert.equal(grant.status, 200);
    assert.equal((await grant.json()).entitlement.active, true);
    assert.equal(harness.entitlements[0].source, 'ADMIN');

    const revoke = await fetch(app.baseUrl + '/api/premium/admin/users/' + USER_ID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, until: null, note: 'revoked', paymentLink: '' })
    });
    assert.equal(revoke.status, 200);
    assert.equal((await revoke.json()).entitlement.active, false);

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

test('the paid account sees Premium while other guild admins see only their own entitlement', async () => {
  const harness = makeHarness();
  const app = await harness.appPromise;
  try {
    harness.setUser({ _id: USER_ID, username: 'bot-admin', role: 'BOT_ADMIN' });
    const grant = await fetch(app.baseUrl + '/api/premium/admin/users/' + USER_ID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, until: null, username: 'payer', note: 'paid', paymentLink: '' })
    });
    assert.equal(grant.status, 200);

    harness.setUser({ _id: USER_ID, username: 'payer', role: 'GUILD_ADMIN' });
    const ownerResponse = await fetch(app.baseUrl + '/api/premium?guildId=' + GUILD_ID);
    assert.equal((await ownerResponse.json()).premium.active, true);

    harness.setUser({ _id: '111111111111111111', username: 'other-admin', role: 'GUILD_ADMIN' });
    const otherResponse = await fetch(app.baseUrl + '/api/premium?guildId=' + GUILD_ID);
    const otherPremium = (await otherResponse.json()).premium;
    assert.equal(otherPremium.active, false);
    assert.equal(otherPremium.effectiveActive, false);

    harness.setUser({ _id: '222222222222222222', username: 'bot-admin', role: 'BOT_ADMIN' });
    const testResponse = await fetch(app.baseUrl + '/api/premium?guildId=' + GUILD_ID);
    const testPremium = (await testResponse.json()).premium;
    assert.equal(testPremium.active, false);
    assert.equal(testPremium.effectiveActive, true);
    assert.equal(harness.getGuildConfig().premium.accountUserId, USER_ID);
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
    assert.equal(harness.getEntitlement(), null);
    assert.equal(harness.payments[0].status, 'FAILED');
  } finally {
    await stopApp(app.server);
  }
});

test('Premium is not activated when the captured order points to another guild', async () => {
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
    assert.equal(harness.getEntitlement(), null);
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
    assert.equal(harness.getEntitlement().enabled, true);
    assert.equal(harness.payments[0].status, 'COMPLETED');
  } finally {
    delete process.env.PAYPAL_WEBHOOK_ID;
    await stopApp(app.server);
  }
});