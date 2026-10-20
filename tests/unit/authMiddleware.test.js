// tests/unit/authMiddleware.test.js
// Testa o middleware de auth/RBAC extraído para src/dashboard/authMiddleware.js.
// Não valida JWT real: injeta um `jwt` falso.

const { test, ok, eq } = require('./_harness');
const { createAuthMiddleware } = require('../../src/dashboard/authMiddleware');

// sanitizeId mínimo equivalente ao da dashboard (apenas dígitos, máx. 20).
function sanitizeId(value) {
  const s = String(value == null ? '' : value).replace(/<[^>]*>/g, '').trim();
  return s.replace(/\D/g, '').slice(0, 20);
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; }
  };
}

function makeMw(opts) {
  const config = { dashboard: { requireAuth: opts && opts.requireAuth === false ? false : true } };
  return createAuthMiddleware({
    jwt: { verify: () => (opts && opts.payload) || ({ t: 'oauth', sub: '1' }) },
    JWT_SECRET: 'test-secret',
    sanitizeId,
    config
  });
}

// -----------------------------
// extractToken
// -----------------------------
test('extractToken lê o cookie dash_token', () => {
  const { extractToken } = makeMw();
  eq(extractToken({ headers: { cookie: 'foo=1; dash_token=abc123; bar=2' } }), 'abc123');
});

test('extractToken lê Authorization: Bearer', () => {
  const { extractToken } = makeMw();
  eq(extractToken({ headers: { authorization: 'Bearer xyz' } }), 'xyz');
});

test('extractToken lê x-dashboard-token e é null-safe', () => {
  const { extractToken } = makeMw();
  eq(extractToken({ headers: { 'x-dashboard-token': 'tok' } }), 'tok');
  eq(extractToken({ headers: {} }), null);
  eq(extractToken(null), null);
});

// -----------------------------
// requirePerm
// -----------------------------
test('requirePerm deixa passar quando a permissão existe', () => {
  const { requirePerm } = makeMw();
  const req = { dashboardUser: { permissions: { canViewLogs: true } } };
  const res = makeRes();
  let passed = false;
  requirePerm({ anyOf: ['canViewLogs'] })(req, res, () => { passed = true; });
  ok(passed, 'esperava next() quando a permissão existe');
  eq(res.statusCode, null);
});

test('requirePerm deixa o owner do bot ignorar permissões granulares', () => {
  const { requirePerm } = makeMw();
  const req = { dashboardUser: { role: 'BOT_OWNER', permissions: {} } };
  const res = makeRes();
  let passed = false;
  requirePerm({ anyOf: ['canManageUsers'] })(req, res, () => { passed = true; });
  ok(passed);
});

test('requirePerm não permite que um bot admin ignore permissões granulares', () => {
  const { requirePerm } = makeMw();
  const req = { dashboardUser: { role: 'BOT_ADMIN', permissions: {} } };
  const res = makeRes();
  requirePerm({ anyOf: ['canManageUsers'] })(req, res, () => { throw new Error('não devia passar'); });
  eq(res.statusCode, 403);
});

test('requirePerm não trata o perfil legado ADMIN como administrador do bot', () => {
  const { requirePerm } = makeMw();
  const req = { dashboardUser: { role: 'ADMIN', permissions: {} } };
  const res = makeRes();
  requirePerm({ anyOf: ['canManageUsers'] })(req, res, () => { throw new Error('não devia passar'); });
  eq(res.statusCode, 403);
});

test('decodeDashboardToken assume USER quando o token não define perfil', async () => {
  const { decodeDashboardToken } = makeMw({ payload: { t: 'oauth', sub: '1' } });
  const user = await decodeDashboardToken('token');
  eq(user.role, 'USER');
});

test('decodeDashboardToken promove a owner principal mesmo com um token antigo', async () => {
  const { decodeDashboardToken } = makeMw({
    payload: { t: 'oauth', sub: '810243963574550558', role: 'USER' }
  });
  const user = await decodeDashboardToken('token');
  eq(user.role, 'BOT_OWNER');
});

test('decodeDashboardToken preserves bot operator role in an unscoped session', async () => {
  const { decodeDashboardToken } = makeMw({
    payload: { t: 'oauth', sub: '1', role: 'BOT_OWNER', profile: 'UNSCOPED', selectedGuildId: null }
  });
  const user = await decodeDashboardToken('token');
  eq(user.role, 'BOT_OWNER');
  eq(user.selectedGuildId, null);
});

test('requirePerm devolve 403 quando falta a permissão', () => {
  const { requirePerm } = makeMw();
  const req = { dashboardUser: { permissions: {} } };
  const res = makeRes();
  requirePerm({ anyOf: ['canViewLogs'] })(req, res, () => { throw new Error('não devia passar'); });
  eq(res.statusCode, 403);
  eq(res.body.error, 'NO_PERMISSION');
});

test('requirePerm devolve 401 sem utilizador autenticado', () => {
  const { requirePerm } = makeMw();
  const res = makeRes();
  requirePerm({ anyOf: ['canViewLogs'] })({ dashboardUser: null }, res, () => { throw new Error('não devia passar'); });
  eq(res.statusCode, 401);
});

test('requirePerm sem anyOf apenas exige sessão válida', () => {
  const { requirePerm } = makeMw();
  const res = makeRes();
  let passed = false;
  requirePerm({})({ dashboardUser: { permissions: {} } }, res, () => { passed = true; });
  ok(passed);
});

test('requirePerm não bloqueia quando a auth está desativada', () => {
  const { requirePerm } = makeMw({ requireAuth: false });
  const res = makeRes();
  let passed = false;
  requirePerm({ anyOf: ['canViewLogs'] })({}, res, () => { passed = true; });
  ok(passed);
});

test('requireDashboardAuth não pode ser desativado em produção', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const { requireDashboardAuth } = makeMw({ requireAuth: false });
    const res = makeRes();
    requireDashboardAuth({ headers: {} }, res, () => { throw new Error('não devia passar'); });
    eq(res.statusCode, 401);
    eq(res.body.error, 'Unauthorized');
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

// -----------------------------
// requireGuildAccess
// -----------------------------
test('requireGuildAccess deixa passar a guild selecionada', () => {
  const { requireGuildAccess } = makeMw();
  const req = { dashboardUser: { selectedGuildId: '111', allowedGuildIds: [] }, params: { guildId: '111' } };
  const res = makeRes();
  let passed = false;
  requireGuildAccess()(req, res, () => { passed = true; });
  ok(passed);
});

test('requireGuildAccess exige seleção de guild quando não é opcional', () => {
  const { requireGuildAccess } = makeMw();
  const req = { dashboardUser: { selectedGuildId: null, allowedGuildIds: [] }, params: { guildId: '111' } };
  const res = makeRes();
  requireGuildAccess()(req, res, () => { throw new Error('não devia passar'); });
  eq(res.statusCode, 403);
  eq(res.body.error, 'NO_GUILD_SELECTED');
});

test('requireGuildAccess bloqueia guild diferente da selecionada', () => {
  const { requireGuildAccess } = makeMw();
  const req = { dashboardUser: { selectedGuildId: '111', allowedGuildIds: [] }, params: { guildId: '222' } };
  const res = makeRes();
  requireGuildAccess()(req, res, () => { throw new Error('não devia passar'); });
  eq(res.statusCode, 403);
  eq(res.body.error, 'NO_GUILD_SELECTED');
});

test('requireGuildAccess aplica a allow-list', () => {
  const { requireGuildAccess } = makeMw();
  const req = {
    dashboardUser: { selectedGuildId: null, allowedGuildIds: ['111'] },
    params: { guildId: '222' }
  };
  const res = makeRes();
  requireGuildAccess({ optional: true })(req, res, () => { throw new Error('não devia passar'); });
  eq(res.statusCode, 403);
  eq(res.body.error, 'NO_GUILD_ACCESS');
});

test('requireGuildAccess opcional passa quando não há guildId', () => {
  const { requireGuildAccess } = makeMw();
  const req = { dashboardUser: { selectedGuildId: '111', allowedGuildIds: [] }, query: { guildId: '' } };
  const res = makeRes();
  let passed = false;
  requireGuildAccess({ from: 'query', optional: true })(req, res, () => { passed = true; });
  ok(passed);
});

test('requireGuildAccess devolve 400 quando falta guildId e não é opcional', () => {
  const { requireGuildAccess } = makeMw();
  const req = { dashboardUser: { selectedGuildId: '111', allowedGuildIds: [] }, params: { guildId: '' } };
  const res = makeRes();
  requireGuildAccess()(req, res, () => { throw new Error('não devia passar'); });
  eq(res.statusCode, 400);
});
