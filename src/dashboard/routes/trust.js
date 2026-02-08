// src/dashboard/routes/trust.js

const rateLimit = require('../../systems/rateLimit');

/**
 * Trust summary (per guild / global)
 * Keeps response shape compatible with older dashboard builds:
 *  - disabled
 *  - totalUsers
 *  - buckets {low, medium, high}
 *  - topRisks, topSafe
 */
function registerTrustRoutes({
  app,
  requireDashboardAuth,
  requireGuildAccess,
  UserModel,
  getTrustConfig,
  getTrustLabel
}) {
  const guardGuildQueryOptional = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'query', key: 'guildId', optional: true })
    : (req, res, next) => next();

  app.get(
    '/api/trust/summary',
    requireDashboardAuth,
    guardGuildQueryOptional,
    rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'rl:trust:summary:' }),
    async (req, res) => {
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

        const lowCount = await UserModel.countDocuments({
          ...baseQuery,
          trust: { $lte: trustCfg.lowThreshold }
        });
        const highCount = await UserModel.countDocuments({
          ...baseQuery,
          trust: { $gte: trustCfg.highThreshold }
        });
        const mediumCount = Math.max(totalUsers - lowCount - highCount, 0);

        const topRiskDocs = await UserModel.find(baseQuery)
          .sort({ trust: 1, lastInfractionAt: -1 })
          .limit(15)
          .lean();

        const topSafeDocs = await UserModel.find(baseQuery)
          .sort({ trust: -1, lastInfractionAt: -1 })
          .limit(15)
          .lean();

        const topRisks = (topRiskDocs || []).map((u) => ({
          userId: u.userId,
          guildId: u.guildId,
          trust: u.trust,
          warnings: u.warnings ?? 0,
          lastInfractionAt: u.lastInfractionAt,
          lastTrustUpdateAt: u.lastTrustUpdateAt,
          label: getTrustLabel(u.trust, trustCfg)
        }));

        const topSafe = (topSafeDocs || []).map((u) => ({
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
    }
  );
}

module.exports = { registerTrustRoutes };
