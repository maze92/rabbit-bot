// src/dashboard/routes/gamenews.js
//
// Registo das rotas relacionadas com GameNews na dashboard.
// Mantém a lógica num módulo separado, mas reutiliza helpers/serviços definidos em dashboard.js.

/**
 * Regista rotas de GameNews na app Express principal.
 *
 * @param {Object} deps
 * @param {import('express').Express} deps.app
 * @param {Function} deps.requireDashboardAuth
 * @param {Function} deps.rateLimit
 * @param {any} deps.GameNewsFeed
 * @param {Object} deps.config
 * @param {Object} deps.configManager
 * @param {Object} deps.gameNewsSystem
 * @param {import('zod').ZodSchema} deps.GameNewsFeedSchema
 * @param {Function} deps.sanitizeId
 * @param {Function} deps.sanitizeText
 * @param {Function} deps.recordAudit
 * @param {Function} deps.getActorFromRequest
 * @param {any} deps._client
 */
function registerGameNewsRoutes(deps) {
  const {
    app,
    requireDashboardAuth,
    rateLimit,
    GameNewsFeed,
    config,
    configManager,
    gameNewsSystem,
    GameNewsFeedSchema,
    sanitizeId,
    sanitizeText,
    recordAudit,
    getActorFromRequest,
    _client
  } = deps;

  // ==============================
  // /api/gamenews-status
  // ==============================
  app.get('/api/gamenews-status', requireDashboardAuth, async (req, res) => {
    try {
      // guildId é atualmente ignorado, mas poderá ser usado mais tarde para status por guild.
      const guildId = sanitizeId(req.query.guildId || '');

      if (!gameNewsSystem || typeof gameNewsSystem.getDashboardStatus !== 'function') {
        return res.json({
          ok: true,
          source: 'disabled',
          items: []
        });
      }

      const items = await gameNewsSystem.getDashboardStatus(config);

      return res.json({
        ok: true,
        source: 'system',
        items: Array.isArray(items) ? items : []
      });
    } catch (err) {
      console.error('[Dashboard] /api/gamenews-status error:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
  });

  // ==============================
  // /api/gamenews/feeds (GET)
  // ==============================
  app.get('/api/gamenews/feeds', requireDashboardAuth, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId || '');

      // Se não existir GameNewsFeed, devolvemos feeds estáticos (read-only) se existirem.
      if (!GameNewsFeed) {
        const items = Array.isArray(config?.gameNews?.sources)
          ? config.gameNews.sources.map((s, idx) => ({
              id: String(idx),
              guildId: null,
              name: s.name,
              feedUrl: s.feed,
              channelId: s.channelId,
              logChannelId: null,
              enabled: true,
              intervalMs: null
            }))
          : [];

        return res.json({
          ok: true,
          source: 'static',
          items
        });
      }

      const q = guildId ? { guildId } : {};
      const docs = await GameNewsFeed.find(q).sort({ createdAt: 1 }).lean();

      const items = docs.map((d) => ({
        id: d._id.toString(),
        guildId: d.guildId || null,
        name: d.name || 'Feed',
        feedUrl: d.feedUrl,
        channelId: d.channelId,
        logChannelId: d.logChannelId || null,
        enabled: d.enabled !== false,
        intervalMs: typeof d.intervalMs === 'number' ? d.intervalMs : null
      }));

      return res.json({
        ok: true,
        source: 'mongo',
        items
      });
    } catch (err) {
      console.error('[Dashboard] /api/gamenews/feeds GET error:', err);
      return res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
  });

  // ==============================
  // /api/gamenews/feeds (POST)
  // ==============================
  app.post(
    '/api/gamenews/feeds',
    requireDashboardAuth,
    rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'rl:gamenews:feeds:' }),
    async (req, res) => {
      try {
        if (!GameNewsFeed) {
          return res.status(503).json({ ok: false, error: 'GameNewsFeed model not available on this deployment.' });
        }

        const guildId = sanitizeId(req.body?.guildId || req.query.guildId || '');
        if (!guildId) {
          return res.status(400).json({ ok: false, error: 'guildId is required' });
        }

        const bodyFeeds = Array.isArray(req.body?.feeds) ? req.body.feeds : [];
        const sanitized = [];

        for (const f of bodyFeeds) {
          if (!f) continue;

          const candidate = {
            name: typeof f.name === 'string' && f.name.trim() ? f.name : 'Feed',
            feed: f.feedUrl,
            channelId: f.channelId ?? null,
            enabled: f.enabled !== false,
            language: typeof f.language === 'string' ? f.language : undefined
          };

          const parsedResult = GameNewsFeedSchema.safeParse(candidate);
          if (!parsedResult.success) {
            continue;
          }

          const parsed = parsedResult.data;

          const name = sanitizeText(parsed.name || 'Feed', { maxLen: 64, stripHtml: true }) || 'Feed';
          const feedUrl = sanitizeText(parsed.feed, { maxLen: 512, stripHtml: true });
          const channelId = sanitizeId(parsed.channelId);
          const logChannelId = sanitizeId(f.logChannelId) || null;
          const enabled = parsed.enabled !== false;

          const intervalRaw = Number(f.intervalMs ?? 0);
          const intervalMs = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : null;

          if (!feedUrl || !channelId) continue;
          sanitized.push({ guildId, name, feedUrl, channelId, logChannelId, enabled, intervalMs });
        }

        // Substitui todos os docs deste guildId.
        await GameNewsFeed.deleteMany({ guildId });
        if (sanitized.length) {
          await GameNewsFeed.insertMany(sanitized);
        }

        const docs = await GameNewsFeed.find({ guildId }).sort({ createdAt: 1 }).lean();
        const items = docs.map((d) => ({
          id: d._id.toString(),
          guildId: d.guildId || null,
          name: d.name || 'Feed',
          feedUrl: d.feedUrl,
          channelId: d.channelId,
          logChannelId: d.logChannelId || null,
          enabled: d.enabled !== false,
          intervalMs: typeof d.intervalMs === 'number' ? d.intervalMs : null
        }));

        return res.json({
          ok: true,
          source: 'mongo',
          items
        });
      } catch (err) {
        console.error('[Dashboard] /api/gamenews/feeds POST error:', err);
        const message = err && err.message ? String(err.message) : 'Internal Server Error';
        return res.status(500).json({ ok: false, error: message });
      }
    }
  );

  // ==============================
  // /api/gamenews/test
  // ==============================
  app.post(
    '/api/gamenews/test',
    requireDashboardAuth,
    rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'rl:gamenews:test:' }),
    async (req, res) => {
      try {
        if (!_client) {
          return res.status(503).json({ ok: false, error: 'Bot client not ready' });
        }

        const guildId = sanitizeId(req.body?.guildId || req.query.guildId || '');
        const rawFeedId = (req.body?.feedId || req.params?.feedId || '').toString().trim();
        const feedId = rawFeedId.slice(0, 64); // permitir ObjectId hexadecimal

        if (!guildId) {
          return res.status(400).json({ ok: false, error: 'guildId is required' });
        }
        if (!feedId) {
          return res.status(400).json({ ok: false, error: 'feedId is required' });
        }

        if (!gameNewsSystem || typeof gameNewsSystem.testSendGameNews !== 'function') {
          return res.status(503).json({ ok: false, error: 'GameNews test not available on this deployment' });
        }

        const mergedCfg = configManager.getPublicConfig ? configManager.getPublicConfig() : config;

        const result = await gameNewsSystem.testSendGameNews({
          client: _client,
          config: mergedCfg,
          guildId,
          feedId
        });

        await recordAudit({
          req,
          action: 'gamenews.feed.test',
          guildId,
          targetUserId: null,
          actor: getActorFromRequest(req),
          payload: { feedId, feedName: result?.feedName || null }
        });

        return res.json({
          ok: true,
          result: {
            feedName: result?.feedName || null,
            title: result?.title || null,
            link: result?.link || null
          }
        });
      } catch (err) {
        console.error('[Dashboard] /api/gamenews/test error:', err?.message || err);
        return res.status(500).json({ ok: false, error: 'Internal Server Error' });
      }
    }
  );
}

module.exports = {
  registerGameNewsRoutes
};
