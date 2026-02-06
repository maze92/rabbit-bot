// src/dashboard/routes/cases.js

module.exports = {
  registerCasesRoutes
};

function registerCasesRoutes(opts) {
  const {
    app,
    requireDashboardAuth,
    rateLimit,
    sanitizeId,
    recordAudit,
    getActorFromRequest,
    CasesSearchQuerySchema,
    _getModels
  } = opts;

  if (!app) throw new Error('registerCasesRoutes: app is required');

  app.get('/api/cases', requireDashboardAuth, async (req, res) => {
    const parsed = CasesSearchQuerySchema.safeParse(req.query || {});
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Invalid query' });

    try {
      const { Infraction } = _getModels();
      if (!Infraction) {
        return res.status(503).json({ ok: false, error: 'Infraction model not available' });
      }

      const { guildId, q, userId, type, source, page: pageStr, limit: limitStr } = parsed.data;

      const page = Math.max(parseInt(pageStr || '1', 10), 1);
      const limitRaw = parseInt(limitStr || '50', 10);
      const limit = Math.min(Math.max(limitRaw, 1), 200);

      const query = { guildId };

      if (userId) query.userId = sanitizeId(userId);
      if (type) query.type = type;
      if (source) query.source = source;

      if (q) {
        const s = q.toString();
        query.$or = [
          { reason: { $regex: s, $options: 'i' } },
          { userTag: { $regex: s, $options: 'i' } },
          { executorTag: { $regex: s, $options: 'i' } }
        ];
      }

      const total = await Infraction.countDocuments(query);
      const docs = await Infraction
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      return res.json({ ok: true, page, limit, total, items: docs });
    } catch (err) {
      console.error('[Dashboard] /api/cases error:', err);
      return res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  app.post(
    '/api/cases/clear',
    requireDashboardAuth,
    rateLimit({ windowMs: 60_000, max: 3, keyPrefix: 'rl:cases:clear:' }),
    async (req, res) => {
      try {
        const { Infraction } = _getModels();
        if (!Infraction) {
          return res.status(503).json({ ok: false, error: 'Infraction model not available' });
        }

        const guildId = sanitizeId(req.body.guildId || '');
        if (!guildId) return res.status(400).json({ ok: false, error: 'Missing guildId' });

        await Infraction.deleteMany({ guildId });

        await recordAudit({
          req,
          action: 'cases.clear',
          guildId,
          actor: getActorFromRequest(req),
          payload: { guildId }
        });

        return res.json({ ok: true });
      } catch (err) {
        console.error('[Dashboard] /api/cases/clear error:', err);
        return res.status(500).json({ ok: false, error: 'Internal error' });
      }
    }
  );
}
