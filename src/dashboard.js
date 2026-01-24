// src/dashboard.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { ChannelType } = require('discord.js');

const status = require('./systems/status');
const config = require('./config/defaultConfig');
const configManager = require('./systems/configManager');

const warningsService = require('./systems/warningsService');
const infractionsService = require('./systems/infractionsService');
const logger = require('./systems/logger');
const { ModError, dashboardWarn } = require('./dashboard/modService');
const dashboardBridge = require('./systems/dashboardBridge');
const { parseDuration, formatDuration } = require('./utils/time');
const { getTrustConfig, getTrustLabel, getEffectiveMaxMessages, getEffectiveMuteDuration } = require('./utils/trust');
const { isStaff } = require('./utils/staff');

let DashboardLog = null;
let GameNewsModel = null;
let GameNewsFeed = null;
let UserModel = null;
let GuildConfig = null;
let DashboardAudit = null;
let TicketModel = null;
let Infraction = null;

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const DashboardUserModel = require('./database/models/DashboardUser');

const JWT_SECRET = process.env.DASHBOARD_JWT_SECRET || 'ozark-dashboard-change-me';

// ------------------------------
// Sanitização / hardening (dashboard)
// ------------------------------
function sanitizeText(value, { maxLen = 1000, stripHtml = true } = {}) {
  if (value === null || value === undefined) return '';
  let str = String(value);

  if (str.length > maxLen) str = str.slice(0, maxLen);

  // remove control chars
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // strip basic HTML tags to reduce XSS payloads in stored data
  if (stripHtml) {
    str = str.replace(/<[^>]*>/g, '');
  }

  return str.trim();
}

function sanitizeId(value) {
  const s = sanitizeText(value, { maxLen: 32, stripHtml: true });
  const digitsOnly = s.replace(/\D/g, '');
  return digitsOnly.slice(0, 20);
}

function safeAuditPayload(payload) {
  if (!payload) return null;
  try {
    const raw = JSON.stringify(payload);
    if (raw.length <= 5000) return payload;
    return { _trimmed: true, preview: raw.slice(0, 5000) };
  } catch {
    return { _unserializable: true };
  }
}





function getActorFromRequest(req) {
  if (!req) return null;
  const headerActor = (req.headers && (req.headers['x-dashboard-actor'] || req.headers['X-Dashboard-Actor'])) || null;
  const bodyActor = req.body && req.body.actor;
  const jwtActor = req.dashboardUser && req.dashboardUser.username;
  const raw = (jwtActor || bodyActor || headerActor || '').toString().trim();
  if (!raw) return null;
  return raw.length > 64 ? raw.slice(0, 64) : raw;
}

async function recordAudit({ req, action, guildId, targetUserId, actor, payload }) {
  if (!DashboardAudit) return;
  try {
    const ip = req?.ip || req?.connection?.remoteAddress || null;
    const ua = req?.headers?.['user-agent'] || null;

    await DashboardAudit.create({
      route: req?.path || req?.originalUrl || 'unknown',
      method: req?.method || 'UNKNOWN',
      actor: actor || null,
      action: action || null,
      guildId: guildId || null,
      targetUserId: targetUserId || null,
      ip,
      userAgent: ua,
      payload: safeAuditPayload(payload || null)
    });
  } catch (err) {
    console.error('[Dashboard] Failed to record audit log:', err);
  }
}


try {
  GuildConfig = require('./database/models/GuildConfig');
} catch (e) {
  console.warn('[Dashboard] GuildConfig model not loaded (did you create src/database/models/GuildConfig.js?)');
}

try {
  DashboardAudit = require('./database/models/DashboardAudit');
} catch (e) {
  console.warn('[Dashboard] DashboardAudit model not loaded (did you create src/database/models/DashboardAudit.js?)');
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
  GameNewsFeed = require('./database/models/GameNewsFeed');
} catch (e) {
  console.warn('[Dashboard] GameNewsFeed model not loaded (did you create src/database/models/GameNewsFeed.js?)');
}

try {
  UserModel = require('./database/models/User');
} catch (e) {
  console.warn('[Dashboard] User model not loaded (did you create src/database/models/User.js?)');
}

try {
  TicketModel = require('./database/models/Ticket');
} catch (e) {
  console.warn('[Dashboard] Ticket model not loaded (did you create src/database/models/Ticket.js?)');
}

try {
  Infraction = require('./database/models/Infraction');
} catch (e) {
  console.warn('[Dashboard] Infraction model not loaded (did you create src/database/models/Infraction.js?)');
}

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

app.use(express.json({ limit: '256kb' }));

const allowedOrigins = (Array.isArray(config.dashboard?.allowedOrigins) && config.dashboard.allowedOrigins.length > 0
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

let DASHBOARD_AUTH_MISCONFIG = false;

function isAuthEnabled() {
  const requireAuth = config.dashboard?.requireAuth;
  const shouldRequire = typeof requireAuth === 'boolean' ? requireAuth : true;

  // Se o requireAuth estiver a false, não aplicamos autenticação no dashboard.
  if (!shouldRequire) {
    DASHBOARD_AUTH_MISCONFIG = false;
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

/**
 * Decodes the dashboard auth token.
 * Supports:
 *  - JWT tokens (preferred)
 *  - Legacy static DASHBOARD_TOKEN (treated as ADMIN)
 */
async function decodeDashboardToken(rawToken) {
  if (!rawToken) return null;

  // Legacy static token path – keep for backwards compat.
  if (process.env.DASHBOARD_TOKEN && rawToken === process.env.DASHBOARD_TOKEN) {
    return {
      _id: null,
      username: 'env-token',
      role: 'ADMIN',
      permissions: {
        canViewLogs: true,
        canActOnCases: true,
        canManageTickets: true,
        canManageGameNews: true,
        canViewConfig: true,
        canEditConfig: true,
        canManageUsers: true
      }
    };
  }

  // JWT path
  try {
    const payload = jwt.verify(rawToken, JWT_SECRET);
    if (!payload || !payload.id) return null;
    const user = await DashboardUserModel.findById(payload.id).lean();
    if (!user) return null;
    return user;
  } catch (err) {
    return null;
  }
}

function requireDashboardAuth(req, res, next) {
  // Se a autenticação não estiver ativa (requireAuth === false),
  // permitimos o acesso livremente.
  if (!isAuthEnabled()) return next();

  const rawToken = extractToken(req);
  if (!rawToken) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  decodeDashboardToken(rawToken)
    .then((user) => {
      if (!user) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      req.dashboardUser = user;
      next();
    })
    .catch((err) => {
      console.error('[Dashboard] Auth error', err);
      return res.status(500).json({ ok: false, error: 'Auth error' });
    });
}

let _client = null;

function setClient(client) {
  _client = client;
}



// Simple in-memory rate limiter (per IP + route).
// Not a replacement for a dedicated gateway, but helps protect critical endpoints.
const _rateBuckets = new Map();

function rateLimit({ windowMs = 60_000, max = 30, keyPrefix = 'rl:' } = {}) {
  return (req, res, next) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const key = `${keyPrefix}${req.method}:${req.path}:${ip}`;
      const now = Date.now();

      let bucket = _rateBuckets.get(key);
      if (!bucket || now - bucket.start > windowMs) {
        bucket = { start: now, count: 0 };
      }

      bucket.count += 1;
      _rateBuckets.set(key, bucket);

      if (bucket.count > max) {
        return res.status(429).json({ ok: false, error: 'Too many requests' });
      }
    } catch (err) {
      console.error('[Dashboard] rateLimit error:', err);
    }

    next();
  };
}

app.use(express.static(path.join(__dirname, '../public')));

// ✅ Global rate limit for all /api routes
app.use('/api', rateLimit({ windowMs: 60_000, max: 100, keyPrefix: 'rl:api:' }));


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

// Overview metrics for dashboard
app.get('/api/overview', requireDashboardAuth, (req, res) => {
  try {
    if (!_client || !_client.guilds || !_client.guilds.cache) {
      return res.json({ ok: true, guilds: 0, users: 0, actions24h: 0 });
    }

    const guildsCache = _client.guilds.cache;
    const guilds = Array.from(guildsCache.values ? guildsCache.values() : guildsCache);
    const guildsCount = Array.isArray(guilds) ? guilds.length : (guildsCache.size || 0);

    let usersCount = 0;
    for (const g of guilds) {
      if (g && typeof g.memberCount === 'number') {
        usersCount += g.memberCount;
      }
    }

    const actions24h = 0; // Placeholder for now

    return res.json({ ok: true, guilds: guildsCount, users: usersCount, actions24h });
  } catch (err) {
    console.error('[Dashboard] /api/overview error (safe fallback):', err);
    return res.json({ ok: true, guilds: 0, users: 0, actions24h: 0 });
  }
});




// Guild metadata for dashboard UI (channels + roles)
app.get('/api/guilds/:guildId/meta', requireDashboardAuth, async (req, res) => {
  try {
    if (!_client) return res.json({ ok: true, channels: [], roles: [] });

    const guildId = sanitizeId(req.params.guildId);
    const guild = _client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ ok: false, error: 'Guild not found' });

    const channels = guild.channels?.cache
      ?.filter((c) => c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement))
      .map((c) => ({ id: c.id, name: c.name, type: c.type }))
      .sort((a, b) => a.name.localeCompare(b.name)) || [];

    const roles = guild.roles?.cache
      ?.filter((r) => r && r.id !== guild.id && !r.managed)
      .map((r) => ({ id: r.id, name: r.name, position: r.position }))
      .sort((a, b) => b.position - a.position) || [];

    return res.json({ ok: true, channels, roles });
  } catch (err) {
    console.error('[Dashboard] /api/guilds/:guildId/meta error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});


app.get('/api/guilds/:guildId/channels', requireDashboardAuth, async (req, res) => {
  try {
    if (!_client) return res.json({ ok: true, items: [] });

    const guildId = sanitizeId(req.params.guildId);
    if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

    const guild = _client.guilds.cache.get(guildId) || null;
    if (!guild) return res.status(404).json({ ok: false, error: 'Guild not found' });

    const items = guild.channels.cache
      .filter((ch) => ch && ch.isTextBased?.() && !ch.isDMBased?.())
      .map((ch) => ({ id: ch.id, name: ch.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[Dashboard] /api/guilds/:guildId/channels error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

// Guild members (for Users tab)
app.get('/api/guilds/:guildId/users', requireDashboardAuth, async (req, res) => {
  try {
    if (!_client) return res.json({ ok: true, items: [] });

    const guildId = sanitizeId(req.params.guildId);
    if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

    const guild = _client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ ok: false, error: 'Guild not found' });

    try {
      await guild.members.fetch();
    } catch (e) {
      console.warn('[Dashboard] Failed to fetch guild members (using cache only):', e?.message || e);
    }

    const items = guild.members.cache.map((m) => ({
      id: m.id,
      username: m.user?.username || null,
      discriminator: m.user?.discriminator || null,
      tag: m.user?.tag || null,
      bot: !!m.user?.bot,
      joinedAt: m.joinedAt || null,
      roles: m.roles?.cache
        ?.filter((r) => r && r.id !== guild.id)
        .map((r) => ({ id: r.id, name: r.name })) || []
    }));

    items.sort((a, b) => {
      const an = (a.username || '').toLowerCase();
      const bn = (b.username || '').toLowerCase();
      return an.localeCompare(bn);
    });

    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[Dashboard] /api/guilds/:guildId/users error:', err);
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

app.patch('/api/config', requireDashboardAuth, rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'rl:config:' }), async (req, res) => {
  try {
    await recordAudit({
      req,
      action: 'config.patch',
      guildId: null,
      targetUserId: null,
      actor: getActorFromRequest(req),
      payload: req.body || null
    });
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
    const rawUser = (req.query.userId || '').toString().trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10) || 10, 1), 50);

    if (!guildId || !rawUser) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }

    let resolvedUserId = null;
    let discordUser = null;
    let discordMember = null;

    if (_client) {
      const g = _client.guilds.cache.get(guildId) || null;
      if (g) {
        let candidate = rawUser;

        // Suporta mentions (<@123>, <@!123>)
        const mentionMatch = rawUser.match(/<@!?([0-9]{10,20})>/);
        if (mentionMatch) {
          candidate = mentionMatch[1];
        }

        // Se for só dígitos, assume ID direto
        if (/^[0-9]{10,20}$/.test(candidate)) {
          resolvedUserId = candidate;
          discordMember = await g.members.fetch(candidate).catch(() => null);
          discordUser = discordMember?.user || (await _client.users.fetch(candidate).catch(() => null));
        } else {
          // Pesquisa por nome / tag dentro da guild
          const coll = await g.members.fetch({ query: candidate, limit: 1 }).catch(() => null);
          const found = coll && coll.first ? coll.first() : null;
          if (found) {
            resolvedUserId = found.id;
            discordMember = found;
            discordUser = found.user;
          }
        }
      }
    }

    if (!resolvedUserId) {
      return res.status(404).json({ ok: false, error: 'User not found in guild (by ID/mention/name).' });
    }

    const dbUser = await warningsService.getOrCreateUser(guildId, resolvedUserId).catch(() => null);
    const infractions = await infractionsService.getRecentInfractions(guildId, resolvedUserId, limit).catch(() => []);
    const counts = await infractionsService.countInfractionsByType(guildId, resolvedUserId).catch(() => ({}));

    return res.json({
      ok: true,
      discord: {
        id: resolvedUserId,
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

app.post('/api/mod/warn', requireDashboardAuth, rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'rl:mod:warn:' }), async (req, res) => {
  try {
    const { guildId: g0, userId: u0, reason: r0 } = req.body || {};
    const guildId = sanitizeId(g0);
    const userId = sanitizeId(u0);
    const reason = sanitizeText(r0, { maxLen: 1000, stripHtml: true });
    const actor = getActorFromRequest(req);

    await recordAudit({
      req,
      action: 'mod.warn',
      guildId,
      targetUserId: userId,
      actor,
      payload: { reason }
    });

    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }

    if (!_client) {
      return res.status(500).json({ ok: false, error: 'Client not ready' });
    }

    const result = await dashboardWarn({
      client: _client,
      guildId,
      userId,
      reason,
      actor
    });

    const dbUser = result && result.dbUser ? result.dbUser : null;

    return res.json({
      ok: true,
      dbUser: dbUser ? { warnings: dbUser.warnings, trust: dbUser.trust } : null
    });
  } catch (err) {
    console.error('[Dashboard] /api/mod/warn error:', err);

    if (err && err.code) {
      if (err.code === 'USER_NOT_FOUND_IN_GUILD') {
        return res.status(404).json({ ok: false, error: 'User not found in guild' });
      }
      if (err.code === 'BOT_MEMBER_NOT_AVAILABLE') {
        return res.status(500).json({ ok: false, error: 'Bot member not available' });
      }
      if (err.code === 'CANNOT_WARN_BOT') {
        return res.status(400).json({ ok: false, error: 'Cannot warn the bot' });
      }
      if (err.code === 'TARGET_ROLE_HIGHER_OR_EQUAL') {
        return res.status(400).json({ ok: false, error: 'Target role is higher or equal to bot' });
      }
      if (err.code === 'CANNOT_WARN_ADMINS') {
        return res.status(400).json({ ok: false, error: 'Cannot warn administrators via dashboard' });
      }
      if (err.code === 'CLIENT_NOT_READY') {
        return res.status(500).json({ ok: false, error: 'Client not ready' });
      }
    }

    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});
app.post('/api/mod/mute', requireDashboardAuth, rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'rl:mod:mute:' }), async (req, res) => {
  try {
    const { guildId: g0, userId: u0, duration: d0, reason: r0 } = req.body || {};
    const guildId = sanitizeId(g0);
    const userId = sanitizeId(u0);
    const duration = sanitizeText(d0, { maxLen: 32, stripHtml: true });
    const reason = sanitizeText(r0, { maxLen: 1000, stripHtml: true });
    const actor = getActorFromRequest(req);
    await recordAudit({
      req,
      action: 'mod.mute',
      guildId,
      targetUserId: userId,
      actor,
      payload: { reason }
    });
    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }

    if (!_client) {
      return res.status(500).json({ ok: false, error: 'Client not ready' });
    }

    const r = reason || 'Dashboard mute';
    const parsed = parseDuration(duration);
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
      duration: durationMs,
      source: 'dashboard'
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

app.post('/api/mod/unmute', requireDashboardAuth, rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'rl:mod:unmute:' }), async (req, res) => {
  try {
    const { guildId: g0, userId: u0, reason: r0 } = req.body || {};
    const guildId = sanitizeId(g0);
    const userId = sanitizeId(u0);
    const reason = sanitizeText(r0, { maxLen: 1000, stripHtml: true });
    const actor = getActorFromRequest(req);
    await recordAudit({
      req,
      action: 'mod.unmute',
      guildId,
      targetUserId: userId,
      actor,
      payload: { reason }
    });
    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }

    if (!_client) {
      return res.status(500).json({ ok: false, error: 'Client not ready' });
    }

    const r = reason || 'Dashboard unmute';

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

    const guildId = sanitizeId(req.params.guildId);
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
        dashboardLogChannelId: null,
        staffRoleIds: []
      }
    });
    }

    return res.json({
      ok: true,
      config: {
        guildId: doc.guildId,
        logChannelId: doc.logChannelId || null,
        dashboardLogChannelId: doc.dashboardLogChannelId || null,
        staffRoleIds: Array.isArray(doc.staffRoleIds) ? doc.staffRoleIds : []
      }
    });
  } catch (err) {
    console.error('[Dashboard] /api/guilds/:guildId/config GET error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.post('/api/guilds/:guildId/config', requireDashboardAuth, rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'rl:guildConfig:' }), async (req, res) => {
  try {
    if (!GuildConfig) {
      return res.status(500).json({ ok: false, error: 'GuildConfig model not available' });
    }

    const guildId = sanitizeId(req.params.guildId);
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    const { logChannelId, dashboardLogChannelId, staffRoleIds } = req.body || {};

    const payload = {
      guildId,
      logChannelId: sanitizeId(logChannelId) || null,
      dashboardLogChannelId: sanitizeId(dashboardLogChannelId) || null
    };

    if (Array.isArray(staffRoleIds)) {
      payload.staffRoleIds = staffRoleIds.map((id) => sanitizeId(id)).filter(Boolean);
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
        dashboardLogChannelId: doc.dashboardLogChannelId || null,
        staffRoleIds: Array.isArray(doc.staffRoleIds) ? doc.staffRoleIds : []
      }
    });
  } catch (err) {
    console.error('[Dashboard] /api/guilds/:guildId/config POST error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});



// ------------------------------
// Dashboard Auth API (JWT + roles)
// ------------------------------

app.post('/api/auth/login', express.json(), async (req, res) => {
  try {
    const { username, password } = req.body || {};
    console.log('[Dashboard Auth] Login attempt', username);
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'MISSING_CREDENTIALS' });
    }

    const envUser = process.env.DASHBOARD_ADMIN_USER;
    const envPass = process.env.DASHBOARD_ADMIN_PASS;

    let user = await DashboardUserModel.findOne({ username }).lean();

    // Se não existir user mas as credenciais batem certo com as envs, cria/admin padrão em runtime.
    if (!user && envUser && envPass && username === envUser && password === envPass) {
      const passwordHash = await bcrypt.hash(password, 10);
      const created = await DashboardUserModel.create({
        username,
        passwordHash,
        role: 'ADMIN',
        permissions: {
          canViewLogs: true,
          canActOnCases: true,
          canManageTickets: true,
          canManageGameNews: true,
          canViewConfig: true,
          canEditConfig: true,
          canManageUsers: true
        }
      });
      user = created.toObject();
      console.log('[Dashboard Auth] Created admin from env on login', username);
    }

    if (!user) {
      return res.status(401).json({ ok: false, error: 'INVALID_LOGIN' });
    }

    let match = false;
    try {
      match = await bcrypt.compare(password, user.passwordHash || '');
    } catch {
      match = false;
    }

    // Se o hash não coincidir mas as envs batem, atualiza o hash e permite login.
    if (!match && envUser && envPass && username === envUser && password === envPass) {
      const passwordHash = await bcrypt.hash(password, 10);
      await DashboardUserModel.updateOne({ _id: user._id }, { $set: { passwordHash } }).exec();
      match = true;
      console.log('[Dashboard Auth] Updated admin hash from env on login', username);
    }

    if (!match) {
      return res.status(401).json({ ok: false, error: 'INVALID_LOGIN' });
    }

    const payload = {
      id: user._id.toString(),
      role: user.role,
      permissions: user.permissions || {},
      username: user.username
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

    return res.json({
      ok: true,
      token
    });
  } catch (err) {
    console.error('[Dashboard Auth] login error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

app.get('/api/auth/me', requireDashboardAuth, async (req, res) => {
  const u = req.dashboardUser;
  if (!u) {
    return res.status(401).json({ ok: false, error: 'NO_USER' });
  }

  return res.json({
    ok: true,
    user: {
      id: u._id || null,
      username: u.username || 'env-token',
      role: u.role || 'ADMIN',
      permissions: u.permissions || {}
    }
  });
});

// Create / list users (ADMIN / canManageUsers only).
app.get('/api/auth/users', requireDashboardAuth, async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  const users = await DashboardUserModel.find({})
    .select('-passwordHash')
    .sort({ username: 1 })
    .lean();

  return res.json({ ok: true, users });
});

app.post('/api/auth/users', requireDashboardAuth, express.json(), async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  try {
    const { username, password, role, permissions } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });
    }

    const existing = await DashboardUserModel.findOne({ username }).lean();
    if (existing) {
      return res.status(409).json({ ok: false, error: 'USERNAME_EXISTS' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await DashboardUserModel.create({
      username,
      passwordHash,
      role: role === 'ADMIN' ? 'ADMIN' : 'MOD',
      permissions: permissions || {}
    });

    return res.json({
      ok: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (err) {
    console.error('[Dashboard Auth] create user error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

app.patch('/api/auth/users/:id', requireDashboardAuth, express.json(), async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  try {
    const userId = req.params.id;
    const { role, permissions } = req.body || {};

    const update = {};
    if (role && (role === 'ADMIN' || role === 'MOD')) {
      update.role = role;
    }
    if (permissions && typeof permissions === 'object') {
      update.permissions = permissions;
    }

    const updated = await DashboardUserModel.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true }
    ).select('-passwordHash');

    if (!updated) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    }

    return res.json({ ok: true, user: updated });
  } catch (err) {
    console.error('[Dashboard Auth] update user error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

app.delete('/api/auth/users/:id', requireDashboardAuth, async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  try {
    const userId = req.params.id;
    const existing = await DashboardUserModel.findById(userId).lean();
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    }

    await DashboardUserModel.deleteOne({ _id: userId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Dashboard Auth] delete user error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
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

app.post('/api/logs/clear', requireDashboardAuth, rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'rl:logs:clear:' }), async (req, res) => {
  try {
    await recordAudit({
      req,
      action: 'logs.clear',
      guildId: null,
      targetUserId: null,
      actor: getActorFromRequest(req),
      payload: null
    });

    if (DashboardLog) {
      await DashboardLog.deleteMany({});
    }

    logsCache = [];
    io.emit('logs', logsCache);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Dashboard] /api/logs/clear error:', err);
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
    const source = (req.query.source || '').toString().trim();

    const result = await infractionsService.searchCases({ guildId, q, userId, type, source, page, limit });
    return res.json({ ok: true, page, limit, total: result.total, items: result.items });
  } catch (err) {
    console.error('[Dashboard] /api/cases error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

// Clear all cases for a guild (dangerous; requires explicit action from dashboard)
app.post('/api/cases/clear', requireDashboardAuth, rateLimit({ windowMs: 60_000, max: 3, keyPrefix: 'rl:cases:clear:' }), async (req, res) => {
  try {
    const guildId = (req.body?.guildId || '').toString().trim();
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    await recordAudit({
      req,
      action: 'cases.clear',
      guildId,
      targetUserId: null,
      actor: getActorFromRequest(req),
      payload: null
    });

    const result = await infractionsService.clearCasesForGuild(guildId).catch(() => ({ deleted: 0 }));

    return res.json({ ok: true, deleted: result.deleted || 0 });
  } catch (err) {
    console.error('[Dashboard] /api/cases/clear error:', err);
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
    const guildId = sanitizeId(req.query.guildId || '');

    if (!GameNewsModel) {
      return res.json({
        ok: true,
        source: 'memory',
        items: Array.isArray(gameNewsStatusCache) ? gameNewsStatusCache : []
      });
    }

    // Prefer DB-managed feeds if available; fallback to static config
    let feeds = [];
    if (GameNewsFeed) {
      try {
        const q = guildId ? { guildId } : {};
        const docs = await GameNewsFeed.find(q).lean();
        feeds = docs.map((d) => ({
          guildId: d.guildId || null,
          name: d.name || 'Feed',
          feedUrl: d.feedUrl,
          channelId: d.channelId,
          logChannelId: d.logChannelId || null,
          enabled: d.enabled !== false,
          intervalMs: typeof d.intervalMs === 'number' ? d.intervalMs : null
        }));
      } catch (e) {
        console.error('[Dashboard] /api/gamenews-status: failed loading GameNewsFeed:', e?.message || e);
      }
    }

    if (!feeds.length && Array.isArray(config?.gameNews?.sources)) {
      feeds = config.gameNews.sources.map((s) => ({
        guildId: null,
        name: s.name,
        feedUrl: s.feed,
        channelId: s.channelId,
        logChannelId: null,
        enabled: true,
        intervalMs: null
      }));
    }

    const names = feeds.map((s) => s?.name).filter(Boolean);
    const docs = names.length ? await GameNewsModel.find({ source: { $in: names } }).lean() : [];

    const map = new Map();
    for (const d of docs) map.set(d.source, d);

    const items = feeds.map((s) => {
      const d = map.get(s.name);
      return {
        guildId: s.guildId || null,
        source: s.name,
        feedName: s.name,
        feedUrl: s.feedUrl,
        channelId: s.channelId,
        logChannelId: s.logChannelId || null,
        enabled: s.enabled !== false,
        intervalMs: typeof s.intervalMs === 'number' ? s.intervalMs : null,

        failCount: d?.failCount ?? 0,
        pausedUntil: d?.pausedUntil ?? null,
        lastSentAt: d?.lastSentAt ?? null,
        lastHashesCount: Array.isArray(d?.lastHashes) ? d.lastHashes.length : 0,

        updatedAt: d?.updatedAt ?? null
      };
    });

    return res.json({
      ok: true,
      source: GameNewsFeed ? (guildId ? 'mongo+feeds:guild' : 'mongo+feeds') : 'mongo+static',
      items
    });
  } catch (err) {
    console.error('[Dashboard] /api/gamenews-status error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});


// GameNews feeds configuration (for dashboard editor)
app.get('/api/gamenews/feeds', requireDashboardAuth, async (req, res) => {
  try {
    const guildId = sanitizeId(req.query.guildId || '');

    // If there is no GameNewsFeed model at all, fall back to static config feeds (read-only).
    if (!GameNewsFeed) {
      const items = Array.isArray(config?.gameNews?.sources)
        ? config.gameNews.sources.map((s, idx) => ({
            id: String(idx),
            guildId: null,
            name: s.name,
            feedUrl: s.feed,
            channelId: s.channelId,
            logChannelId: null,
            enabled: true,
            intervalMs: null
          }))
        : [];
      return res.json({ ok: true, items, source: 'static' });
    }

    // Load feeds for a guild when specified, else all.
    const q = guildId ? { guildId } : {};
    const docs = await GameNewsFeed.find(q).sort({ createdAt: 1 }).lean();

    const items = docs.map((d) => ({
      id: d._id.toString(),
      guildId: d.guildId || null,
      name: d.name || 'Feed',
      feedUrl: d.feedUrl,
      channelId: d.channelId,
      logChannelId: d.logChannelId || null,
      enabled: d.enabled !== false,
      intervalMs: typeof d.intervalMs === 'number' ? d.intervalMs : null
    }));

    return res.json({ ok: true, items, source: 'mongo' });
  } catch (err) {
    console.error('[Dashboard] /api/gamenews/feeds GET error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.post('/api/gamenews/feeds', requireDashboardAuth, rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'rl:gamenews:feeds:' }), async (req, res) => {
  try {
    if (!GameNewsFeed) {
      return res.status(503).json({ ok: false, error: 'GameNewsFeed model not available on this deployment.' });
    }

    const guildId = sanitizeId(req.body?.guildId || req.query.guildId || '');
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    const feeds = Array.isArray(req.body?.feeds) ? req.body.feeds : [];
    const sanitized = [];

    for (const f of feeds) {
      if (!f) continue;
      const name = sanitizeText(f.name || 'Feed', { maxLen: 64, stripHtml: true }) || 'Feed';
      const feedUrl = sanitizeText(f.feedUrl, { maxLen: 512, stripHtml: true });
      const channelId = sanitizeId(f.channelId);
      const logChannelId = sanitizeId(f.logChannelId) || null;
      const enabled = f.enabled !== false;

      const intervalRaw = Number(f.intervalMs ?? 0);
      const intervalMs = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : null;

      if (!feedUrl || !channelId) continue;
      sanitized.push({ guildId, name, feedUrl, channelId, logChannelId, enabled, intervalMs });
    }

    // Replace all docs for this guild only.
    await GameNewsFeed.deleteMany({ guildId });
    if (sanitized.length) {
      await GameNewsFeed.insertMany(sanitized);
    }

    const docs = await GameNewsFeed.find({ guildId }).sort({ createdAt: 1 }).lean();
    const items = docs.map((d) => ({
      id: d._id.toString(),
      guildId: d.guildId || null,
      name: d.name || 'Feed',
      feedUrl: d.feedUrl,
      channelId: d.channelId,
      logChannelId: d.logChannelId || null,
      enabled: d.enabled !== false,
      intervalMs: typeof d.intervalMs === 'number' ? d.intervalMs : null
    }));

    await recordAudit({
      req,
      action: 'gamenews.feeds.save',
      guildId,
      targetUserId: null,
      actor: getActorFromRequest(req),
      payload: { count: items.length }
    });

    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[Dashboard] /api/gamenews/feeds POST error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});


io.use(async (socket, next) => {
  try {
    if (!isAuthEnabled()) return next();

    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));

    // Accept BOTH: legacy env DASHBOARD_TOKEN and JWT tokens
    const user = await decodeDashboardToken(String(token).trim());
    if (!user) return next(new Error('Unauthorized'));

    socket.dashboardUser = user;
    return next();
  } catch (err) {
    console.error('[Dashboard] Socket auth error:', err);
    return next(new Error('Unauthorized'));
  }
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

// Tickets API (dashboard)
// ==============================
app.get('/api/tickets', requireDashboardAuth, async (req, res) => {
  try {
    if (!TicketModel) {
      return res.json({ ok: true, page: 1, limit: 0, total: 0, items: [] });
    }

    const guildId = (req.query.guildId || '').toString().trim();
    if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10) || 25, 1), 100);

    const statusRaw = (req.query.status || '').toString().trim().toUpperCase();
    const userId = (req.query.userId || '').toString().trim();

    const query = { guildId };
    if (statusRaw === 'OPEN' || statusRaw === 'CLOSED') {
      query.status = statusRaw;
    }
    if (userId) {
      query.userId = userId;
    }

    const total = await TicketModel.countDocuments(query);
    const items = await TicketModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({ ok: true, page, limit, total, items });
  } catch (err) {
    console.error('[Dashboard] /api/tickets error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});


app.post('/api/tickets/:ticketId/close', requireDashboardAuth, async (req, res) => {
  try {
    if (!TicketModel) {
      return res.status(503).json({ ok: false, error: 'Ticket model not available' });
    }

    const ticketId = (req.params.ticketId || '').toString().trim();
    const rawGuildId = (req.body?.guildId || '').toString().trim();

    if (!ticketId) {
      return res.status(400).json({ ok: false, error: 'ticketId is required' });
    }

    // Resolve ticket por ID
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ ok: false, error: 'Ticket not found' });
    }

    const guildId = rawGuildId || (ticket.guildId || '');
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    if (ticket.status === 'CLOSED') {
      return res.status(400).json({ ok: false, error: 'Ticket already closed' });
    }

    const actor = getActorFromRequest(req) || 'dashboard';

    ticket.status = 'CLOSED';
    ticket.closedAt = new Date();
    ticket.closedById = actor;
    await ticket.save();

    // Best-effort: sincronizar com o Discord
    try {
      if (_client) {
        const guild = _client.guilds.cache.get(guildId);
        const channelId = ticket.channelId;
        const userId = ticket.userId;

        if (guild && channelId) {
          const channel = guild.channels.cache.get(channelId);
          if (channel) {
            try {
              // Só tenta editar permissões se o userId parecer um ID de utilizador válido
              if (userId && /^[0-9]{10,20}$/.test(String(userId))) {
                await channel.permissionOverwrites.edit(String(userId), { SendMessages: false });
              }
            } catch (err) {
              console.warn('[Dashboard] Failed to update ticket channel overwrites:', err?.message || err);
            }

            try {
              if (!channel.name.startsWith('closed-')) {
                await channel.setName(`closed-${channel.name.substring(0, 80)}`);
              }
            } catch (err) {
              console.warn('[Dashboard] Failed to rename ticket channel:', err?.message || err);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Dashboard] Failed to sync ticket close to Discord:', err?.message || err);
    }

    await recordAudit({
      req,
      action: 'ticket.close',
      guildId,
      targetUserId: ticket.userId,
      actor,
      payload: { ticketId: ticket._id }
    });

    return res.json({ ok: true, item: ticket });
  } catch (err) {
    console.error('[Dashboard] /api/tickets/:ticketId/close error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

// Clear tickets for a guild (dashboard action)
app.post('/api/tickets/clear', requireDashboardAuth, rateLimit({ windowMs: 60_000, max: 3, keyPrefix: 'rl:tickets:clear:' }), async (req, res) => {
  try {
    if (!TicketModel) {
      return res.status(503).json({ ok: false, error: 'Ticket model not available' });
    }

    const guildId = (req.body?.guildId || '').toString().trim();
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    await recordAudit({
      req,
      action: 'tickets.clear',
      guildId,
      targetUserId: null,
      actor: getActorFromRequest(req),
      payload: null
    });

    const result = await TicketModel.deleteMany({ guildId });
    return res.json({ ok: true, deleted: result?.deletedCount || 0 });
  } catch (err) {
    console.error('[Dashboard] /api/tickets/clear error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

// Reply to a ticket from the dashboard
app.post('/api/tickets/:ticketId/reply', requireDashboardAuth, async (req, res) => {
  try {
    if (!TicketModel) {
      return res.status(503).json({ ok: false, error: 'Ticket model not available' });
    }

    const ticketId = (req.params.ticketId || '').toString().trim();
    const rawGuildId = (req.body?.guildId || '').toString().trim();
    const content = sanitizeText(req.body?.content || '', { maxLen: 2000, stripHtml: true });

    if (!ticketId) {
      return res.status(400).json({ ok: false, error: 'ticketId is required' });
    }
    if (!content) {
      return res.status(400).json({ ok: false, error: 'content is required' });
    }

    const ticket = await TicketModel.findById(ticketId).lean();
    if (!ticket) {
      return res.status(404).json({ ok: false, error: 'Ticket not found' });
    }

    const guildId = rawGuildId || (ticket.guildId || '');
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    if (!_client) {
      return res.status(503).json({ ok: false, error: 'Client not available' });
    }

    const guild = _client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ ok: false, error: 'Guild not found' });
    }

    const channelId = ticket.channelId;
    if (!channelId) {
      return res.status(404).json({ ok: false, error: 'Ticket channel not found' });
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased?.()) {
      return res.status(404).json({ ok: false, error: 'Ticket channel not found or not text-based' });
    }

    const actor = getActorFromRequest(req) || 'dashboard';
    const prefix = '[Dashboard reply]';

    await channel.send(`${prefix} ${content}`);

    try {
      await TicketModel.updateOne({ _id: ticketId }, { $set: { lastMessageAt: new Date() } });
    } catch (e) {
      console.warn('[Dashboard] Failed to update ticket lastMessageAt:', e?.message || e);
    }

    await recordAudit({
      req,
      action: 'ticket.reply',
      guildId,
      targetUserId: ticket.userId,
      actor,
      payload: { ticketId }
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Dashboard] /api/tickets/:ticketId/reply error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});
app.get('/api/audit/config', requireDashboardAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10) || 20, 1), 100);
    const guildId = (req.query.guildId || '').toString().trim();

    const query = {
      action: {
        $in: [
          'config.patch',
          'guildConfig.update',
          'logs.clear',
          'cases.clear',
          'tickets.clear'
        ]
      }
    };
    if (guildId) query.guildId = guildId;

    const items = await DashboardAudit.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[Dashboard] /api/audit/config error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});


// Dashboard-triggered self-test (no real punishments, only diagnostics)
app.post('/api/admin/selftest', requireDashboardAuth, express.json(), async (req, res) => {
  try {
    const u = req.dashboardUser;
    const perms = (u && u.permissions) || {};
    const isAdmin = u && u.role === 'ADMIN';

    if (!isAdmin && !perms.canViewConfig && !perms.canManageUsers) {
      return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
    }

    if (!_client) {
      return res.status(503).json({ ok: false, error: 'Bot client not ready' });
    }

    const body = req.body || {};
    const guildId = String(body.guildId || '').trim();
    const channelId = String(body.channelId || '').trim();

    if (!guildId || !channelId) {
      return res.status(400).json({ ok: false, error: 'MISSING_TARGET' });
    }

    const guild = await _client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ ok: false, error: 'GUILD_NOT_FOUND' });
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased?.()) {
      return res.status(400).json({ ok: false, error: 'CHANNEL_NOT_TEXT' });
    }

    const cfg = configManager.getPublicConfig();
    const automation = cfg.automation || {};
    const autoMute = automation.autoMute || {};
    const autoKick = automation.autoKick || {};
    const antiSpamCfg = cfg.antiSpam || {};
    const trustCfg = getTrustConfig();
    const gameNewsCfg = cfg.gameNews || {};

    const st = typeof status.getStatus === 'function' ? status.getStatus() : {};

    const baseMaxMessages = antiSpamCfg.maxMessages ?? 5;
    const baseMuteMs = antiSpamCfg.muteDurationMs ?? (30 * 60 * 1000);

    const lowTrust = trustCfg.lowThreshold;
    const highTrust = trustCfg.highThreshold;
    const baseTrust = trustCfg.base;

    const lowTrustMaxMsgs = getEffectiveMaxMessages(baseMaxMessages, trustCfg, lowTrust);
    const highTrustMaxMsgs = getEffectiveMaxMessages(baseMaxMessages, trustCfg, highTrust);
    const lowTrustMuteMs = getEffectiveMuteDuration(baseMuteMs, trustCfg, lowTrust);
    const highTrustMuteMs = getEffectiveMuteDuration(baseMuteMs, trustCfg, highTrust);

    const lines = [];
    lines.push('### 🧪 Self-test do bot de moderação');
    lines.push('');
    lines.push(`- Discord: **${st.discordReady ? 'online' : 'offline'}**`);
    lines.push(`- MongoDB: **${st.mongoConnected ? 'ligado' : 'desligado'}**`);
    lines.push(`- GameNews: **${st.gameNewsRunning && gameNewsCfg.enabled !== false ? 'ativo' : 'inativo'}**`);
    lines.push('');
    lines.push('**Moderação automática**');
    lines.push(`- Anti-spam: **${antiSpamCfg.enabled === false ? 'desativado' : 'ativado'}**`);
    lines.push(`- Sistema de confiança (Trust): **${trustCfg.enabled === false ? 'desativado' : 'ativado'}**`);
    lines.push(`- Auto-mute (base): **${autoMute.enabled ? 'ativado' : 'desativado'}** (dur. base ➜ ${Math.round(baseMuteMs / 60000)} min)`);
    lines.push(`- Auto-kick: **${autoKick.enabled ? 'ativado' : 'desativado'}** (infrações ➜ ${autoKick.infractionsToKick ?? 5})`);
    lines.push('');
    lines.push('**Simulação Trust / Anti-spam**');
    lines.push(`- Trust base: **${baseTrust}** (${getTrustLabel(baseTrust, trustCfg)})`);
    lines.push(`- Utilizador de baixo trust (${lowTrust}) teria limite de **${lowTrustMaxMsgs} msgs / ${Math.round(lowTrustMuteMs / 60000)} min** de mute.`);
    lines.push(`- Utilizador de alto trust (${highTrust}) teria limite de **${highTrustMaxMsgs} msgs / ${Math.round(highTrustMuteMs / 60000)} min** de mute.`);
    lines.push('');
    lines.push('> Este teste não aplica ações reais em utilizadores. Apenas valida o estado da ligação, da configuração e da lógica de Trust/Anti-spam.');
    await channel.send({ content: lines.join('\n') }).catch(() => null);

    // Registar também um log no sistema de logs / dashboard
    try {
      await logger(_client, 'Dashboard self-test', null, null, 'Dashboard self-test executado a partir da dashboard (sem ações reais em utilizadores).', guild);
    } catch (e) {
      console.error('[Dashboard] Failed to log self-test:', e);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Dashboard] /api/admin/selftest error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

// Test helper for log channels
app.post('/api/guilds/:guildId/test-log-channels', requireDashboardAuth, async (req, res) => {
  try {
    if (!_client) return res.status(503).json({ ok: false, error: 'Bot client not ready' });

    const guildId = (req.params.guildId || '').toString().trim();
    if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

    const guild = _client.guilds.cache.get(guildId) || null;
    if (!guild) return res.status(404).json({ ok: false, error: 'Guild not found' });

    const logChannelId = (req.body?.logChannelId || '').toString().trim();
    const dashboardLogChannelId = (req.body?.dashboardLogChannelId || '').toString().trim();

    const results = [];

    async function trySend(channelId, label) {
      if (!channelId) {
        results.push({ label, channelId: null, ok: false, error: 'No channel selected' });
        return;
      }
      const ch = guild.channels.cache.get(channelId);
      if (!ch || !ch.isTextBased?.()) {
        results.push({ label, channelId, ok: false, error: 'Channel not found or not text-based' });
        return;
      }

      try {
        await ch.send(`✅ [TESTE] Mensagem de teste do dashboard para **${label}**. Se estás a ver isto, está tudo OK.`);
        results.push({ label, channelId, ok: true });
      } catch (err) {
        results.push({ label, channelId, ok: false, error: String(err?.message || err) });
      }
    }

    await trySend(logChannelId, 'Canal de logs do bot');
    await trySend(dashboardLogChannelId, 'Canal de logs do dashboard');

    return res.json({ ok: true, results });
  } catch (err) {
    console.error('[Dashboard] test-log-channels error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

module.exports = {
  app,
  server,
  sendToDashboard,
  setClient,
  ensureDefaultDashboardAdmin
};

async function ensureDefaultDashboardAdmin() {
  try {
    const count = await DashboardUserModel.countDocuments({});
    if (count > 0) return;

    const username = process.env.DASHBOARD_ADMIN_USER;
    const password = process.env.DASHBOARD_ADMIN_PASS;

    if (!username || !password) {
      console.warn('[Dashboard Auth] No dashboard users exist and DASHBOARD_ADMIN_USER/PASS not set. You will need to create a user manually via Mongo.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await DashboardUserModel.create({
      username,
      passwordHash,
      role: 'ADMIN',
      permissions: {
        canViewLogs: true,
        canActOnCases: true,
        canManageTickets: true,
        canManageGameNews: true,
        canViewConfig: true,
        canEditConfig: true,
        canManageUsers: true
      }
    });

    console.log('[Dashboard Auth] Created default admin user', user.username);
  } catch (err) {
    console.error('[Dashboard Auth] Failed to ensure default admin', err);
  }
}