// src/dashboard.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const status = require('./systems/status');
const config = require('./config/defaultConfig');
const { getPublicConfig, updateConfig } = require('./systems/configManager');

let DashboardLog = null;
let GameNewsModel = null;
let UserModel = null;
let InfractionModel = null;

let discordClient = null;

try {
  DashboardLog = require('./database/models/DashboardLog');
} catch (e) {
  console.warn('[Dashboard] DashboardLog model not loaded (did you create src/database/models/DashboardLog.js?)');
}

try {
  GameNewsModel = require('./database/models/GameNews');
} catch (e) {
  console.warn('[Dashboard] GameNews model not loaded (did you create src/database/models/GameNews.js?)');
}

try {
  UserModel = require('./database/models/User');
} catch (e) {
  console.warn('[Dashboard] User model not loaded (did you create src/database/models/User.js?)');
}

try {
  InfractionModel = require('./database/models/Infraction');
} catch (e) {
  console.warn('[Dashboard] Infraction model not loaded (did you create src/database/models/Infraction.js?)');
}

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '256kb' }));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const MAX_MEMORY_LOGS = config.dashboard?.maxLogs ?? 200;
let logsCache = [];

let gameNewsStatusCache = [];

function isAuthEnabled() {
  return Boolean(process.env.DASHBOARD_TOKEN);
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  const x = req.headers['x-dashboard-token'];
  if (typeof x === 'string' && x.trim()) return x.trim();
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

app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => {
  try {
    const s = status.getStatus();

    const discordReady = Boolean(s.discordReady);
    const mongoConnected = Boolean(s.mongoConnected);
    const gameNewsRunning = Boolean(s.gameNewsRunning);

    const payload = {
      ok: discordReady && mongoConnected,
      discordReady,
      mongoConnected,
      gameNewsRunning,
      uptimeSeconds: Math.floor(process.uptime())
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[Dashboard] /health error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Health check failed'
    });
  }
});

// ==============================
// Config API (editable runtime overrides)
// ==============================
app.get('/api/config', requireDashboardAuth, (req, res) => {
  try {
    return res.json({ ok: true, config: getPublicConfig() });
  } catch (err) {
    console.error('[Dashboard] /api/config error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.patch('/api/config', requireDashboardAuth, (req, res) => {
  try {
    const result = updateConfig(req.body || {});
    if (!result.ok) {
      return res.status(400).json(result);
    }

    io.emit('config', getPublicConfig());
    return res.json({ ok: true, applied: result.applied, config: getPublicConfig() });
  } catch (err) {
    console.error('[Dashboard] /api/config patch error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

// User inspector API (Mongo)
// ==============================
app.get('/api/user', requireDashboardAuth, async (req, res) => {
  try {
    const guildId = (req.query.guildId || '').toString().trim();
    const userId = (req.query.userId || '').toString().trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10) || 20, 1), 50);

    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required.' });
    }

    if (!UserModel || !InfractionModel) {
      return res.status(501).json({ ok: false, error: 'Database models not available.' });
    }

    const userDoc = await UserModel.findOne({ guildId, userId }).lean();
    const infractions = await InfractionModel.find({ guildId, userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const counts = await InfractionModel.aggregate([
      { $match: { guildId, userId } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const byType = {};
    for (const r of counts) {
      if (r?._id) byType[r._id] = r.count || 0;
    }

    // Discord live info (optional)
    let discord = null;
    if (discordClient) {
      const g = await discordClient.guilds.fetch(guildId).catch(() => null);
      if (g) {
        const m = await g.members.fetch(userId).catch(() => null);
        if (m) {
          discord = {
            tag: m.user?.tag || null,
            username: m.user?.username || null,
            displayName: m.displayName || null,
            joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
            createdAt: m.user?.createdAt ? m.user.createdAt.toISOString() : null,
            timedOutUntil: m.communicationDisabledUntil ? m.communicationDisabledUntil.toISOString() : null
          };
        }
      }
    }

    return res.json({
      ok: true,
      user: userDoc || null,
      counts: byType,
      infractions,
      discord
    });
  } catch (err) {
    console.error('[Dashboard] /api/user error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

// ==============================
// Moderation actions via Dashboard (requires DASHBOARD_TOKEN)
// ==============================
function requireClient(req, res, next) {
  if (!discordClient) return res.status(503).json({ ok: false, error: 'Discord client not ready.' });
  return next();
}

async function resolveGuildAndMember(guildId, userId) {
  const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { guild: null, member: null };
  const member = await guild.members.fetch(userId).catch(() => null);
  return { guild, member };
}

function parseDurationMs(input) {
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) return input;
  if (!input || typeof input !== 'string') return null;
  const match = input.trim().toLowerCase().match(/^([0-9]+)(s|m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (!value || value <= 0) return null;
  if (unit === 's') return value * 1000;
  if (unit === 'm') return value * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  if (unit === 'd') return value * 24 * 60 * 60 * 1000;
  return null;
}

app.post('/api/mod/warn', requireDashboardAuth, requireClient, async (req, res) => {
  try {
    const { guildId, userId, reason } = req.body || {};
    if (!guildId || !userId) return res.status(400).json({ ok: false, error: 'guildId and userId required.' });

    const { guild, member } = await resolveGuildAndMember(String(guildId), String(userId));
    if (!guild || !member) return res.status(404).json({ ok: false, error: 'Guild/member not found.' });

    const warningsService = require('./systems/warningsService');
    const infractionsService = require('./systems/infractionsService');
    const logger = require('./systems/logger');

    const r = (String(reason || '').trim() || 'Dashboard warn');
    const dbUser = await warningsService.addWarning(guild.id, member.id, 1).catch(() => null);

    await infractionsService.create({
      guild,
      user: member.user,
      moderator: discordClient.user,
      type: 'WARN',
      reason: r,
      duration: null
    }).catch(() => null);

    const trustText = dbUser?.trust != null ? `\nTrust: **${dbUser.trust}**` : '';
    const warnsText = dbUser?.warnings != null ? `\nWarnings: **${dbUser.warnings}**` : '';

    await logger(
      discordClient,
      'Dashboard Warn',
      member.user,
      discordClient.user,
      `Reason: **${r}**${warnsText}${trustText}`,
      guild
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Dashboard] /api/mod/warn error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.post('/api/mod/mute', requireDashboardAuth, requireClient, async (req, res) => {
  try {
    const { guildId, userId, duration, reason } = req.body || {};
    if (!guildId || !userId) return res.status(400).json({ ok: false, error: 'guildId and userId required.' });

    const durationMs = parseDurationMs(duration) || (config.muteDuration || 10 * 60 * 1000);
    const r = (String(reason || '').trim() || 'Dashboard mute');

    const { guild, member } = await resolveGuildAndMember(String(guildId), String(userId));
    if (!guild || !member) return res.status(404).json({ ok: false, error: 'Guild/member not found.' });

    const warningsService = require('./systems/warningsService');
    const infractionsService = require('./systems/infractionsService');
    const logger = require('./systems/logger');

    await member.timeout(durationMs, `Dashboard mute: ${r}`).catch(() => null);
    const dbUser = await warningsService.applyMutePenalty(guild.id, member.id).catch(() => null);

    await infractionsService.create({
      guild,
      user: member.user,
      moderator: discordClient.user,
      type: 'MUTE',
      reason: r,
      duration: durationMs
    }).catch(() => null);

    const trustText = dbUser?.trust != null ? `\nTrust after mute: **${dbUser.trust}/${config.trust?.max ?? 100}**` : '';
    await logger(
      discordClient,
      'Dashboard Mute',
      member.user,
      discordClient.user,
      `Duration: **${durationMs}ms**\nReason: **${r}**${trustText}`,
      guild
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Dashboard] /api/mod/mute error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.post('/api/mod/unmute', requireDashboardAuth, requireClient, async (req, res) => {
  try {
    const { guildId, userId, reason } = req.body || {};
    if (!guildId || !userId) return res.status(400).json({ ok: false, error: 'guildId and userId required.' });

    const r = (String(reason || '').trim() || 'Dashboard unmute');
    const { guild, member } = await resolveGuildAndMember(String(guildId), String(userId));
    if (!guild || !member) return res.status(404).json({ ok: false, error: 'Guild/member not found.' });

    const logger = require('./systems/logger');
    await member.timeout(null, `Dashboard unmute: ${r}`).catch(() => null);

    await logger(
      discordClient,
      'Dashboard Unmute',
      member.user,
      discordClient.user,
      `Reason: **${r}**`,
      guild
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Dashboard] /api/mod/unmute error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.get('/api/logs', requireDashboardAuth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limitRaw = parseInt(req.query.limit || '50', 10);
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    const search = (req.query.search || '').toString().trim();
    const type = (req.query.type || '').toString().trim().toLowerCase();
    const guildId = (req.query.guildId || '').toString().trim();

    if (!DashboardLog) {
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

app.get('/api/gamenews-status', requireDashboardAuth, async (req, res) => {
  try {
    if (!GameNewsModel) {
      return res.json({
        ok: true,
        source: 'memory',
        items: Array.isArray(gameNewsStatusCache) ? gameNewsStatusCache : []
      });
    }

    const sources = Array.isArray(config?.gameNews?.sources) ? config.gameNews.sources : [];
    const names = sources.map(s => s?.name).filter(Boolean);
    const docs = await GameNewsModel.find({ source: { $in: names } }).lean();

    const map = new Map();
    for (const d of docs) map.set(d.source, d);

    const items = sources.map((s) => {
      const d = map.get(s.name);
      return {
        source: s.name,
        feedName: s.name,
        feedUrl: s.feed,
        channelId: s.channelId,

        failCount: d?.failCount ?? 0,
        pausedUntil: d?.pausedUntil ?? null,
        lastSentAt: d?.lastSentAt ?? null,
        lastHashesCount: Array.isArray(d?.lastHashes) ? d.lastHashes.length : 0,

        updatedAt: d?.updatedAt ?? null
      };
    });

    return res.json({
      ok: true,
      source: 'mongo',
      items
    });
  } catch (err) {
    console.error('[Dashboard] /api/gamenews-status error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

io.use((socket, next) => {
  if (!isAuthEnabled()) return next();

  const token = socket.handshake.auth?.token;
  if (token && token === process.env.DASHBOARD_TOKEN) return next();

  return next(new Error('Unauthorized'));
});

io.on('connection', (socket) => {
  console.log('🔌 Dashboard client connected');

  socket.emit('logs', logsCache);

  socket.emit('gamenews_status', Array.isArray(gameNewsStatusCache) ? gameNewsStatusCache : []);

  // Send current editable config snapshot
  socket.emit('config', getPublicConfig());

  socket.on('requestLogs', () => {
    socket.emit('logs', logsCache);
  });

  socket.on('requestGameNewsStatus', () => {
    socket.emit('gamenews_status', Array.isArray(gameNewsStatusCache) ? gameNewsStatusCache : []);
  });

  socket.on('requestConfig', () => {
    socket.emit('config', getPublicConfig());
  });

  socket.on('requestConfig', () => {
    socket.emit('config', getPublicConfig());
  });

  socket.on('disconnect', () => {
    console.log('❌ Dashboard client disconnected');
  });
});

async function saveLogToMongo(data) {
  if (!DashboardLog) return null;

  try {
    const doc = await DashboardLog.create({
      title: data.title || 'Log',
      user: data.user || null,
      executor: data.executor || null,
      description: data.description || '',
      guild: data.guild || null,
      time: data.time || new Date().toISOString()
    });

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

async function loadInitialCacheFromMongo() {
  if (!DashboardLog) return;

  try {
    const limit = Math.min(Math.max(MAX_MEMORY_LOGS, 10), 500);
    const items = await DashboardLog.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

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

loadInitialCacheFromMongo().catch(() => null);

function sendToDashboard(event, data) {
  if (event === 'log') {
    const payload = {
      ...data,
      time: data?.time ? new Date(data.time).toISOString() : new Date().toISOString()
    };

    logsCache.push(payload);
    if (logsCache.length > MAX_MEMORY_LOGS) logsCache.shift();

    io.emit('logs', logsCache);

    saveLogToMongo(payload).catch(() => null);

    return;
  }

  if (event === 'gamenews_status') {
    const arr = Array.isArray(data) ? data : [];
    gameNewsStatusCache = arr;

    io.emit('gamenews_status', gameNewsStatusCache);
    return;
  }
}

function setClient(client) {
  discordClient = client;
}

module.exports = {
  app,
  server,
  sendToDashboard,
  setClient
};
