// src/dashboard/routes/premium.js
//
// Premium por servidor (ativado por doação): leitura do estado, ativação
// manual por um admin da dashboard e o guard usado pelos módulos premium
// (gamenews, voz temporária, tickets, trust, giveaways).

const { normalizePremium, PREMIUM_MODULES } = require('../../systems/premium');
const { invalidateGuildConfig } = require('../../systems/guildConfigService');

function toBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function parseDate(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Guard reutilizável. Devolve 402 PREMIUM_REQUIRED quando o servidor não tem
 * premium ativo. Sem modelo disponível não bloqueia (ambiente degradado).
 */
function createPremiumGuard({ GuildConfig, sanitizeId }) {
  return function requirePremium({ from = 'body', key = 'guildId' } = {}) {
    return async (req, res, next) => {
      if (!GuildConfig) return next();

      let raw = '';
      try {
        if (from === 'query') raw = (req.query && req.query[key]) || '';
        else if (from === 'params') raw = (req.params && req.params[key]) || '';
        else raw = (req.body && req.body[key]) || '';
      } catch {
        raw = '';
      }

      const guildId = typeof sanitizeId === 'function' ? sanitizeId(String(raw || '')) : String(raw || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });

      try {
        const cfg = await GuildConfig.findOne({ guildId }).select('premium').lean();
        if (normalizePremium(cfg && cfg.premium).active) return next();
      } catch (err) {
        console.warn('[Premium] verificação falhou:', err?.message || err);
      }

      return res.status(402).json({ ok: false, error: 'PREMIUM_REQUIRED' });
    };
  };
}

function registerPremiumRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  sanitizeId,
  GuildConfig
}) {
  const guardGuildQuery = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'query', key: 'guildId' })
    : (req, res, next) => next();

  const guardGuildBody = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'body', key: 'guildId' })
    : (req, res, next) => next();

  const canViewConfig = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canViewConfig', 'canEditConfig'] })
    : (req, res, next) => next();

  const canEditConfig = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canEditConfig'] })
    : (req, res, next) => next();

  // GET /api/premium?guildId=123
  app.get('/api/premium', requireDashboardAuth, canViewConfig, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

      const cfg = await GuildConfig.findOne({ guildId }).select('premium').lean();
      return res.json({ ok: true, premium: normalizePremium(cfg && cfg.premium), modules: PREMIUM_MODULES });
    } catch (err) {
      console.error('[Dashboard] /api/premium GET error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // POST /api/premium  { guildId, enabled, until?, note? }
  // Só um admin da dashboard pode ativar/desativar o premium de um servidor.
  app.post('/api/premium', requireDashboardAuth, canEditConfig, guardGuildBody, async (req, res) => {
    try {
      const user = req.dashboardUser;
      // Com autenticação desligada não há utilizador: não bloquear o modo local.
      if (user && user.role !== 'ADMIN') {
        return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
      }

      const guildId = sanitizeId(req.body.guildId || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

      const enabled = toBool(req.body.enabled);
      const until = parseDate(req.body.until);
      const note = typeof req.body.note === 'string' && req.body.note.trim()
        ? req.body.note.trim().slice(0, 200)
        : null;

      const premium = {
        enabled,
        until: enabled ? until : null,
        note,
        activatedAt: enabled ? new Date() : null
      };

      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: { premium } },
        { new: true, upsert: true }
      ).lean();

      invalidateGuildConfig(guildId);

      return res.json({ ok: true, premium: normalizePremium(premium) });
    } catch (err) {
      console.error('[Dashboard] /api/premium POST error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });
}

module.exports = { registerPremiumRoutes, createPremiumGuard };
