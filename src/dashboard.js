// src/dashboard.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
// ChannelType is used inside route modules (guilds/tickets), keep discord.js imports localized there.
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
const { registerUsersRoutes } = require('./dashboard/routes/users');
const { registerGuildsRoutes } = require('./dashboard/routes/guilds');
const { registerUserRoutes } = require('./dashboard/routes/user');
const { registerTrustRoutes } = require('./dashboard/routes/trust');
const { registerCoreRoutes } = require('./dashboard/routes/core');
const { registerCaseRoutes } = require('./dashboard/routes/case');
const { registerAuditRoutes } = require('./dashboard/routes/audit');
const { registerAdminRoutes } = require('./dashboard/routes/admin');
const { registerTempVoiceRoutes } = require('./dashboard/routes/tempVoice');

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
  // NOTE: zod's .url() is stricter than what many RSS endpoints accept in practice
  // (e.g., hostnames with underscores or other legacy formats). We validate protocol
  // and basic structure here and let the downstream fetcher fail gracefully if needed.
  feedUrl: z
    .string()
    .trim()
    .min(8)
    .max(2048)
    .refine((v) => /^https?:\/\/\S+$/i.test(v), { message: 'Invalid URL' }),
  feed: z
    .string()
    .trim()
    .min(8)
    .max(2048)
    .refine((v) => /^https?:\/\/\S+$/i.test(v), { message: 'Invalid URL' })
    .optional(),

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

app.use(express.static(path.join(__dirname, '../public'), {
  etag: true,
  // IMPORTANT: During active development / rapid deploys, aggressive maxAge caching breaks updates
  // (browsers keep stale JS and you end up with phantom syntax errors).
  maxAge: 0,
  setHeaders(res, filePath) {
    if (!filePath) return;

    // Never cache the HTML shell
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store');
      return;
    }

    // Never cache dashboard JS/CSS to avoid stale client bugs after deploy
    const fp = filePath.replace(/\/g, '/');
    if (/\/js\/.*\.js$/.test(fp) || /\/css\/.*\.css$/.test(fp)) {
      res.setHeader('Cache-Control', 'no-store');
      return;
    }

    // Default: allow revalidation
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

// ✅ Global rate limit for all /api routes
// Global API limiter: dashboard is behind auth; keep it high enough to avoid UX 429s
// when multiple panels refresh and the operator clicks actions quickly.
app.use('/api', rateLimit({ windowMs: 60_000, max: 300, keyPrefix: 'rl:api:' }));

registerCoreRoutes({
  app,
  requireDashboardAuth,
  rateLimit,
  recordAudit,
  getActorFromRequest,
  configManager,
  io,
  status,
  getClient: () => _client,
  Infraction
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

registerGuildsRoutes({
  app,
  requireDashboardAuth,
  getClient: () => _client,
  sanitizeId
});

registerUserRoutes({
  app,
  requireDashboardAuth,
  getClient: () => _client,
  warningsService,
  infractionsService,
  config,
  getTrustConfig,
  getTrustLabel,
  getEffectiveMuteDuration
});

registerTrustRoutes({
  app,
  requireDashboardAuth,
  UserModel,
  getTrustConfig,
  getTrustLabel
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

registerUsersRoutes({
  app,
  requireDashboardAuth,
  getClient: () => _client,
  sanitizeId,
  guildMembersLastFetch,
  infractionsService,
  TicketLogModel: TicketLog
});

registerCaseRoutes({
  app,
  requireDashboardAuth,
  sanitizeId,
  infractionsService,
  getClient: () => _client
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

registerAuditRoutes({
  app,
  requireDashboardAuth,
  DashboardAudit
});

registerAdminRoutes({
  app,
  express,
  requireDashboardAuth,
  rateLimit,
  fetchChannel,
  configManager,
  status,
  getClient: () => _client,
  getTrustConfig,
  getTrustLabel,
  getEffectiveMaxMessages,
  getEffectiveMuteDuration,
  logger
});

let TempVoiceChannel;
try {
  TempVoiceChannel = require('./database/models/TempVoiceChannel');
} catch (e) {
  console.warn('[Dashboard] TempVoiceChannel model not loaded (did you create src/database/models/TempVoiceChannel.js?)');
}

registerTempVoiceRoutes({
  app,
  requireDashboardAuth,
  sanitizeId,
  sanitizeText,
  GuildConfig,
  TempVoiceChannel
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