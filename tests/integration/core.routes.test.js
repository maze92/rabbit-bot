// tests/integration/core.routes.test.js
// Testes de integração das rotas core (health + métricas internas).

const test = require('node:test');
const assert = require('node:assert/strict');

const { registerCoreRoutes } = require('../../src/dashboard/routes/core');
const { startApp, stopApp, passthrough } = require('./_helpers');

function buildCtx(overrides) {
  return Object.assign(
    {
      requireDashboardAuth: passthrough,
      requirePerm: () => passthrough,
      rateLimit: () => passthrough,
      recordAudit: async () => {},
      getActorFromRequest: () => ({ id: 'test' }),
      configManager: {
        getPublicConfig: () => ({ ok: true }),
        getEditableSchema: () => ({}),
        applyPatch: () => ({ ok: true })
      },
      status: {
        getStatus: () => ({
          discordReady: true,
          mongoConnected: true,
          gameNewsRunning: true,
          totalCommandsExecuted: 5,
          totalInfractionsCreated: 2,
          autoModActions: 1,
          antiSpamActions: 0
        })
      },
      metrics: {
        getMetrics: () => ({
          generatedAt: new Date().toISOString(),
          uptimeSeconds: 12,
          totals: { requests: 3, errors: 0, routes: 1 },
          routes: []
        }),
        formatPrometheus: () => 'rabbit_up 1\n'
      },
      getClient: () => null,
      Infraction: null
    },
    overrides || {}
  );
}

test('GET /health reporta estado pronto', async () => {
  const app = await startApp(registerCoreRoutes, buildCtx());
  try {
    const res = await fetch(app.baseUrl + '/health');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.discordReady, true);
    assert.equal(body.mongoConnected, true);
    assert.equal(body.metrics.totalCommandsExecuted, 5);
  } finally {
    await stopApp(app.server);
  }
});

test('GET /api/internal/metrics sem token e sem admin devolve 401', async () => {
  const app = await startApp(registerCoreRoutes, buildCtx());
  try {
    const res = await fetch(app.baseUrl + '/api/internal/metrics');
    // sem METRICS_TOKEN o guard cai no requireDashboardAuth (pass-through aqui)
    // mas sem dashboardUser/role ADMIN -> 403.
    assert.ok(res.status === 401 || res.status === 403, 'esperado 401/403, obtido ' + res.status);
  } finally {
    await stopApp(app.server);
  }
});

test('GET /api/internal/metrics aceita Authorization: Bearer (formato do Prometheus)', async () => {
  process.env.METRICS_TOKEN = 'secret-token';
  const app = await startApp(registerCoreRoutes, buildCtx());
  try {
    const res = await fetch(app.baseUrl + '/api/internal/metrics?format=prometheus', {
      headers: { authorization: 'Bearer secret-token' }
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/plain/);
    assert.equal(await res.text(), 'rabbit_up 1\n');
  } finally {
    delete process.env.METRICS_TOKEN;
    await stopApp(app.server);
  }
});

test('GET /api/internal/metrics rejeita um Bearer inválido', async () => {
  process.env.METRICS_TOKEN = 'secret-token';
  const app = await startApp(registerCoreRoutes, buildCtx());
  try {
    const res = await fetch(app.baseUrl + '/api/internal/metrics', {
      headers: { authorization: 'Bearer wrong-token' }
    });
    assert.ok(res.status === 401 || res.status === 403, 'esperado 401/403, obtido ' + res.status);
  } finally {
    delete process.env.METRICS_TOKEN;
    await stopApp(app.server);
  }
});

function withUser(user) {
  return (req, res, next) => {
    req.dashboardUser = user;
    next();
  };
}

test('GET/PATCH /api/config exigem o bot owner (config global)', async () => {
  const guildAdmin = { role: 'USER', permissions: { canEditConfig: true }, selectedGuildId: '111111111111111111' };
  const app = await startApp(registerCoreRoutes, buildCtx({ requireDashboardAuth: withUser(guildAdmin) }));
  try {
    const getRes = await fetch(app.baseUrl + '/api/config');
    assert.equal(getRes.status, 403);
    const patchRes = await fetch(app.baseUrl + '/api/config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trust: { base: 10 } })
    });
    assert.equal(patchRes.status, 403);
  } finally {
    await stopApp(app.server);
  }

  const admin = await startApp(registerCoreRoutes, buildCtx({ requireDashboardAuth: withUser({ role: 'BOT_ADMIN' }) }));
  try {
    const res = await fetch(admin.baseUrl + '/api/config');
    assert.equal(res.status, 403);
  } finally {
    await stopApp(admin.server);
  }

  const owner = await startApp(registerCoreRoutes, buildCtx({ requireDashboardAuth: withUser({ role: 'BOT_OWNER' }) }));
  try {
    const res = await fetch(owner.baseUrl + '/api/config');
    assert.equal(res.status, 200);
  } finally {
    await stopApp(owner.server);
  }
});

test('GET /api/overview só agrega as guilds acessíveis ao utilizador', async () => {
  const guilds = new Map([
    ['111111111111111111', { id: '111111111111111111', memberCount: 10 }],
    ['222222222222222222', { id: '222222222222222222', memberCount: 90 }]
  ]);
  let countQuery = null;
  const Infraction = {
    countDocuments: (q) => {
      countQuery = q;
      return { exec: async () => 3 };
    }
  };
  const user = { role: 'USER', selectedGuildId: '111111111111111111', allowedGuildIds: [] };
  const app = await startApp(
    registerCoreRoutes,
    buildCtx({
      requireDashboardAuth: withUser(user),
      getClient: () => ({ guilds: { cache: guilds } }),
      Infraction
    })
  );
  try {
    const body = await (await fetch(app.baseUrl + '/api/overview')).json();
    assert.equal(body.guilds, 1);
    assert.equal(body.users, 10);
    assert.deepEqual(countQuery.guildId, { $in: ['111111111111111111'] });
  } finally {
    await stopApp(app.server);
  }
});
