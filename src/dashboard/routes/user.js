// src/dashboard/routes/user.js

const rateLimit = require('../../systems/rateLimit');

/**
 * User inspector route used by the dashboard Users tab right panel.
 * Supports resolving a user by ID / mention / partial name within a guild.
 */
function registerUserRoutes({
  app,
  requireDashboardAuth,
  requireGuildAccess,
  getClient,
  warningsService,
  infractionsService,
  config,
  getTrustConfig,
  getTrustLabel,
  getEffectiveMuteDuration
}) {
  const guardGuildQuery = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'query', key: 'guildId' })
    : (req, res, next) => next();

  app.get(
    '/api/user',
    requireDashboardAuth,
    guardGuildQuery,
    rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'rl:user:inspect:' }),
    async (req, res) => {
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

        const _client = getClient();

        if (_client) {
          const g = _client.guilds.cache.get(guildId) || null;
          if (g) {
            let candidate = rawUser;

            // Mentions (<@123>, <@!123>)
            const mentionMatch = rawUser.match(/<@!?([0-9]{10,20})>/);
            if (mentionMatch) candidate = mentionMatch[1];

            if (/^[0-9]{10,20}$/.test(candidate)) {
              resolvedUserId = candidate;
              discordMember = await g.members.fetch(candidate).catch(() => null);
              discordUser =
                discordMember?.user || (await _client.users.fetch(candidate).catch(() => null));
            } else {
              // Search by name/tag within guild
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
          return res
            .status(404)
            .json({ ok: false, error: 'User not found in guild (by ID/mention/name).' });
        }

        const dbUser = await warningsService.getOrCreateUser(guildId, resolvedUserId).catch(() => null);
        const infractions = await infractionsService
          .getRecentInfractions(guildId, resolvedUserId, limit)
          .catch(() => []);
        const counts = await infractionsService
          .countInfractionsByType(guildId, resolvedUserId)
          .catch(() => ({}));

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
            const warnsCount = counts && typeof counts.WARN === 'number' ? counts.WARN : 0;
            const warnsToMute = typeof autoMuteCfg.warnsToMute === 'number' ? autoMuteCfg.warnsToMute : 0;
            const baseMuteMs =
              typeof autoMuteCfg.muteDurationMs === 'number'
                ? autoMuteCfg.muteDurationMs
                : 10 * 60 * 1000;

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
              nextPenalty = { automationEnabled: false };
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
                lastInfractionAt: dbUser.lastInfractionAt
                  ? new Date(dbUser.lastInfractionAt).toISOString()
                  : null,
                lastTrustUpdateAt: dbUser.lastTrustUpdateAt
                  ? new Date(dbUser.lastTrustUpdateAt).toISOString()
                  : null,
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
    }
  );
}

module.exports = { registerUserRoutes };
