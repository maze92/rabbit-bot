// src/dashboard.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const status = require('./systems/status');
const config = require('./config/defaultConfig');
const configManager = require('./systems/configManager');

const warningsService = require('./systems/warningsService');
const infractionsService = require('./systems/infractionsService');
const logger = require('./systems/logger');
const dashboardBridge = require('./systems/dashboardBridge');
const { parseDuration, formatDuration } = require('./utils/time');
const { getTrustConfig, getTrustLabel } = require('./utils/trust');
const { isStaff } = require('./utils/staff');

let DashboardLog = null;
let GameNewsModel = null;
let UserModel = null;
let GuildConfig = null;


function getActorFromRequest(req) {
  if (!req) return null;
  const headerActor = (req.headers && (req.headers['x-dashboard-actor'] || req.headers['X-Dashboard-Actor'])) || null;
  const bodyActor = req.body && req.body.actor;
  const raw = (bodyActor || headerActor || '').toString().trim();
  if (!raw) return null;
  return raw.length > 64 ? raw.slice(0, 64) : raw;
}


try {
  GuildConfig = require('./database/models/GuildConfig');
} catch (e) {
  console.warn('[Dashboard] GuildConfig model not loaded (did you create src/database/models/GuildConfig.js?)');
}

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

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '256kb' }));

const allowedOrigins = (config.dashboard?.allowedOrigins && Array.isArray(config.dashboard.allowedOrigins)
  ? config.dashboard.allowedOrigins
  : (process.env.DASHBOARD_ORIGIN || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
);

if (!allowedOrigins.length) {
  console.warn('[Dashboard] No explicit CORS origins configured. Falling back to default Socket.IO behaviour.');
}

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : undefined,
    methods: ['GET', 'POST']
  }
});

const MAX_MEMORY_LOGS = config.dashboard?.maxLogs ?? 200; // initial, runtime may override
let logsCache = [];

let gameNewsStatusCache = [];

function isAuthEnabled() {
  const requireAuth = config.dashboard?.requireAuth;
  const shouldRequire = typeof requireAuth === 'boolean' ? requireAuth : true;
  const token = process.env.DASHBOARD_TOKEN;

  if (!shouldRequire) return false;

  if (!token) {
    console.warn('[Dashboard] dashboard.requireAuth=true mas DASHBOARD_TOKEN não está definido. Auth desativada por agora.');
    return false;
  }

  return true;
}

function extractToken(req) {
  if (!req || !req.headers) return null;

  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  const x = req.headers['x-dashboard-token'];
  if (typeof x === 'string' && x.trim()) return x.trim();

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

let _client = null;

function setClient(client) {
  _client = client;
}

app.use(express.static(path.join(__dirname, '../public')));

// ==============================
// Config + Guilds + User inspector
// ==============================

app.get('/api/guilds', requireDashboardAuth, async (req, res) => {
  try {
    if (!_client) return res.json({ ok: true, items: [] });
    const items = _client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name
    }));
    items.sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[Dashboard] /api/guilds error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.get('/api/config', requireDashboardAuth, (req, res) => {
  try {
    return res.json({
      ok: true,
      config: configManager.getPublicConfig(),
      schema: configManager.getEditableSchema()
    });
  } catch (err) {
    console.error('[Dashboard] /api/config error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.patch('/api/config', requireDashboardAuth, (req, res) => {
  try {
    const patch = req.body;
    const result = configManager.applyPatch(patch);
    if (!result.ok) return res.status(400).json(result);
    // push to clients
    io.emit('config', result.config);
    return res.json(result);
  } catch (err) {
    console.error('[Dashboard] /api/config patch error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.get('/api/user', requireDashboardAuth, async (req, res) => {
  try {
    const guildId = (req.query.guildId || '').toString().trim();
    const userId = (req.query.userId || '').toString().trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10) || 10, 1), 50);

    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }

    let discordUser = null;
    let discordMember = null;

    if (_client) {
      const g = _client.guilds.cache.get(guildId) || null;
      if (g) {
        discordMember = await g.members.fetch(userId).catch(() => null);
        discordUser = discordMember?.user || (await _client.users.fetch(userId).catch(() => null));
      }
    }

    const dbUser = await warningsService.getOrCreateUser(guildId, userId).catch(() => null);
    const infractions = await infractionsService.getRecentInfractions(guildId, userId, limit).catch(() => []);
    const counts = await infractionsService.countInfractionsByType(guildId, userId).catch(() => ({}));

    return res.json({
      ok: true,
      discord: {
        id: userId,
        tag: discordUser?.tag || null,
        username: discordUser?.username || null,
        avatarUrl: discordUser?.displayAvatarURL?.({ extension: 'png', size: 128 }) || null,
        createdAt: discordUser?.createdAt ? discordUser.createdAt.toISOString() : null,
        joinedAt: discordMember?.joinedAt ? discordMember.joinedAt.toISOString() : null,
        roles: discordMember?.roles?.cache?.map((r) => ({ id: r.id, name: r.name })) || []
      },
      db: dbUser
        ? {
            warnings: dbUser.warnings ?? 0,
            trust: dbUser.trust ?? null,
            lastInfractionAt: dbUser.lastInfractionAt ? new Date(dbUser.lastInfractionAt).toISOString() : null,
            lastTrustUpdateAt: dbUser.lastTrustUpdateAt ? new Date(dbUser.lastTrustUpdateAt).toISOString() : null
          }
        : null,
      counts,
      infractions
    });
  } catch (err) {
    console.error('[Dashboard] /api/user error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

// ==============================
// Trust summary (per guild / global)
// ==============================

app.get('/api/trust/summary', requireDashboardAuth, async (req, res) => {
  try {
    if (!UserModel) {
      return res.status(500).json({ ok: false, error: 'User model not available' });
    }

    const guildId = (req.query.guildId || '').toString().trim();
    const trustCfg = getTrustConfig();

    if (!trustCfg.enabled) {
      return res.json({
        ok: true,
        disabled: true,
        config: trustCfg,
        totalUsers: 0,
        buckets: { low: 0, medium: 0, high: 0 },
        topRisks: [],
        topSafe: []
      });
    }

    const baseQuery = {};
    if (guildId) baseQuery.guildId = guildId;

    const totalUsers = await UserModel.countDocuments(baseQuery);

    if (!totalUsers) {
      return res.json({
        ok: true,
        disabled: false,
        config: trustCfg,
        totalUsers: 0,
        buckets: { low: 0, medium: 0, high: 0 },
        topRisks: [],
        topSafe: []
      });
    }

    const lowCount = await UserModel.countDocuments({ ...baseQuery, trust: { $lte: trustCfg.lowThreshold } });
    const highCount = await UserModel.countDocuments({ ...baseQuery, trust: { $gte: trustCfg.highThreshold } });
    const mediumCount = Math.max(totalUsers - lowCount - highCount, 0);

    const topRiskDocs = await UserModel.find(baseQuery)
      .sort({ trust: 1, lastInfractionAt: -1 })
      .limit(15)
      .lean();

    const topSafeDocs = await UserModel.find(baseQuery)
      .sort({ trust: -1, lastInfractionAt: -1 })
      .limit(15)
      .lean();

    const topRisks = topRiskDocs.map((u) => ({
      userId: u.userId,
      guildId: u.guildId,
      trust: u.trust,
      warnings: u.warnings ?? 0,
      lastInfractionAt: u.lastInfractionAt,
      lastTrustUpdateAt: u.lastTrustUpdateAt,
      label: getTrustLabel(u.trust, trustCfg)
    }));

    const topSafe = topSafeDocs.map((u) => ({
      userId: u.userId,
      guildId: u.guildId,
      trust: u.trust,
      warnings: u.warnings ?? 0,
      lastInfractionAt: u.lastInfractionAt,
      lastTrustUpdateAt: u.lastTrustUpdateAt,
      label: getTrustLabel(u.trust, trustCfg)
    }));

    return res.json({
      ok: true,
      disabled: false,
      config: trustCfg,
      totalUsers,
      buckets: { low: lowCount, medium: mediumCount, high: highCount },
      topRisks,
      topSafe
    });
  } catch (err) {
    console.error('[Dashboard] /api/trust/summary error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

// ==============================
// Mod actions (Dashboard -> Bot)
// ==============================

async function resolveGuildMember(guildId, userId) {
  if (!_client) return { guild: null, member: null };
  const guild = _client.guilds.cache.get(guildId) || null;
  if (!guild) return { guild: null, member: null };
  const member = await guild.members.fetch(userId).catch(() => null);
  return { guild, member };
}

app.post('/api/mod/warn', requireDashboardAuth, async (req, res) => {
  try {
    const { guildId, userId, reason } = req.body || {};
    const actor = getActorFromRequest(req);
    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }

    if (!_client) {
      return res.status(500).json({ ok: false, error: 'Client not ready' });
    }

    const r = (reason || '').toString().trim() || 'Dashboard warning';

    const { guild, member } = await resolveGuildMember(guildId, userId);
    if (!guild || !member) {
      return res.status(404).json({ ok: false, error: 'User not found in guild' });
    }

    const me = guild.members.me;
    if (!me) {
      return res.status(500).json({ ok: false, error: 'Bot member not available' });
    }

    // Regras semelhantes ao comando !warn
    if (member.id === me.id) {
      return res.status(400).json({ ok: false, error: 'Cannot warn the bot' });
    }

    if (member.roles.highest.position >= me.roles.highest.position) {
      return res.status(400).json({ ok: false, error: 'Target role is higher or equal to bot' });
    }

    if (member.permissions.has(require('discord.js').PermissionsBitField.Flags.Administrator)) {
      return res.status(400).json({ ok: false, error: 'Cannot warn administrators via dashboard' });
    }

    const dbUser = await warningsService.addWarning(guild.id, member.id, 1).catch(() => null);

    await infractionsService.create({
      guild,
      user: member.user,
      moderator: _client.user,
      type: 'WARN',
      reason: actor ? `${r} (dashboard: ${actor})` : r,
      duration: null
    }).catch(() => null);

    const trustCfg = getTrustConfig();
    const trust = dbUser?.trust;
    const warnings = dbUser?.warnings ?? null;

    const trustText = (trustCfg.enabled && trust != null)
      ? `Trust: **${trust}/${trustCfg.max}**`
      : (trust != null ? `Trust: **${trust}**` : '');
    const warnsText = warnings != null ? `Warnings: **${warnings}**` : '';

    const trustTextLog = trustText ? `\n${trustText}` : '';
    const warnsTextLog = warnsText ? `\n${warnsText}` : '';

    await logger(
      _client,
      'Dashboard Warn',
      member.user,
      _client.user,
      `Reason: **${r}**${warnsTextLog}${trustTextLog}` + (actor ? `\nExecutor (dashboard): **${actor}**` : ''),
      guild
    );

    return res.json({ ok: true, dbUser: dbUser ? { warnings: dbUser.warnings, trust: dbUser.trust } : null });
  } catch (err) {
    console.error('[Dashboard] /api/mod/warn error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.post('/api/mod/mute', requireDashboardAuth, async (req, res) => {
  try {
    const { guildId, userId, duration, reason } = req.body || {};
    const actor = getActorFromRequest(req);
    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }

    if (!_client) {
      return res.status(500).json({ ok: false, error: 'Client not ready' });
    }

    const r = (reason || '').toString().trim() || 'Dashboard mute';
    const parsed = parseDuration((duration || '').toString().trim());
    const durationMs = parsed || config.muteDuration || 10 * 60 * 1000;

    const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > MAX_TIMEOUT_MS) {
      return res.status(400).json({ ok: false, error: 'Duration too long (max 28d).' });
    }

    const { guild, member } = await resolveGuildMember(guildId, userId);
    if (!guild || !member) {
      return res.status(404).json({ ok: false, error: 'User not found in guild' });
    }

    const me = guild.members.me;
    if (!me) {
      return res.status(500).json({ ok: false, error: 'Bot member not available' });
    }

    if (member.id === me.id) {
      return res.status(400).json({ ok: false, error: 'Cannot mute the bot' });
    }

    if (member.roles.highest.position >= me.roles.highest.position) {
      return res.status(400).json({ ok: false, error: 'Target role is higher or equal to bot' });
    }

    if (!member.moderatable) {
      return res.status(400).json({ ok: false, error: 'Member is not moderatable by the bot' });
    }

    await member.timeout(durationMs, `Muted by dashboard: ${r}`).catch((e) => {
      throw new Error(e?.message || 'Failed to timeout');
    });

    const dbUser = await warningsService.applyMutePenalty(guild.id, member.id).catch(() => null);

    const trustCfg = getTrustConfig();
    const trust = dbUser?.trust;
    const trustText = (trustCfg.enabled && trust != null)
      ? `Trust: **${trust}/${trustCfg.max}**`
      : (trust != null ? `Trust: **${trust}**` : '');

    await infractionsService.create({
      guild,
      user: member.user,
      moderator: _client.user,
      type: 'MUTE',
      reason: actor ? `${r} (dashboard: ${actor})` : r,
      duration: durationMs
    }).catch(() => null);

    const trustTextLog = trustText ? `\n${trustText}` : '';
    await logger(
      _client,
      'Dashboard Mute',
      member.user,
      _client.user,
      `Duration: **${formatDuration(durationMs)}**\nReason: **${r}**${trustTextLog}` + (actor ? `\nExecutor (dashboard): **${actor}**` : ''),
      guild
    );

    return res.json({ ok: true, durationMs, durationLabel: formatDuration(durationMs) });
  } catch (err) {
    console.error('[Dashboard] /api/mod/mute error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal Server Error' });
  }
});

app.post('/api/mod/unmute', requireDashboardAuth, async (req, res) => {
  try {
    const { guildId, userId, reason } = req.body || {};
    const actor = getActorFromRequest(req);
    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }

    if (!_client) {
      return res.status(500).json({ ok: false, error: 'Client not ready' });
    }

    const r = (reason || '').toString().trim() || 'Dashboard unmute';

    const { guild, member } = await resolveGuildMember(guildId, userId);
    if (!guild || !member) {
      return res.status(404).json({ ok: false, error: 'User not found in guild' });
    }

    const me = guild.members.me;
    if (!me) {
      return res.status(500).json({ ok: false, error: 'Bot member not available' });
    }

    if (member.roles.highest.position >= me.roles.highest.position) {
      return res.status(400).json({ ok: false, error: 'Target role is higher or equal to bot' });
    }

    await member.timeout(null, `Unmuted by dashboard: ${r}`).catch((e) => {
      throw new Error(e?.message || 'Failed to remove timeout');
    });

    await logger(
      _client,
      'Dashboard Unmute',
      member.user,
      _client.user,
      `Reason: **${r}**` + (actor ? `\nExecutor (dashboard): **${actor}**` : ''),
      guild
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Dashboard] /api/mod/unmute error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal Server Error' });
  }
});

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
      uptimeSeconds: Math.floor(process.uptime()),
      metrics: {
        totalCommandsExecuted: s.totalCommandsExecuted,
        totalInfractionsCreated: s.totalInfractionsCreated,
        autoModActions: s.autoModActions,
        antiSpamActions: s.antiSpamActions
      }
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
// Guild configuration (per-server)
// ==============================

app.get('/api/guilds/:guildId/config', requireDashboardAuth, async (req, res) => {
  try {
    if (!GuildConfig) {
      return res.status(500).json({ ok: false, error: 'GuildConfig model not available' });
    }

    const guildId = req.params.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    const doc = await GuildConfig.findOne({ guildId }).lean().catch(() => null);
    if (!doc) {
      return res.json({
        ok: true,
        config: {
          guildId,
          logChannelId: null,
          staffRoleIds: []
        }
      });
    }

    return res.json({
      ok: true,
      config: {
        guildId: doc.guildId,
        logChannelId: doc.logChannelId || null,
        staffRoleIds: Array.isArray(doc.staffRoleIds) ? doc.staffRoleIds : []
      }
    });
  } catch (err) {
    console.error('[Dashboard] /api/guilds/:guildId/config GET error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.post('/api/guilds/:guildId/config', requireDashboardAuth, async (req, res) => {
  try {
    if (!GuildConfig) {
      return res.status(500).json({ ok: false, error: 'GuildConfig model not available' });
    }

    const guildId = req.params.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    const { logChannelId, staffRoleIds } = req.body || {};

    const payload = {
      guildId,
      logChannelId: logChannelId || null
    };

    if (Array.isArray(staffRoleIds)) {
      payload.staffRoleIds = staffRoleIds.map((id) => String(id));
    }

    const doc = await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      ok: true,
      config: {
        guildId: doc.guildId,
        logChannelId: doc.logChannelId || null,
        staffRoleIds: Array.isArray(doc.staffRoleIds) ? doc.staffRoleIds : []
      }
    });
  } catch (err) {
    console.error('[Dashboard] /api/guilds/:guildId/config POST error:', err);
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

// Export logs to CSV (supports same filters as /api/logs)
app.get('/api/logs/export.csv', requireDashboardAuth, async (req, res) => {
  try {
    const search = (req.query.search || '').toString().trim();
    const type = (req.query.type || '').toString().trim().toLowerCase();
    const guildId = (req.query.guildId || '').toString().trim();

    const csvEscape = (v) => {
      const s = String(v ?? '');
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    let items = [];

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
      items = filtered;
    } else {
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
      items = await DashboardLog.find(q).sort({ createdAt: -1 }).lean();
    }

    const header = ['time','guildId','guildName','title','userId','userTag','executorId','executorTag','description'];
    const rows = [header.join(',')];
    for (const l of items) {
      rows.push([
        csvEscape(l.time || l.createdAt || ''),
        csvEscape(l.guild?.id || ''),
        csvEscape(l.guild?.name || ''),
        csvEscape(l.title || ''),
        csvEscape(l.user?.id || ''),
        csvEscape(l.user?.tag || ''),
        csvEscape(l.executor?.id || ''),
        csvEscape(l.executor?.tag || ''),
        csvEscape(l.description || '')
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ozark-logs.csv"');
    return res.status(200).send(rows.join('\n'));
  } catch (err) {
    console.error('[Dashboard] /api/logs/export.csv error:', err);
    return res.status(500).send('Internal Server Error');
  }
});

// Cases API (Infractions with Case IDs)
app.get('/api/cases', requireDashboardAuth, async (req, res) => {
  try {
    const guildId = (req.query.guildId || '').toString().trim();
    if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10) || 25, 1), 100);

    const q = (req.query.q || '').toString().trim();
    const userId = (req.query.userId || '').toString().trim();
    const type = (req.query.type || '').toString().trim();

    const result = await infractionsService.searchCases({ guildId, q, userId, type, page, limit });
    return res.json({ ok: true, page, limit, total: result.total, items: result.items });
  } catch (err) {
    console.error('[Dashboard] /api/cases error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.get('/api/case', requireDashboardAuth, async (req, res) => {
  try {
    const guildId = (req.query.guildId || '').toString().trim();
    const caseId = (req.query.caseId || '').toString().trim();
    if (!guildId || !caseId) {
      return res.status(400).json({ ok: false, error: 'guildId and caseId are required' });
    }

    const item = await infractionsService.getCase(guildId, caseId);
    if (!item) return res.status(404).json({ ok: false, error: 'Case not found' });

    let userTag = null;
    let moderatorTag = null;

    if (_client) {
      const u = await _client.users.fetch(item.userId).catch(() => null);
      const m = await _client.users.fetch(item.moderatorId).catch(() => null);
      userTag = u?.tag || null;
      moderatorTag = m?.tag || null;
    }

    return res.json({
      ok: true,
      item: {
        ...item,
        userTag,
        moderatorTag
      }
    });
  } catch (err) {
    console.error('[Dashboard] /api/case error:', err);
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

  socket.emit('config', configManager.getPublicConfig());

  socket.on('requestLogs', () => {
    socket.emit('logs', logsCache);
  });

  socket.on('requestGameNewsStatus', () => {
    socket.emit('gamenews_status', Array.isArray(gameNewsStatusCache) ? gameNewsStatusCache : []);
  });

  socket.on('requestConfig', () => {
    socket.emit('config', configManager.getPublicConfig());
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
    const maxMem = config.dashboard?.maxLogs ?? MAX_MEMORY_LOGS;
    if (logsCache.length > maxMem) logsCache.shift();

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


// Registar função de envio no bridge (evita require circular com logger)
dashboardBridge.setSender(sendToDashboard);

module.exports = {
  app,
  server,
  sendToDashboard,
  setClient
};
