// src/dashboard.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config/defaultConfig');
let DashboardLog = null;

// Tenta carregar o model (pode falhar se o ficheiro não existir)
try {
  DashboardLog = require('./database/models/DashboardLog');
} catch (e) {
  console.warn('[Dashboard] DashboardLog model not loaded (did you create src/database/models/DashboardLog.js?)');
}

const app = express();
const server = http.createServer(app);

// Socket.IO com CORS mais permissivo (Railway/Browser)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Logs em memória (para live + fallback)
const MAX_MEMORY_LOGS = config.dashboard?.maxLogs ?? 200;
let logsCache = [];

/**
 * ------------------------------
 * Auth (Token)
 * - Se DASHBOARD_TOKEN existir: exige token
 * - Se não existir: dashboard fica “aberta” (não recomendado)
 * ------------------------------
 */
function isAuthEnabled() {
  return Boolean(process.env.DASHBOARD_TOKEN);
}

function extractToken(req) {
  // 1) Header: Authorization: Bearer <token>
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  // 2) Header: x-dashboard-token: <token>
  const x = req.headers['x-dashboard-token'];
  if (typeof x === 'string' && x.trim()) return x.trim();

  // 3) Query: ?token=<token> (não recomendado, mas útil para debug)
  if (typeof req.query.token === 'string' && req.query.token.trim()) return req.query.token.trim();

  return null;
}

function requireDashboardAuth(req, res, next) {
  if (!isAuthEnabled()) return next();

  const token = extractToken(req);
  if (!token || token !== process.env.DASHBOARD_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  next();
}

/**
 * ------------------------------
 * Static files (public)
 * ------------------------------
 */
app.use(express.static(path.join(__dirname, '../public')));

/**
 * Health check simples
 * (se quiseres “health real”, fazemos num próximo ponto)
 */
app.get('/health', (req, res) => {
  res.status(200).send('Bot is running ✅');
});

/**
 * ------------------------------
 * API: GET /api/logs
 * - retorna logs do Mongo (se existir)
 * - filtros:
 *   - search: procura em title/description/user.tag/executor.tag
 *   - type: filtra por title (contains)
 *   - guildId: filtra por guild.id
 * - paginação:
 *   - page (1..)
 *   - limit (max 200)
 *
 * Auth:
 * - se DASHBOARD_TOKEN existir: obrigatório
 * ------------------------------
 */
app.get('/api/logs', requireDashboardAuth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limitRaw = parseInt(req.query.limit || '50', 10);
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    const search = (req.query.search || '').toString().trim();
    const type = (req.query.type || '').toString().trim().toLowerCase();
    const guildId = (req.query.guildId || '').toString().trim();

    // Se não tiver model (não criaste o ficheiro), usa cache em memória
    if (!DashboardLog) {
      // fallback simples (sem paginação real)
      let filtered = logsCache.slice();

      if (guildId) filtered = filtered.filter(l => l?.guild?.id === guildId);
      if (type) filtered = filtered.filter(l => (l.title || '').toLowerCase().includes(type));

      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(l =>
          (l.title || '').toLowerCase().includes(s) ||
          (l.description || '').toLowerCase().includes(s) ||
          (l.user?.tag || '').toLowerCase().includes(s) ||
          (l.executor?.tag || '').toLowerCase().includes(s)
        );
      }

      filtered.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
      const start = (page - 1) * limit;
      const items = filtered.slice(start, start + limit);

      return res.json({
        ok: true,
        source: 'memory',
        page,
        limit,
        total: filtered.length,
        items
      });
    }

    // Mongo query
    const q = {};

    if (guildId) q['guild.id'] = guildId;
    if (type) q.title = { $regex: type, $options: 'i' };

    if (search) {
      q.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'user.tag': { $regex: search, $options: 'i' } },
        { 'executor.tag': { $regex: search, $options: 'i' } }
      ];
    }

    const total = await DashboardLog.countDocuments(q);
    const items = await DashboardLog
      .find(q)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      ok: true,
      source: 'mongo',
      page,
      limit,
      total,
      items
    });
  } catch (err) {
    console.error('[Dashboard] /api/logs error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

/**
 * ------------------------------
 * Socket.IO auth
 * - Se DASHBOARD_TOKEN existir, valida token em socket.handshake.auth.token
 * ------------------------------
 */
io.use((socket, next) => {
  if (!isAuthEnabled()) return next();

  const token = socket.handshake.auth?.token;
  if (token && token === process.env.DASHBOARD_TOKEN) return next();

  return next(new Error('Unauthorized'));
});

// Socket.io
io.on('connection', (socket) => {
  console.log('🔌 Dashboard client connected');

  // Envia cache em memória (rápido)
  socket.emit('logs', logsCache);

  socket.on('requestLogs', () => {
    socket.emit('logs', logsCache);
  });

  socket.on('disconnect', () => {
    console.log('❌ Dashboard client disconnected');
  });
});

/**
 * ------------------------------
 * Persistência no Mongo + Cache
 * ------------------------------
 */
async function saveLogToMongo(data) {
  if (!DashboardLog) return null;

  try {
    // Sanitiza (garante campos)
    const doc = await DashboardLog.create({
      title: data.title || 'Log',
      user: data.user || null,
      executor: data.executor || null,
      description: data.description || '',
      guild: data.guild || null,
      time: data.time || new Date().toISOString()
    });

    // Limpeza automática: manter só os últimos N (opcional)
    const maxDb = config.dashboard?.maxDbLogs ?? 1000;
    if (Number.isFinite(maxDb) && maxDb > 0) {
      const count = await DashboardLog.estimatedDocumentCount();
      if (count > maxDb) {
        const toDelete = count - maxDb;
        const oldest = await DashboardLog
          .find({})
          .sort({ createdAt: 1 })
          .limit(toDelete)
          .select('_id')
          .lean();

        if (oldest.length) {
          await DashboardLog.deleteMany({ _id: { $in: oldest.map(o => o._id) } });
        }
      }
    }

    return doc;
  } catch (err) {
    console.error('[Dashboard] Failed saving log to Mongo:', err?.message || err);
    return null;
  }
}

/**
 * Carrega cache inicial do Mongo (últimos X)
 * - para quando a dashboard abrir, já ter histórico imediato via socket emit
 */
async function loadInitialCacheFromMongo() {
  if (!DashboardLog) return;

  try {
    const limit = Math.min(Math.max(MAX_MEMORY_LOGS, 10), 500);
    const items = await DashboardLog.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // cache em memória deve estar do mais antigo -> mais recente (para render reverse no frontend)
    logsCache = items.reverse().map((x) => ({
      title: x.title,
      user: x.user,
      executor: x.executor,
      description: x.description,
      guild: x.guild,
      time: x.time || (x.createdAt ? new Date(x.createdAt).toISOString() : new Date().toISOString())
    }));

    console.log(`[Dashboard] Loaded ${logsCache.length} logs into memory cache`);
  } catch (err) {
    console.error('[Dashboard] Failed loading initial cache:', err);
  }
}

// tenta carregar cache (não bloqueia boot)
loadInitialCacheFromMongo().catch(() => null);

/**
 * ------------------------------
 * Função pública: sendToDashboard('log', data)
 * - mantém compatibilidade com o teu logger
 * ------------------------------
 */
function sendToDashboard(event, data) {
  if (event !== 'log') return;

  const payload = {
    ...data,
    time: data?.time ? new Date(data.time).toISOString() : new Date().toISOString()
  };

  // 1) guarda em memória
  logsCache.push(payload);
  if (logsCache.length > MAX_MEMORY_LOGS) logsCache.shift();

  // 2) emite em tempo real
  io.emit('logs', logsCache);

  // 3) persiste no Mongo (async, sem bloquear)
  saveLogToMongo(payload).catch(() => null);
}

module.exports = {
  app,
  server,
  sendToDashboard
};

