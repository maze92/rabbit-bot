// src/dashboard.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const { ChannelType } = require('discord.js');
const helmet = require('helmet');
const cors = require('cors');
const { z } = require('zod');
const { fetchChannel } = require('./services/discordFetchCache');

const { registerAuthRoutes } = require('./dashboard/routes/auth');
const { registerGameNewsRoutes } = require('./dashboard/routes/gamenews');

const { registerModRoutes } = require('./dashboard/routes/mod');
const { registerConfigRoutes } = require('./dashboard/routes/config');
const { registerLogsRoutes } = require('./dashboard/routes/logs');
const { registerCasesRoutes } = require('./dashboard/routes/cases');
const { registerTicketsRoutes } = require('./dashboard/routes/tickets');

const status = require('./systems/status');
const config = require('./config/defaultConfig');
const configManager = require('./systems/configManager');
const gameNewsSystem = require('./systems/gamenews');

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
let TicketLog = null;
let Ticket = null;
let Infraction = null;

// In-memory cache para controlar fetch de membros por guild na dashboard
const guildMembersLastFetch = new Map();

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const DashboardUserModel = require('./database/models/DashboardUser');
const rateLimit = require('./systems/rateLimit');

// Single source of truth for dashboard role permissions.
// Reuse this everywhere instead of duplicating literals.
const ADMIN_PERMISSIONS = Object.freeze({
  canViewLogs: true,
  canActOnCases: true,
  canManageTickets: true,
  canManageGameNews: true,
  canViewConfig: true,
  canEditConfig: true,
  canManageUsers: true
});



if (process.env.NODE_ENV === 'production' && !process.env.DASHBOARD_JWT_SECRET) {
  console.warn('[Dashboard Auth] DASHBOARD_JWT_SECRET is not set in production. Please configure a strong secret.');
}

// Warn if legacy static DASHBOARD_TOKEN is being used in production.
if (process.env.NODE_ENV === 'production' && process.env.DASHBOARD_TOKEN) {
  console.warn('[Dashboard Auth] Legacy DASHBOARD_TOKEN is enabled in production. This is not recommended. Prefer JWT login with username/password or future Discord OAuth2.');
}

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


// ------------------------------
// Schemas Zod para payloads da dashboard
// ------------------------------

const GuildConfigSchema = z.object({
    logChannelId: z.string().regex(/^\d+$/).nullable().optional(),
    dashboardLogChannelId: z.string().regex(/^\d+$/).nullable().optional(),
    ticketThreadChannelId: z.string().regex(/^\d+$/).nullable().optional(),
    staffRoleIds: z.array(z.string().regex(/^\d+$/)).max(100).optional(),

    // Guild settings
    language: z.enum(['auto', 'pt', 'en']).optional(),
    timezone: z.string().max(64).nullable().optional()
  }).strict();

const ModMuteSchema = z.object({
  guildId: z.string().min(1).max(32),
  userId: z.string().min(1).max(32),
  duration: z.string().min(1).max(32).optional(),
  reason: z.string().max(1000).optional()
});

const ModWarnSchema = z.object({
  guildId: z.string().min(1).max(32),
  userId: z.string().min(1).max(32),
  reason: z.string().max(1000).optional()
});

const ModUnmuteSchema = z.object({
  guildId: z.string().min(1).max(32),
  userId: z.string().min(1).max(32),
  reason: z.string().max(1000).optional()
});

/**
 * Query validation schemas
 */
const CasesSearchQuerySchema = z.object({
  guildId: z.string().min(1).max(32),
  q: z.string().max(100).optional(),
  userId: z.string().max(32).optional(),
  type: z.string().max(32).optional(),
  source: z.string().max(32).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional()
});

const LogsQuerySchema = z.object({
  guildId: z.string().min(1).max(32),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional()
});

const GameNewsFeedSchema = z.object({
  name: z.string().trim().min(1).max(64),

  // canonical field is feedUrl; we still accept legacy "feed" and normalize on write
  feedUrl: z.string().trim().url().max(2048),
  feed: z.string().trim().url().max(2048).optional(),

  channelId: z.string().trim().min(10).max(32),
  logChannelId: z.string().trim().min(10).max(32).nullable().optional(),

  enabled: z.boolean().optional(),
  intervalMs: z.number().int().positive().max(7 * 24 * 60 * 60 * 1000).nullable().optional()
}).strict();







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
  TicketLog = require('./database/models/TicketLog');
} catch (e) {
  console.warn('[Dashboard] TicketLog model not loaded (did you create src/database/models/TicketLog.js?)');
}

try {
  Ticket = require('./database/models/Ticket');
} catch (e) {
  console.warn('[Dashboard] Ticket model not loaded (did you create src/database/models/Ticket.js?)');
}


try {
  Infraction = require('./database/models/Infraction');
} catch (e) {
  console.warn('[Dashboard] Infraction model not loaded (did you create src/database/models/Infraction.js?)');
}

const app = express();

const isProd = process.env.NODE_ENV === 'production';

// Enforce a strong JWT secret in production
if (isProd && (!process.env.DASHBOARD_JWT_SECRET || process.env.DASHBOARD_JWT_SECRET.length < 32)) {
  throw new Error('[Dashboard Auth] DASHBOARD_JWT_SECRET is missing or too weak in production. It must be at least 32 characters.');
}

const JWT_SECRET = process.env.DASHBOARD_JWT_SECRET || 'ozark-dashboard-change-me';

if (!isProd && !process.env.DASHBOARD_JWT_SECRET) {
  console.warn('[Dashboard Auth] Using default JWT secret in non-production. Set DASHBOARD_JWT_SECRET for better security.');
}


const server = http.createServer(app);

app.set('trust proxy', 1);

// Basic security headers for dashboard API
// We disable the default CSP for now to avoid breaking inline scripts/styles.
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

app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : undefined, credentials: false }));

app.use(express.json({ limit: '256kb' }));

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
 *  - JWT token issued by /api/auth/login
 */
async function decodeDashboardToken(rawToken) {
  if (!rawToken) return null;


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


// Serve UI explicitly at / to avoid any edge cases with platform routers/static defaults
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use(express.static(path.join(__dirname, '../public')));

// ✅ Global rate limit for all /api routes
// Global API limiter: dashboard is behind auth; keep it high enough to avoid UX 429s
// when multiple panels refresh and the operator clicks actions quickly.
app.use('/api', rateLimit({ windowMs: 60_000, max: 300, keyPrefix: 'rl:api:' }));


// ==============================
// Config + Guilds + User inspector
// ==============================

app.get('/api/guilds', requireDashboardAuth, async (req, res) => {
  try {
    if (!_client) return res.json({ ok: true, items: [] });
    const items = _client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: typeof g.memberCount === 'number'
        ? g.memberCount
        : (typeof g.approximateMemberCount === 'number' ? g.approximateMemberCount : null)
    }));
    items.sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[Dashboard] /api/guilds error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

// Overview metrics for dashboard
app.get('/api/overview', requireDashboardAuth, async (req, res) => {
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

    // Contar ações de moderação nas últimas 24h
    let actions24h = 0;
    try {
      if (Infraction && Infraction.countDocuments) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        actions24h = await Infraction.countDocuments({
          createdAt: { $gte: since }
        }).exec();
      }
    } catch (errCount) {
      console.error('[Dashboard] Failed to count infractions for overview:', errCount);
      actions24h = 0;
    }

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

    // Evitar spam ao gateway: só tentamos fetch completo de X em X minutos
    const now = Date.now();
    const last = guildMembersLastFetch.get(guildId) || 0;
    const shouldFetch =
      guild.members.cache.size < (guild.memberCount || guild.members.cache.size) &&
      now - last > 5 * 60 * 1000; // 5 minutos

    if (shouldFetch) {
      try {
        await guild.members.fetch();
        guildMembersLastFetch.set(guildId, Date.now());
      } catch (e) {
        console.warn('[Dashboard] Failed to fetch full member list for guild', guildId, e);
      }
    }

    const items = guild.members.cache.map((m) => ({
      id: m.id,
      username: m.user?.username || null,
      discriminator: m.user?.discriminator || null,
      tag: m.user?.tag || null,
      bot: !!m.user?.bot,
      joinedAt: m.joinedAt || null,
      roles: m.roles?.cache
        ?.filter((r) => r && r.id !== guild.id && r.id !== '1385619241235120169')
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




app.get('/api/guilds/:guildId/users/:userId/history', requireDashboardAuth, async (req, res) => {
  try {
    const guildId = sanitizeId(req.params.guildId);
    const userId = sanitizeId(req.params.userId);
    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }

    if (!infractionsService) {
      return res.status(503).json({ ok: false, error: 'Infractions service not available' });
    }

    const [infractions, counts, ticketDocs] = await Promise.all([
      infractionsService.getRecentInfractions(guildId, userId, 10),
      infractionsService.countInfractionsByType(guildId, userId),
      TicketLog
        ? TicketLog.find({ guildId, userId })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean()
        : Promise.resolve([])
    ]);

    const tickets = (ticketDocs || []).map((t) => ({
      ticketNumber: t.ticketNumber,
      createdAt: t.createdAt || null,
      closedAt: t.closedAt || null
    }));

    return res.json({
      ok: true,
      infractions: infractions || [],
      counts: counts || {},
      tickets
    });
  } catch (err) {
    console.error('[Dashboard] /api/guilds/:guildId/users/:userId/history error:', err);
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


    const trustCfg = getTrustConfig();
    const autoMuteCfg = (config.automation && config.automation.autoMute) || {};

    let trustLabel = null;
    let nextPenalty = null;

    if (dbUser && trustCfg && trustCfg.enabled !== false) {
      const trustValue = typeof dbUser.trust === 'number' ? dbUser.trust : trustCfg.base;

      try {
        trustLabel = getTrustLabel(trustValue, trustCfg);
      } catch {
        trustLabel = null;
      }

      try {
        const warnsCount = (counts && typeof counts.WARN === 'number') ? counts.WARN : 0;
        const warnsToMute = typeof autoMuteCfg.warnsToMute === 'number' ? autoMuteCfg.warnsToMute : 0;
        const baseMuteMs = typeof autoMuteCfg.muteDurationMs === 'number' ? autoMuteCfg.muteDurationMs : 10 * 60 * 1000;

        if (autoMuteCfg && autoMuteCfg.enabled !== false && warnsToMute > 0) {
          const remaining = Math.max(warnsToMute - warnsCount, 0);
          const effectiveMuteMs = getEffectiveMuteDuration(baseMuteMs, trustCfg, trustValue);
          const mins = Math.max(1, Math.round(effectiveMuteMs / 60000));

          nextPenalty = {
            automationEnabled: true,
            warnsCount,
            warnsToMute,
            remaining,
            estimatedMuteMinutes: mins
          };
        } else {
          nextPenalty = {
            automationEnabled: false
          };
        }
      } catch {
        nextPenalty = null;
      }
    }
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
            trustLabel,
            lastInfractionAt: dbUser.lastInfractionAt ? new Date(dbUser.lastInfractionAt).toISOString() : null,
            lastTrustUpdateAt: dbUser.lastTrustUpdateAt ? new Date(dbUser.lastTrustUpdateAt).toISOString() : null,
            nextPenalty
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


// Dashboard routes (modular)
registerAuthRoutes({
  app,
  express,
  requireDashboardAuth,
  DashboardUserModel,
  bcrypt,
  jwt,
  JWT_SECRET,
  sanitizeText,
  rateLimit,
  ADMIN_PERMISSIONS
});

registerGameNewsRoutes({
  app,
  requireDashboardAuth,
  rateLimit,
  GameNewsFeed,
  GameNewsModel,
  gameNewsSystem,
  sanitizeId,
  sanitizeText,
  getActorFromRequest,
  recordAudit,
  GameNewsFeedSchema,
  _getClient: () => _client
});

registerModRoutes({
  app,
  requireDashboardAuth,
  rateLimit,
  sanitizeId,
  sanitizeText,
  getActorFromRequest,
  recordAudit,
  ModWarnSchema,
  ModMuteSchema,
  parseDuration,
  formatDuration,
  config,
  dashboardWarn,
  resolveGuildMember: require('./dashboard/modService').resolveGuildMember,
  ModError,
  mongoose,
  logger,
  warningsService,
  infractionsService,
  _getClient: () => _client,
  _getModels: () => ({ Infraction, DashboardLog, TicketLog }),
  _getLogsCache: () => logsCache
});

registerConfigRoutes({
  app,
  requireDashboardAuth,
  rateLimit,
  sanitizeId,
  GuildConfig,
  GuildConfigSchema,
  config
});

registerLogsRoutes({
  app,
  requireDashboardAuth,
  rateLimit,
  sanitizeId,
  recordAudit,
  getActorFromRequest,
  LogsQuerySchema,
  _getModels: () => ({ DashboardLog, TicketLog }),
  _getLogsCache: () => logsCache,
  _setLogsCache: (next) => { logsCache = next; }
});

registerCasesRoutes({
  app,
  requireDashboardAuth,
  rateLimit,
  sanitizeId,
  recordAudit,
  getActorFromRequest,
  CasesSearchQuerySchema,
  _getModels: () => ({ Infraction })
});

registerTicketsRoutes({
  app,
  requireDashboardAuth,
  rateLimit,
  sanitizeText,
  getActorFromRequest,
  recordAudit,
  _getClient: () => _client,
  _getModels: () => ({ TicketModel: Ticket, TicketLogModel: TicketLog })
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




io.use(async (socket, next) => {
  try {
    if (!isAuthEnabled()) return next();

    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));

    // Accept dashboard JWT tokens for Socket.IO connections
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

    const channel = await fetchChannel(_client, channelId);
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


// ------------------------------
// Temporary Voice (config + active rooms)
// ------------------------------
let TempVoiceChannel;
try {
  TempVoiceChannel = require('./database/models/TempVoiceChannel');
} catch (e) {
  console.warn('[Dashboard] TempVoiceChannel model not loaded (did you create src/database/models/TempVoiceChannel.js?)');
}

app.get('/api/temp-voice/config', requireDashboardAuth, async (req, res) => {
  try {
    const guildId = sanitizeId(req.query.guildId || '');
    if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
    if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

    let cfg = await GuildConfig.findOne({ guildId }).lean();
    if (!cfg) {
      cfg = await GuildConfig.create({ guildId });
      cfg = cfg.toObject();
    }

    const tv = cfg.tempVoice || {};
    return res.json({
      ok: true,
      config: {
        enabled: tv.enabled === true,
        baseChannelIds: Array.isArray(tv.baseChannelIds) ? tv.baseChannelIds : [],
        categoryId: tv.categoryId || null,
        deleteDelaySeconds: typeof tv.deleteDelaySeconds === 'number' ? tv.deleteDelaySeconds : 10
      }
    });
  } catch (err) {
    console.error('[Dashboard] /api/temp-voice/config GET error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

app.post('/api/temp-voice/config', requireDashboardAuth, async (req, res) => {
  try {
    const guildId = sanitizeId(req.body.guildId || '');
    if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
    if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

    const u = req.dashboardUser;
    const perms = (u && u.permissions) || {};
    const isAdmin = u && u.role === 'ADMIN';
    if (!isAdmin && !perms.canEditConfig) {
      return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
    }

    const enabled = req.body.enabled === true || req.body.enabled === 'true';
    let baseChannelIds = req.body.baseChannelIds || [];
    if (typeof baseChannelIds === 'string') {
      baseChannelIds = baseChannelIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (!Array.isArray(baseChannelIds)) baseChannelIds = [];

    const categoryId = sanitizeText(req.body.categoryId || '', { maxLen: 32, stripHtml: true }) || null;
    let deleteDelaySeconds = parseInt(req.body.deleteDelaySeconds, 10);
    if (!Number.isFinite(deleteDelaySeconds) || deleteDelaySeconds < 2) deleteDelaySeconds = 10;

    const update = {
      tempVoice: {
        enabled,
        baseChannelIds,
        categoryId,
        deleteDelaySeconds
      }
    };

    const cfg = await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { new: true, upsert: true }
    ).lean();

    return res.json({
      ok: true,
      config: update.tempVoice
    });
  } catch (err) {
    console.error('[Dashboard] /api/temp-voice/config POST error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

app.get('/api/temp-voice/active', requireDashboardAuth, async (req, res) => {
  try {
    const guildId = sanitizeId(req.query.guildId || '');
    if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
    if (!TempVoiceChannel) return res.json({ ok: true, items: [] });

    const docs = await TempVoiceChannel.find({ guildId }).lean();
    const items = docs.map((d) => ({
      guildId: d.guildId,
      channelId: d.channelId,
      ownerId: d.ownerId,
      baseChannelId: d.baseChannelId,
      createdAt: d.createdAt
    }));

    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[Dashboard] /api/temp-voice/active GET error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
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
      permissions: ADMIN_PERMISSIONS
    });

    console.log('[Dashboard Auth] Created default admin user', user.username);
  } catch (err) {
    console.error('[Dashboard Auth] Failed to ensure default admin', err);
  }
}