// src/dashboard.js

const express = require('express');
const http = require('http');
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
let UserActivityModel = null;
let PresenceSessionModel = null;
let GuildConfig = null;
let DashboardAudit = null;
let TicketLog = null;
let Ticket = null;
let Infraction = null;

// In-memory cache para controlar fetch de membros por guild na dashboard
const guildMembersLastFetch = new Map();

const jwt = require('jsonwebtoken');
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
  canManageUsers: false
});



if (process.env.NODE_ENV === 'production' && !process.env.DASHBOARD_JWT_SECRET) {
  console.warn('[Dashboard Auth] DASHBOARD_JWT_SECRET is not set in production. Please configure a strong secret.');
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

    // Optional: staff roles per feature (if empty, fallback to staffRoleIds)
    staffRolesByFeature: z
      .object({
        tickets: z.array(z.string().regex(/^\d+$/)).max(100).optional(),
        moderation: z.array(z.string().regex(/^\d+$/)).max(100).optional(),
        gamenews: z.array(z.string().regex(/^\d+$/)).max(100).optional(),
        logs: z.array(z.string().regex(/^\d+$/)).max(100).optional(),
        config: z.array(z.string().regex(/^\d+$/)).max(100).optional()
      })
      .partial()
      .optional(),

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

// Logs endpoint supports optional guildId (some panels show “select guild” states).
// Keep it permissive and validate semantics in the route when needed.
const LogsQuerySchema = z.object({
  guildId: z.string().min(1).max(32).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional()
}).passthrough();

// NOTE: This schema validates each feed item received from the dashboard.
// The UI may send forward-compatible fields (e.g., `language`).
// Do not reject payloads due to unknown keys; accept-and-ignore instead.
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
  intervalMs: z.number().int().positive().max(7 * 24 * 60 * 60 * 1000).nullable().optional(),

  // Optional forward-compatible field.
  language: z.string().trim().min(2).max(16).optional()
})
  // Accept unknown keys (dashboard may evolve). We will ignore what we don't persist.
  .passthrough();







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
  UserActivityModel = require('./database/models/UserActivity');
} catch (e) {
  console.warn('[Dashboard] UserActivity model not loaded (did you create src/database/models/UserActivity.js?)');
}

try {
  PresenceSessionModel = require('./database/models/PresenceSession');
} catch (e) {
  console.warn('[Dashboard] PresenceSession model not loaded (did you create src/database/models/PresenceSession.js?)');
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

// Behind Koyeb/Reverse proxies, Express needs "trust proxy" so req.ip
// reflects the real client (x-forwarded-for). This makes rate-limits and
// audit logs behave correctly.
// You can disable with TRUST_PROXY=false.
try {
  const trustProxyEnv = (process.env.TRUST_PROXY || '').toString().trim().toLowerCase();
  const shouldTrust = trustProxyEnv ? trustProxyEnv !== 'false' && trustProxyEnv !== '0' : (process.env.NODE_ENV === 'production');
  if (shouldTrust) app.set('trust proxy', 1);
} catch (_) {}

// Attach a lightweight request id for diagnostics.
// Helps correlate frontend errors with server logs.
app.use((req, res, next) => {
  try {
    const crypto = require('crypto');
    const rid = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(12).toString('hex');
    req.requestId = rid;
    res.setHeader('x-request-id', rid);
  } catch (e) {
    // no-op
  }
  next();
});

const isProd = process.env.NODE_ENV === 'production';

// Enforce a strong JWT secret in production
if (isProd && (!process.env.DASHBOARD_JWT_SECRET || process.env.DASHBOARD_JWT_SECRET.length < 32)) {
  throw new Error('[Dashboard Auth] DASHBOARD_JWT_SECRET is missing or too weak in production. It must be at least 32 characters.');
}

const JWT_SECRET = process.env.DASHBOARD_JWT_SECRET || 'rabbit-dashboard-change-me';

if (!isProd && !process.env.DASHBOARD_JWT_SECRET) {
  console.warn('[Dashboard Auth] Using default JWT secret in non-production. Set DASHBOARD_JWT_SECRET for better security.');
}


const server = http.createServer(app);

// App hardening (dashboard)
app.disable('x-powered-by');

// Behind reverse proxies (Koyeb), trust the first hop so req.ip and protocol are correct.
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

// isProd already defined above


// In production, do NOT fall back to permissive CORS unless explicitly allowed.
// This prevents a common misconfiguration where the API is callable from any website.
if (isProd && !allowedOrigins.length && process.env.DASHBOARD_ALLOW_ANY_ORIGIN !== 'true') {
  console.warn('[Dashboard] CORS is not configured. Set DASHBOARD_ORIGIN (recommended) or dashboard.allowedOrigins. Refusing cross-origin requests in production.');
}

// Security headers (dashboard)
// CSP: keep scripts locked to self; allow inline styles because the HTML still contains a few style="..." attributes.
// If/when inline styles are removed, drop 'unsafe-inline' from style-src.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "form-action": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
        "font-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'"]
      }
    },
    // Avoid COEP surprises with third-party assets (e.g., Discord CDN avatars).
    crossOriginEmbedderPolicy: false
  })
);

// CORS: allow only configured origins in production (unless explicitly overridden).
// If allowedOrigins is empty:
//  - dev: allow all origins (DX)
//  - prod: deny cross-origin (still allows same-origin requests because browsers omit Origin on same-origin navigations only for some requests; XHR/fetch includes Origin even on same-origin, so you should configure DASHBOARD_ORIGIN)
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);

    if (!allowedOrigins.length) {
      if (!isProd) return cb(null, true);
      if (process.env.DASHBOARD_ALLOW_ANY_ORIGIN === 'true') return cb(null, true);
      return cb(null, false);
    }

    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: false
};

app.use(cors(corsOptions));

app.use(express.json({ limit: '256kb' }));

// Baseline API rate limiting (endpoint-specific limiters still apply)
app.use('/api', rateLimit({ windowMs: 60_000, max: 600, keyPrefix: 'rl:api:' }));


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

  try {
    const payload = jwt.verify(rawToken, JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload) return null;

    // OAuth-only tokens.
    if (payload.t !== 'oauth' || !payload.sub) return null;

    return {
      _id: String(payload.sub),
      role: payload.role || 'ADMIN',
      username: payload.username || 'discord',
      permissions: (payload.permissions && typeof payload.permissions === 'object') ? payload.permissions : {},
      allowedGuildIds: Array.isArray(payload.allowedGuildIds) ? payload.allowedGuildIds.map(String) : [],
      selectedGuildId: payload.selectedGuildId ? sanitizeId(payload.selectedGuildId) : null,
      profile: payload.profile ? String(payload.profile) : null,
      oauth: true
    };
  } catch {
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

// ------------------------------
// Permission guard (RBAC)
// ------------------------------
// Dashboard users can be fine-tuned via DashboardUser.permissions.
// ADMIN role always bypasses granular checks.
function requirePerm({ anyOf = [] } = {}) {
  const needed = Array.isArray(anyOf) ? anyOf.filter(Boolean) : [];
  return (req, res, next) => {
    // If auth is disabled, permissions are meaningless.
    if (!isAuthEnabled()) return next();

    const u = req.dashboardUser;
    if (!u) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    if (!needed.length) return next();
    const perms = (u.permissions && typeof u.permissions === 'object') ? u.permissions : {};
    const allowed = needed.some((k) => perms[k] === true);
    if (!allowed) return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
    return next();
  };
}

// ------------------------------
// Guild access guard (optional allow-list)
// ------------------------------
// If DashboardUser.allowedGuildIds is non-empty, MOD users are restricted to those guild IDs.
// ADMIN users always bypass.
function requireGuildAccess({ from = 'params', key = 'guildId', optional = false } = {}) {
  return (req, res, next) => {
    if (!isAuthEnabled()) return next();

    const u = req.dashboardUser;
    if (!u) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const list = Array.isArray(u.allowedGuildIds) ? u.allowedGuildIds.filter(Boolean).map(String) : [];

    let raw = '';
    try {
      if (from === 'query') raw = (req.query && req.query[key]) || '';
      else if (from === 'body') raw = (req.body && req.body[key]) || '';
      else raw = (req.params && req.params[key]) || '';
    } catch {
      raw = '';
    }

    const gid = sanitizeId(raw);
    const selected = u && u.selectedGuildId ? String(u.selectedGuildId) : '';

    // If this route requires a guild id, force the user to select a guild first.
    if (!selected && !optional) {
      return res.status(403).json({ ok: false, error: 'NO_GUILD_SELECTED' });
    }

    if (!gid) {
      if (optional) return next();
      return res.status(400).json({ ok: false, error: 'Missing guildId' });
    }

    // Enforce scoped token
    if (selected && gid !== selected) {
      return res.status(403).json({ ok: false, error: 'NO_GUILD_SELECTED' });
    }

    // Enforce allow-list (OAuth callback already restricts to bot-present + owner/admin)
    if (list.length && !list.includes(gid)) {
      return res.status(403).json({ ok: false, error: 'NO_GUILD_ACCESS' });
    }

    return next();
  };
}

let _client = null;

function setClient(client) {
  _client = client;
}



// NOTE: route-level rate limiting is handled by src/systems/rateLimit.js.


// Serve UI explicitly at / to avoid any edge cases with platform routers/static defaults
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Some platforms/frontends may hit /index.html directly
app.get('/index.html', (req, res) => {
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
    // Normalize Windows path separators just in case.
    const fp = String(filePath).replace(/\\/g, '/');
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
// Global API limiter (dashboard is authenticated; keep it generous and rely on per-route limits).

registerCoreRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  rateLimit,
  recordAudit,
  getActorFromRequest,
  configManager,
  status,
  getClient: () => _client,
  Infraction
});


// Dashboard routes (modular)
registerAuthRoutes({
  app,
  express,
  requireDashboardAuth,
  jwt,
  JWT_SECRET,
  sanitizeText,
  rateLimit,
  ADMIN_PERMISSIONS,
  GuildConfig,
  getClient: () => _client,
  sanitizeId
});

registerGuildsRoutes({
  app,
  requireDashboardAuth,
  requireGuildAccess,
  requirePerm,
  getClient: () => _client,
  sanitizeId
});

registerUserRoutes({
  app,
  requireDashboardAuth,
  requireGuildAccess,
  requirePerm,
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
  requireGuildAccess,
  UserModel,
  getTrustConfig,
  getTrustLabel
});

registerGameNewsRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  rateLimit,
  GameNewsFeed,
  GameNewsModel,
  gameNewsSystem,
  sanitizeId,
  sanitizeText,
  getActorFromRequest,
  recordAudit,
  GameNewsFeedSchema,
  getClient: () => _client,
  gameNewsStatusCache
});

registerModRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
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
  _getModels: () => ({ Infraction, DashboardLog, TicketLog, UserActivity: UserActivityModel, PresenceSession: PresenceSessionModel }),
  _getLogsCache: () => logsCache
});

registerConfigRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  rateLimit,
  sanitizeId,
  GuildConfig,
  GuildConfigSchema,
  config
});

registerLogsRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
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
  requirePerm,
  requireGuildAccess,
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
  requirePerm,
  requireGuildAccess,
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
  requireGuildAccess,
  requirePerm,
  getClient: () => _client,
  sanitizeId,
  guildMembersLastFetch,
  infractionsService,
  TicketLogModel: TicketLog
});

registerCaseRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  sanitizeId,
  infractionsService,
  getClient: () => _client
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

    saveLogToMongo(payload).catch(() => null);

    return;
  }

  if (event === 'gamenews_status') {
    const arr = Array.isArray(data) ? data : [];
    gameNewsStatusCache = arr;
    return;
  }
}


// Registar função de envio no bridge (evita require circular com logger)
dashboardBridge.setSender(sendToDashboard);

registerAuditRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  sanitizeId,
  DashboardAudit
});

registerAdminRoutes({
  app,
  express,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  sanitizeId,
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
  requirePerm,
  requireGuildAccess,
  sanitizeId,
  sanitizeText,
  GuildConfig,
  TempVoiceChannel,
  getClient: () => _client
});

// ------------------------------
// Final error handler (API-safe)
// ------------------------------
// Guarantees JSON for API endpoints even when an unexpected exception bubbles up.
app.use((err, req, res, next) => {
  try {
    const path0 = (req && (req.originalUrl || req.path)) || '';
    const isApi = typeof path0 === 'string' && (path0.startsWith('/api') || path0.startsWith('/health'));

    if (!isApi) return next(err);

    const statusCode =
      (err && (err.statusCode || err.status)) && Number.isFinite(Number(err.statusCode || err.status))
        ? Number(err.statusCode || err.status)
        : 500;

    const code = (err && err.code) ? String(err.code) : 'INTERNAL_ERROR';
    const message =
      (err && (err.apiMessage || err.message))
        ? String(err.apiMessage || err.message)
        : 'Internal server error';

    // Avoid leaking stack traces to clients.
    const out = {
      ok: false,
      error: message,
      code,
      requestId: req && req.requestId ? req.requestId : undefined
    };

    if (!res.headersSent) {
      return res.status(statusCode).json(out);
    }
  } catch (e) {
    // ignore
  }
  return next(err);
});

// SPA fallback: serve the dashboard shell for unknown non-API routes.
// Must be registered AFTER all API/health routes so it never hijacks JSON endpoints.
// Express v5 (path-to-regexp v6) does NOT accept a bare "*" route pattern, so we use a regex.
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  try {
    const p = req.path || '';
    // If it's a real asset path, let static handle it.
    if (p.includes('.')) return next();
    return res.sendFile(path.join(__dirname, '../public/index.html'));
  } catch (e) {
    return next();
  }
});


module.exports = {
  app,
  server,
  sendToDashboard,
  setClient,
};

