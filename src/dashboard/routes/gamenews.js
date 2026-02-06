// src/dashboard/routes/gamenews.js

function registerGameNewsRoutes(ctx) {
  const { app, requireDashboardAuth, config, configManager, gameNewsSystem, sanitizeId, sanitizeText, recordAudit, getActorFromRequest, GameNewsModel, GameNewsFeed, GameNewsFeedSchema, getClient, gameNewsStatusCache } = ctx;

app.get('/api/gamenews-status', requireDashboardAuth, async (req, res) => {
  try {
    const guildId = sanitizeId(req.query.guildId || '');

    if (!GameNewsModel) {
      return res.json({
        ok: true,
        source: 'memory',
        items: Array.isArray(gameNewsStatusCache) ? gameNewsStatusCache : []
      });
    }

    // Prefer DB-managed feeds if available; fallback to static config
    let feeds = [];
    if (GameNewsFeed) {
      try {
        const q = guildId ? { guildId } : {};
        const docs = await GameNewsFeed.find(q).lean();
        feeds = docs.map((d) => ({
          guildId: d.guildId || null,
          name: d.name || 'Feed',
          feedUrl: d.feedUrl,
          channelId: d.channelId,
          logChannelId: d.logChannelId || null,
          enabled: d.enabled !== false,
          intervalMs: typeof d.intervalMs === 'number' ? d.intervalMs : null
        }));
      } catch (e) {
        console.error('[Dashboard] /api/gamenews-status: failed loading GameNewsFeed:', e?.message || e);
      }
    }

    if (!feeds.length && Array.isArray(config?.gameNews?.sources)) {
      feeds = config.gameNews.sources.map((s) => ({
        guildId: null,
        name: s.name,
        feedUrl: s.feed,
        channelId: s.channelId,
        logChannelId: null,
        enabled: true,
        intervalMs: null
      }));
    }

    const names = feeds.map((s) => s?.name).filter(Boolean);
    const docs = names.length ? await GameNewsModel.find({ source: { $in: names } }).lean() : [];

    const map = new Map();
    for (const d of docs) map.set(d.source, d);

    const items = feeds.map((s) => {
      const d = map.get(s.name);
      return {
        guildId: s.guildId || null,
        source: s.name,
        feedName: s.name,
        feedUrl: (s.feedUrl || s.feed),
        channelId: s.channelId,
        logChannelId: s.logChannelId || null,
        enabled: s.enabled !== false,
        intervalMs: typeof s.intervalMs === 'number' ? s.intervalMs : null,

        failCount: d?.failCount ?? 0,
        pausedUntil: d?.pausedUntil ?? null,
        lastSentAt: d?.lastSentAt ?? null,
        lastHashesCount: Array.isArray(d?.lastHashes) ? d.lastHashes.length : 0,

        updatedAt: d?.updatedAt ?? null
      };
    });

    return res.json({
      ok: true,
      source: GameNewsFeed ? (guildId ? 'mongo+feeds:guild' : 'mongo+feeds') : 'mongo+static',
      items
    });
  } catch (err) {
    console.error('[Dashboard] /api/gamenews-status error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});


// GameNews feeds configuration (for dashboard editor)
app.get('/api/gamenews/feeds', requireDashboardAuth, async (req, res) => {
  try {
    const guildId = sanitizeId(req.query.guildId || '');

    // If there is no GameNewsFeed model at all, fall back to static config feeds (read-only).
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
      return res.json({ ok: true, items, source: 'static' });
    }

    // Load feeds for a guild when specified, else all.
    const q = guildId ? { guildId } : {};
    const docs = await GameNewsFeed.find(q).sort({ createdAt: 1 }).lean();

    const items = docs.map((d) => ({
      id: d._id.toString(),
      guildId: d.guildId || null,
      name: d.name || 'Feed',
      feedUrl: (d.feedUrl || d.feed),
      channelId: d.channelId,
      logChannelId: d.logChannelId || null,
      enabled: d.enabled !== false,
      intervalMs: typeof d.intervalMs === 'number' ? d.intervalMs : null
    }));

    return res.json({ ok: true, items, source: 'mongo' });
  } catch (err) {
    console.error('[Dashboard] /api/gamenews/feeds GET error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});


app.post('/api/gamenews/feeds', requireDashboardAuth, async (req, res) => {
  try {
    if (!GameNewsFeed) {
      return res.status(503).json({ ok: false, error: 'GameNewsFeed model not available on this deployment.' });
    }

    const guildId = sanitizeId(req.body?.guildId || req.query.guildId || '');
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    const feeds = Array.isArray(req.body?.feeds) ? req.body.feeds : [];
    const sanitized = [];
    let invalidCount = 0;
    const invalidDetails = [];

    for (const f of feeds) {
      if (!f) continue;

      // Normalize common "empty" values coming from the dashboard UI.
      // Using ?? would keep "" (empty string), which then fails zod min() checks.
      const rawChannelId = (f.channelId != null ? String(f.channelId) : "").trim();
      const rawLogChannelId = (f.logChannelId != null ? String(f.logChannelId) : "").trim();
      const normalizedChannelId = rawChannelId || null;
      const normalizedLogChannelId = rawLogChannelId || null;

      // Accept Discord channel mention formats like <#123> by pre-sanitizing to digits.
      // This improves UX because many users paste mentions from Discord.
      const channelIdForSchema = normalizedChannelId ? (sanitizeId(normalizedChannelId) || normalizedChannelId) : null;
      const logChannelIdForSchema = normalizedLogChannelId ? (sanitizeId(normalizedLogChannelId) || normalizedLogChannelId) : null;

      // Normalize RSS URL before validation (many users omit protocol).
      let feedUrlForSchema = typeof f.feedUrl === 'string' && f.feedUrl.trim()
        ? f.feedUrl.trim()
        : (typeof f.feed === 'string' ? f.feed.trim() : '');
      if (feedUrlForSchema && !/^https?:\/\//i.test(feedUrlForSchema) && /\./.test(feedUrlForSchema) && !/\s/.test(feedUrlForSchema)) {
        feedUrlForSchema = `https://${feedUrlForSchema}`;
      }

      const candidate = {
        name: typeof f.name === 'string' && f.name.trim() ? f.name : 'Feed',
        // canonical field is feedUrl; fall back to legacy "feed"
        feedUrl: feedUrlForSchema,
        feed: typeof f.feed === 'string' && f.feed.trim() ? f.feed : undefined,
        channelId: channelIdForSchema,
        logChannelId: logChannelIdForSchema,
        enabled: f.enabled !== false,
        intervalMs: typeof f.intervalMs === 'number' ? f.intervalMs : null,
        language: typeof f.language === 'string' ? f.language : undefined
      };

      const parsedResult = GameNewsFeedSchema.safeParse(candidate);
      if (!parsedResult.success) {
        invalidCount++;
        // Collect a few validation errors to help the dashboard diagnose 400s.
        if (invalidDetails.length < 5) {
          try {
            invalidDetails.push({
              name: candidate.name || null,
              feedUrl: candidate.feedUrl || null,
              channelId: candidate.channelId || null,
              issues: parsedResult.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })).slice(0, 5)
            });
          } catch (_) {}
        }
        continue;
      }

      const parsed = parsedResult.data;

      const name = sanitizeText(parsed.name || 'Feed', { maxLen: 64, stripHtml: true }) || 'Feed';
      let feedUrl = sanitizeText(parsed.feedUrl, { maxLen: 512, stripHtml: true });
      // If the user omitted the protocol (common), try to auto-fix.
      // Only do this for "domain-like" values (contains a dot, no spaces).
      if (feedUrl && !/^https?:\/\//i.test(feedUrl) && /\./.test(feedUrl) && !/\s/.test(feedUrl)) {
        feedUrl = `https://${feedUrl}`;
      }
      const channelId = sanitizeId(parsed.channelId);
      const logChannelId = sanitizeId(parsed.logChannelId) || null;
      const enabled = parsed.enabled !== false;

      const intervalRaw = Number(parsed.intervalMs ?? 0);
      const intervalMs = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : null;

      if (!feedUrl || !channelId) {
        invalidCount++;
        continue;
      }

      sanitized.push({
        guildId,
        name,
        feedUrl,
        feed: feedUrl,
        channelId,
        logChannelId,
        enabled,
        intervalMs
      });
    }

    // Allow an explicit "empty" save to mean "remove all feeds".
    // IMPORTANT: Only clear when the client explicitly sent an empty list.
    // If the client sent feeds but all were invalid, do NOT clear (would look like data loss).
    if (!feeds.length) {
      await GameNewsFeed.deleteMany({ guildId });

      await recordAudit({
        req,
        action: 'gamenews.feeds.clear',
        guildId,
        targetUserId: null,
        actor: getActorFromRequest(req),
        payload: { count: 0 }
      });

      if (gameNewsSystem && typeof gameNewsSystem.invalidateFeedsCache === 'function') {
        gameNewsSystem.invalidateFeedsCache();
      }

      return res.json({ ok: true, items: [] });
    }

    // If ALL items were invalid, fail the request and keep existing DB state intact.
    // If SOME were invalid but at least one is valid, proceed and return a warning.
    const warnings = [];
    if (invalidCount > 0 && sanitized.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'All provided feeds are invalid. Check the URL (include http/https) and channel IDs (numeric or <#mention>).',
        details: invalidDetails
      });
    }
    if (invalidCount > 0) {
      warnings.push('Some feeds were ignored because they were invalid.');
    }

    await GameNewsFeed.deleteMany({ guildId });
    const inserted = await GameNewsFeed.insertMany(sanitized);

    const docs = inserted.length ? inserted : await GameNewsFeed.find({ guildId }).sort({ createdAt: 1 }).lean();
    const items = docs.map((d) => ({
      id: d._id.toString(),
      guildId: d.guildId || null,
      name: d.name || 'Feed',
      feedUrl: d.feedUrl || d.feed,
      channelId: d.channelId,
      logChannelId: d.logChannelId || null,
      enabled: d.enabled !== false,
      intervalMs: typeof d.intervalMs === 'number' ? d.intervalMs : null
    }));

    await recordAudit({
      req,
      action: 'gamenews.feeds.save',
      guildId,
      targetUserId: null,
      actor: getActorFromRequest(req),
      payload: { count: items.length }
    });

    if (gameNewsSystem && typeof gameNewsSystem.invalidateFeedsCache === 'function') {
      gameNewsSystem.invalidateFeedsCache();
    }

    return res.json({ ok: true, items, warnings });
  } catch (err) {
    console.error('[Dashboard] /api/gamenews/feeds POST error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});
app.post('/api/gamenews/test', requireDashboardAuth, async (req, res) => {
  try {
    const client = typeof getClient === 'function' ? getClient() : null;
    if (!client) {
      return res.status(503).json({ ok: false, error: 'Bot client not ready' });
    }

    const guildId = sanitizeId(req.body?.guildId || req.query.guildId || '');
    const rawFeedId = (req.body?.feedId || req.params?.feedId || '').toString().trim();
    const feedId = rawFeedId.slice(0, 64); // allow hex ObjectId

    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }
    if (!feedId) {
      return res.status(400).json({ ok: false, error: 'feedId is required' });
    }

    if (!gameNewsSystem || typeof gameNewsSystem.testSendGameNews !== 'function') {
      return res.status(503).json({ ok: false, error: 'GameNews test not available on this deployment' });
    }

    const mergedCfg = configManager.getPublicConfig
      ? configManager.getPublicConfig()
      : config;

    const result = await gameNewsSystem.testSendGameNews({
      client: client,
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
        feedName: result.feedName,
        title: result.title,
        link: result.link
      }
    });
  } catch (err) {
    console.error('[Dashboard] /api/gamenews/test error:', err);
    const message = err && err.message ? String(err.message) : 'Internal Server Error';
    return res.status(500).json({ ok: false, error: message });
  }
});
}

module.exports = { registerGameNewsRoutes };
