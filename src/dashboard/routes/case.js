// src/dashboard/routes/case.js

function registerCaseRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  sanitizeId,
  infractionsService,
  getClient
}) {
  const guardGuildQuery = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'query', key: 'guildId' })
    : (req, res, next) => next();

  const canViewCases = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canViewLogs', 'canActOnCases'] })
    : (req, res, next) => next();


  app.get('/api/case', requireDashboardAuth, canViewCases, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId || '');
      const caseId = (req.query.caseId || '').toString().trim();
      if (!guildId || !caseId) {
        return res.status(400).json({ ok: false, error: 'guildId and caseId are required' });
      }

      const item = await infractionsService.getCase(guildId, caseId);
      if (!item) return res.status(404).json({ ok: false, error: 'Case not found' });

      let userTag = null;
      let moderatorTag = null;

      const client = typeof getClient === 'function' ? getClient() : null;
      if (client) {
        const u = await client.users.fetch(item.userId).catch(() => null);
        const m = await client.users.fetch(item.moderatorId).catch(() => null);
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
}

module.exports = { registerCaseRoutes };
