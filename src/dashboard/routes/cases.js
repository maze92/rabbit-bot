// src/dashboard/routes/cases.js

module.exports = {
  registerCasesRoutes
};

function registerCasesRoutes(opts) {
  const {
    app,
    requireDashboardAuth,
    requirePerm,
    requireGuildAccess,
    rateLimit,
    sanitizeId,
    recordAudit,
    getActorFromRequest,
    CasesSearchQuerySchema,
    _getModels
  } = opts;

  if (!app) throw new Error('registerCasesRoutes: app is required');

  const canAct = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canActOnCases'] })
    : (req, res, next) => next();

  const guardGuildQuery = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'query', key: 'guildId' })
    : (req, res, next) => next();

  app.get('/api/cases', requireDashboardAuth, canAct, guardGuildQuery, async (req, res) => {
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

      // q supports: caseId (numeric) or free text (reason/tags/ids)
      const qText = (q || '').toString().trim();
      if (qText) {
        const maybeCaseId = parseInt(qText, 10);
        if (Number.isFinite(maybeCaseId) && maybeCaseId > 0) {
          query.caseId = maybeCaseId;
        } else {
          // Prefer text index when available. If not present, Mongo will ignore $text and return 0.
          // Keep a regex fallback for environments where indexes are not built yet.
          query.$or = [
            { reason: { $regex: qText, $options: 'i' } },
            { userTag: { $regex: qText, $options: 'i' } },
            { executorTag: { $regex: qText, $options: 'i' } },
            { userId: { $regex: qText, $options: 'i' } },
            { moderatorId: { $regex: qText, $options: 'i' } },
            { type: { $regex: qText, $options: 'i' } },
            { source: { $regex: qText, $options: 'i' } }
          ];
        }
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
    canAct,
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
