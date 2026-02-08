// src/dashboard/routes/core.js

function registerCoreRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  rateLimit,
  recordAudit,
  getActorFromRequest,
  configManager,
  status,
  getClient,
  Infraction
}) {
  // Overview metrics for dashboard
  app.get('/api/overview', requireDashboardAuth, async (req, res) => {
    try {
      const client = typeof getClient === 'function' ? getClient() : null;
      if (!client || !client.guilds || !client.guilds.cache) {
        return res.json({ ok: true, guilds: 0, users: 0, actions24h: 0 });
      }

      const guildsCache = client.guilds.cache;
      const guilds = Array.from(guildsCache.values ? guildsCache.values() : guildsCache);
      const guildsCount = Array.isArray(guilds) ? guilds.length : (guildsCache.size || 0);

      let usersCount = 0;
      for (const g of guilds) {
        if (g && typeof g.memberCount === 'number') usersCount += g.memberCount;
      }

      // Count moderation actions in the last 24h
      let actions24h = 0;
      try {
        if (Infraction && typeof Infraction.countDocuments === 'function') {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
          actions24h = await Infraction.countDocuments({ createdAt: { $gte: since } }).exec();
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

  const canViewConfig = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canViewConfig', 'canEditConfig'] })
    : (req, res, next) => next();

  const canEditConfig = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canEditConfig'] })
    : (req, res, next) => next();

  // Global config for dashboard settings
  app.get('/api/config', requireDashboardAuth, canViewConfig, (req, res) => {
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

  const rlConfigPatch = rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'rl:config:' });
  app.patch('/api/config', requireDashboardAuth, canEditConfig, rlConfigPatch, async (req, res) => {
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

      return res.json(result);
    } catch (err) {
      console.error('[Dashboard] /api/config patch error:', err);
      return res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
  });

  // Health endpoint used by platforms for readiness
  app.get('/health', (req, res) => {
    try {
      const s = typeof status.getStatus === 'function' ? status.getStatus() : {};

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
      return res.status(500).json({ ok: false, error: 'Health check failed' });
    }
  });
}

module.exports = { registerCoreRoutes };
