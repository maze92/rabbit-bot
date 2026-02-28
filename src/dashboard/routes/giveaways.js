// src/dashboard/routes/giveaways.js
//
// Dashboard routes to configure GamerPower giveaways per guild.

const { z } = require('zod');

function registerGiveawaysRoutes(ctx) {
  const {
    app,
    requireDashboardAuth,
    requirePerm,
    requireGuildAccess,
    rateLimit,
    sanitizeId,
    sanitizeText,
    recordAudit,
    getActorFromRequest,
    GuildConfig
  } = ctx;

  const guardGuildQuery = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'query', key: 'guildId', optional: false })
    : (req, res, next) => next();

  const guardGuildBody = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'body', key: 'guildId', optional: false })
    : (req, res, next) => next();

  const canManage = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canManageGameNews', 'canEditConfig'] })
    : (req, res, next) => next();

  const GiveawaysConfigSchema = z.object({
    enabled: z.boolean().optional(),
    channelId: z.string().nullable().optional(),
    platforms: z.array(z.string()).optional(),
    types: z.array(z.string()).optional(),
    pollIntervalSeconds: z.number().int().min(60).max(3600).optional(),
    maxPerCycle: z.number().int().min(0).max(50).optional()
  });

  app.get('/api/giveaways/config', requireDashboardAuth, canManage, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId || '');
      const doc = await GuildConfig.findOne({ guildId }).lean().catch(() => null);
      const cfg = (doc && doc.giveaways) ? doc.giveaways : {};
      return res.json({
        ok: true,
        guildId,
        giveaways: {
          enabled: Boolean(cfg.enabled),
          channelId: cfg.channelId || null,
          platforms: Array.isArray(cfg.platforms) ? cfg.platforms : ['steam'],
          types: Array.isArray(cfg.types) ? cfg.types : ['game'],
          pollIntervalSeconds: typeof cfg.pollIntervalSeconds === 'number' ? cfg.pollIntervalSeconds : 60,
          maxPerCycle: typeof cfg.maxPerCycle === 'number' ? cfg.maxPerCycle : 0
        }
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.post('/api/giveaways/config', requireDashboardAuth, canManage, rateLimit.medium, guardGuildBody, async (req, res) => {
    try {
      const guildId = sanitizeId(req.body.guildId || '');
      const payload = req.body && req.body.giveaways ? req.body.giveaways : req.body;

      const parsed = GiveawaysConfigSchema.safeParse(payload || {});
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: 'invalid_payload' });
      }

      const next = parsed.data;

      // sanitize arrays
      const platforms = Array.isArray(next.platforms)
        ? next.platforms.map((s) => sanitizeText(s, { maxLen: 64, stripHtml: true })).filter(Boolean)
        : undefined;

      const types = Array.isArray(next.types)
        ? next.types.map((s) => sanitizeText(s, { maxLen: 32, stripHtml: true })).filter(Boolean)
        : undefined;

      const update = {};
      if (typeof next.enabled === 'boolean') update['giveaways.enabled'] = next.enabled;
      if (next.channelId === null || typeof next.channelId === 'string') update['giveaways.channelId'] = next.channelId ? sanitizeId(next.channelId) : null;
      if (platforms) update['giveaways.platforms'] = platforms;
      if (types) update['giveaways.types'] = types;
      if (typeof next.pollIntervalSeconds === 'number') update['giveaways.pollIntervalSeconds'] = next.pollIntervalSeconds;
      if (typeof next.maxPerCycle === 'number') update['giveaways.maxPerCycle'] = next.maxPerCycle;

      await GuildConfig.updateOne({ guildId }, { $set: update }, { upsert: true }).catch(() => null);

      // Audit
      if (typeof recordAudit === 'function' && typeof getActorFromRequest === 'function') {
        const actor = getActorFromRequest(req);
        recordAudit({
          guildId,
          actor,
          action: 'giveaways.update',
          meta: { update }
        }).catch(() => {});
      }

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
}

module.exports = { registerGiveawaysRoutes };
