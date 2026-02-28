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
    getClient,
    GuildConfig
  } = ctx;

  // Some deployments of this codebase expose a smaller ctx surface.
  // Express will throw if any middleware handler is undefined.
  const noop = (req, res, next) => next();
  // Some of these are factories (return a middleware). Others are direct middleware.
  const auth = (typeof requireDashboardAuth === "function") ? requireDashboardAuth : noop;
  const rlMedium = (rateLimit && typeof rateLimit.medium === "function") ? rateLimit.medium : noop;

  const safeFactory = (factory, args) => {
    try {
      if (typeof factory !== 'function') return noop;
      const mw = factory(args);
      return (typeof mw === 'function') ? mw : noop;
    } catch (_) {
      return noop;
    }
  };

  const guardGuildQuery = safeFactory(requireGuildAccess, { from: 'query', key: 'guildId', optional: false });
  const guardGuildBody  = safeFactory(requireGuildAccess, { from: 'body',  key: 'guildId', optional: false });
  const canManage       = safeFactory(requirePerm, { anyOf: ['canManageGameNews', 'canEditConfig'] });

  const GiveawaysConfigSchema = z.object({
    enabled: z.boolean().optional(),
    channelId: z.string().nullable().optional(),
    platforms: z.array(z.string()).optional(),
    types: z.array(z.string()).optional(),
    pollIntervalSeconds: z.number().int().min(60).max(3600).optional(),
    maxPerCycle: z.number().int().min(0).max(50).optional()
  });

  const ALLOWED_PLATFORMS = new Set(['steam', 'epic-games-store', 'ubisoft']);

  app.get("/api/giveaways/config", auth, canManage, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId || '');
      const doc = await GuildConfig.findOne({ guildId }).lean().catch(() => null);
      const cfg = (doc && doc.giveaways) ? doc.giveaways : {};
      const rawPlatforms = Array.isArray(cfg.platforms) ? cfg.platforms : ['steam'];
      const filteredPlatforms = rawPlatforms.map(String).filter((p) => ALLOWED_PLATFORMS.has(String(p)));
      return res.json({
        ok: true,
        guildId,
        giveaways: {
          enabled: Boolean(cfg.enabled),
          channelId: cfg.channelId || null,
          platforms: filteredPlatforms.length ? filteredPlatforms : ['steam'],
          types: Array.isArray(cfg.types) ? cfg.types : ['game'],
          pollIntervalSeconds: typeof cfg.pollIntervalSeconds === 'number' ? cfg.pollIntervalSeconds : 60,
          maxPerCycle: typeof cfg.maxPerCycle === 'number' ? cfg.maxPerCycle : 0
        }
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.post("/api/giveaways/config", auth, canManage, rlMedium, guardGuildBody, async (req, res) => {
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

      const filteredPlatforms = platforms
        ? platforms.map(String).filter((p) => ALLOWED_PLATFORMS.has(String(p)))
        : undefined;

      const types = Array.isArray(next.types)
        ? next.types.map((s) => sanitizeText(s, { maxLen: 32, stripHtml: true })).filter(Boolean)
        : undefined;

      const update = {};
      if (typeof next.enabled === 'boolean') update['giveaways.enabled'] = next.enabled;
      if (next.channelId === null || typeof next.channelId === 'string') update['giveaways.channelId'] = next.channelId ? sanitizeId(next.channelId) : null;
      if (filteredPlatforms) update['giveaways.platforms'] = filteredPlatforms;
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

  // Send a test giveaway embed to the selected channel.
  app.post("/api/giveaways/test", auth, canManage, rlMedium, guardGuildBody, async (req, res) => {
    try {
      const guildId = sanitizeId(req.body.guildId || '');
      const channelId = sanitizeId(req.body.channelId || '');
      const platform = sanitizeText(req.body.platform || 'steam', { maxLen: 64, stripHtml: true });
      if (!guildId || !channelId) return res.status(400).json({ ok: false, error: 'missing_channel' });
      if (!ALLOWED_PLATFORMS.has(String(platform))) return res.status(400).json({ ok: false, error: 'invalid_platform' });

      const client = (typeof getClient === 'function') ? getClient() : null;
      if (!client) return res.status(500).json({ ok: false, error: 'client_unavailable' });

      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (!ch || typeof ch.send !== 'function') return res.status(404).json({ ok: false, error: 'channel_not_found' });

      const payload = buildTestMessage({ platform });
      await ch.send(payload);

      return res.json({ ok: true });
    } catch (e) {
      // Surface a trimmed error to help debugging in production logs/UI.
      const msg = (e && e.message) ? String(e.message) : String(e);
      return res.status(500).json({ ok: false, error: 'internal_error', message: msg.slice(0, 180) });
    }
  });
}

function buildTestMessage({ platform }) {
  const now = new Date();
  const end = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

  const title = 'TEST • Paragnosia';
  const worth = '€39.99';
  const until = end.toLocaleDateString('pt-PT');
  const image = 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2l7m.jpg';
  const url = String(platform).includes('steam')
    ? 'https://store.steampowered.com/app/000000/Example'
    : (String(platform).includes('epic')
      ? 'https://store.epicgames.com/p/example'
      : 'https://store.ubisoft.com/');

  // Wikimedia frequently rate-limits hotlinking (429). Use a stable CDN + rasterizer.
  // The weserv proxy converts SVG→PNG and caches.
  const thumb = String(platform).includes('steam')
    ? 'https://images.weserv.nl/?url=cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/steam.svg&output=png&bg=ffffff&w=256&h=256'
    : (String(platform).includes('epic')
      ? 'https://images.weserv.nl/?url=cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/epicgames.svg&output=png&bg=ffffff&w=256&h=256'
      : 'https://images.weserv.nl/?url=cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/ubisoft.svg&output=png&bg=ffffff&w=256&h=256');

  const embed = {
    title,
    description: `~~${worth}~~ Free until ${until}`,
    color: 0x5865F2,
    thumbnail: { url: thumb },
    image: { url: image },
    footer: { text: 'via gamerpower.com' }
  };

  // Discord Link Buttons only accept http/https URLs. Custom schemes (steam://, com.epicgames...) can throw.
  // Keep the labels, but use the store URL (Steam/Epic desktop clients can still handle it via browser integration).
  const components = [
    {
      type: 1,
      components: [
        { type: 2, style: 5, label: 'Open in browser ↗', url },
        ...(String(platform).includes('steam') ? [{ type: 2, style: 5, label: 'Open in Steam Client ↗', url }] : []),
        ...(String(platform).includes('epic') ? [{ type: 2, style: 5, label: 'Open in Epic Games Launcher ↗', url }] : [])
      ].slice(0, 5)
    }
  ];

  return { embeds: [embed], components };
}

module.exports = { registerGiveawaysRoutes };
