// src/dashboard/routes/freetokeep.js

// FreeToKeep Dashboard routes: config + preview + test send + recent posts.
// Design goals:
// - Never call external APIs from these endpoints (avoid 504s).
// - Bounded DB calls (maxTimeMS) and defensive error handling.

function registerFreeToKeepRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  sanitizeId,
  sanitizeText,
  GuildConfig,
  FreeToKeepPost,
  getClient
}) {
  const guardGuildQuery = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'query', key: 'guildId' })
    : (req, _res, next) => next();

  const guardGuildBody = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'body', key: 'guildId' })
    : (req, _res, next) => next();

  const canView = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canViewConfig', 'canEditConfig'] })
    : (req, _res, next) => next();

  const canEdit = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canEditConfig'] })
    : (req, _res, next) => next();

  function normalizeConfig(raw) {
    const c = raw || {};
    const platforms = c.platforms || {};
    const types = c.types || {};
    const embedOptions = c.embedOptions || {};
    return {
      enabled: c.enabled === true,
      channelId: c.channelId || null,
      pollIntervalSeconds: (typeof c.pollIntervalSeconds === 'number' && c.pollIntervalSeconds >= 60)
        ? Math.min(c.pollIntervalSeconds, 3600)
        : 300,
      maxPerCycle: (typeof c.maxPerCycle === 'number' && c.maxPerCycle >= 1)
        ? Math.min(c.maxPerCycle, 10)
        : 3,
      platforms: {
        epic: platforms.epic !== false,
        steam: platforms.steam !== false,
        ubisoft: platforms.ubisoft !== false
      },
      types: {
        keep: types.keep !== false,
        weekend: types.weekend === true
      },
      embedOptions: {
        showPrice: embedOptions.showPrice !== false,
        showUntil: embedOptions.showUntil !== false,
        showThumbnail: embedOptions.showThumbnail !== false,
        showImage: embedOptions.showImage !== false,
        showButtons: embedOptions.showButtons !== false,
        showFooter: embedOptions.showFooter !== false,
        showSteamClientButton: embedOptions.showSteamClientButton !== false
      }
    };
  }

  function sampleItem({ platform = 'epic', type = 'keep' } = {}) {
    const now = new Date();
    const until = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const platformName = platform === 'steam' ? 'Steam' : (platform === 'ubisoft' ? 'Ubisoft' : 'Epic Games');
    const title = platform === 'steam' ? 'Sample Game (Steam)' : platform === 'ubisoft' ? 'Sample Game (Ubisoft)' : 'Sample Game (Epic)';
    const url = platform === 'steam'
      ? 'https://store.steampowered.com/app/730/CounterStrike_2/'
      : platform === 'ubisoft'
        ? 'https://store.ubisoft.com/'
        : 'https://store.epicgames.com/en-US/p/sample-game';
    return {
      id: platform + ':' + type + ':sample',
      title,
      platform,
      platformName,
      type,
      originalPrice: '€19.99',
      url,
      epicSlug: platform === 'epic' ? 'sample-game' : null,
      imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=60',
      until,
      publisher: 'Sample Publisher'
    };
  }

  function buildEmbed(item, options) {
    const o = normalizeConfig({ embedOptions: options }).embedOptions;

    const thumbs = {
      steam: 'https://cdn.simpleicons.org/steam/ffffff',
      epic: 'https://cdn.simpleicons.org/epicgames/ffffff',
      ubisoft: 'https://cdn.simpleicons.org/ubisoft/ffffff'
    };
    const untilStr = item.until
      ? item.until.toLocaleDateString('pt-PT')
      : null;

    let descParts = [];
    if (o.showPrice) descParts.push('~~' + (item.originalPrice || '—') + '~~');
    if (o.showUntil && untilStr) descParts.push((item.type === 'weekend' ? 'Free weekend until ' : 'Free until ') + '**' + untilStr + '**');
    const description = descParts.join(' ');

    const embed = {
      title: sanitizeText ? sanitizeText(item.title || '', 256) : (item.title || ''),
      url: item.url,
      description: description || undefined,
      thumbnail: o.showThumbnail ? { url: thumbs[item.platform] || thumbs.epic } : undefined,
      image: o.showImage ? { url: item.imageUrl } : undefined,
      footer: o.showFooter ? { text: 'via FreeToKeep • © ' + (item.publisher || item.platformName) } : undefined
    };

    const components = [];
    if (o.showButtons) {
      const row = { type: 1, components: [] };
      row.components.push({
        type: 2,
        style: 5,
        label: 'Open in browser ↗',
        url: item.url
      });

      // Epic launcher deep link (best-effort). For real items, this should be built from the Epic product slug.
      if (item.platform === 'epic') {
        const slug = item.epicSlug || (() => {
          const m = String(item.url || '').match(/\/p\/([^/?#]+)/);
          return m && m[1] ? m[1] : null;
        })();
        if (slug) {
          row.components.push({
            type: 2,
            style: 5,
            label: 'Open in Epic Games Launcher ↗',
            url: 'com.epicgames.launcher://store/p/' + slug
          });
        }
      }

      if (o.showSteamClientButton && item.platform === 'steam') {
        const m = String(item.url || '').match(/\/app\/(\d+)/);
        if (m && m[1]) {
          row.components.push({
            type: 2,
            style: 5,
            label: 'Open in Steam Client ↗',
            url: 'steam://store/' + m[1]
          });
        }
      }
      components.push(row);
    }
    return { embed, components };
  }

  app.get('/api/freetokeep/config', requireDashboardAuth, canView, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

      let cfg = await GuildConfig.findOne({ guildId }).maxTimeMS(5000).lean();
      if (!cfg) {
        cfg = await GuildConfig.create({ guildId });
        cfg = cfg.toObject();
      }
      const ft = normalizeConfig(cfg.freeToKeep);
      return res.json({ ok: true, config: ft });
    } catch (err) {
      console.error('[Dashboard] /api/freetokeep/config GET error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.post('/api/freetokeep/config', requireDashboardAuth, canEdit, guardGuildBody, async (req, res) => {
    try {
      const guildId = sanitizeId((req.body && req.body.guildId) || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

      const body = req.body || {};
      const next = normalizeConfig({
        enabled: body.enabled,
        channelId: sanitizeId(body.channelId || '') || null,
        pollIntervalSeconds: Number(body.pollIntervalSeconds),
        maxPerCycle: Number(body.maxPerCycle),
        platforms: body.platforms || {},
        types: body.types || {},
        embedOptions: body.embedOptions || {}
      });

      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: { freeToKeep: next } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, maxTimeMS: 5000 }
      );
      return res.json({ ok: true, config: next });
    } catch (err) {
      console.error('[Dashboard] /api/freetokeep/config POST error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.get('/api/freetokeep/recent', requireDashboardAuth, canView, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!FreeToKeepPost) return res.json({ ok: true, items: [] });

      const items = await FreeToKeepPost.find({ guildId })
        .sort({ createdAt: -1 })
        .limit(25)
        .select('platform type title url originalPrice until publisher isTest createdAt')
        .maxTimeMS(5000)
        .lean();
      return res.json({ ok: true, items: items || [] });
    } catch (err) {
      console.error('[Dashboard] /api/freetokeep/recent GET error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.get('/api/freetokeep/preview', requireDashboardAuth, canView, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });

      const platform = req.query.steam === '1' ? 'steam' : (req.query.ubisoft === '1' ? 'ubisoft' : 'epic');
      const type = req.query.weekend === '1' ? 'weekend' : 'keep';

      const options = {
        showPrice: req.query.sp !== '0',
        showUntil: req.query.su !== '0',
        showThumbnail: req.query.st !== '0',
        showImage: req.query.si !== '0',
        showButtons: req.query.sb !== '0',
        showFooter: req.query.sf !== '0',
        showSteamClientButton: req.query.sc !== '0'
      };

      const item = sampleItem({ platform, type });
      const built = buildEmbed(item, options);
      return res.json({ ok: true, preview: { item, embed: built.embed, components: built.components } });
    } catch (err) {
      console.error('[Dashboard] /api/freetokeep/preview GET error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.post('/api/freetokeep/test-send', requireDashboardAuth, canEdit, guardGuildBody, async (req, res) => {
    try {
      const guildId = sanitizeId((req.body && req.body.guildId) || '');
      const channelId = sanitizeId((req.body && req.body.channelId) || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!channelId) return res.status(400).json({ ok: false, error: 'CHANNEL_ID_REQUIRED' });

      const client = typeof getClient === 'function' ? getClient() : null;
      if (!client) return res.status(503).json({ ok: false, error: 'CLIENT_NOT_READY' });

      const platform = (req.body && req.body.platform) || 'epic';
      const type = (req.body && req.body.type) || 'keep';
      const embedOptions = (req.body && req.body.embedOptions) || {};

      const item = sampleItem({ platform, type });
      const built = buildEmbed(item, embedOptions);

      const chan = await client.channels.fetch(channelId).catch(() => null);
      if (!chan || typeof chan.send !== 'function') return res.status(404).json({ ok: false, error: 'CHANNEL_NOT_FOUND' });

      const msg = await chan.send({ embeds: [built.embed], components: built.components });

      if (FreeToKeepPost) {
        await FreeToKeepPost.create({
          guildId,
          platform: item.platform,
          type: item.type,
          title: item.title,
          url: item.url,
          originalPrice: item.originalPrice,
          until: item.until,
          publisher: item.publisher,
          isTest: true,
          messageId: msg && msg.id ? String(msg.id) : null,
          channelId: String(channelId)
        }).catch(() => {});
      }

      return res.json({ ok: true, sent: true });
    } catch (err) {
      console.error('[Dashboard] /api/freetokeep/test-send POST error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });
}

module.exports = { registerFreeToKeepRoutes };
