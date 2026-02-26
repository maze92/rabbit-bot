// src/dashboard/routes/freetokeep.js

const { z } = require('zod');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PLATFORM_QUERY = {
  epic: 'epic-games-store',
  steam: 'steam',
  ubisoft: 'ubisoft'
};

const PLATFORM_ICON = {
  epic: 'https://cdn.simpleicons.org/epicgames/ffffff',
  steam: 'https://cdn.simpleicons.org/steam/ffffff',
  ubisoft: 'https://cdn.simpleicons.org/ubisoft/ffffff'
};

function extractSteamAppId(url) {
  const u = String(url || '');
  const m = u.match(/\/app\/(\d+)/i);
  if (m && m[1]) return m[1];
  const m2 = u.match(/store\.steampowered\.com\/app\/(\d+)/i);
  if (m2 && m2[1]) return m2[1];
  return null;
}

function detectOfferKind(item) {
  const hay = `${item?.title || ''} ${item?.description || ''} ${item?.instructions || ''}`.toLowerCase();
  if (hay.includes('free weekend') || hay.includes('free-weekend') || hay.includes('weekend only')) return 'freeweekend';
  if (hay.includes('play for free') || hay.includes('play free') || hay.includes('free to play this weekend')) return 'freeweekend';
  return 'freetokeep';
}

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; .rabbit/1.0; +https://github.com/maze92/rabbit-bot)',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${text}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function buildEmbed(item, platformKey, platformLabel, kind, embedOptions) {
  const title = item?.title ? String(item.title) : 'Free game';
  const worth = item?.worth ? String(item.worth) : '';
  const end = item?.end_date ? String(item.end_date) : '';

  const eo = embedOptions || {};
  const showPrice = eo.showPrice !== false;
  const showUntil = eo.showUntil !== false;
  const showThumb = eo.showThumbnail !== false;
  const showImage = eo.showImage !== false;
  const showFooter = eo.showFooter !== false;

  const isValidEnd = end && String(end).toLowerCase() !== 'n/a';
  const pricePart = (showPrice && worth) ? `~~${worth}~~` : '';
  const untilPart = showUntil
    ? (isValidEnd
        ? (kind === 'freeweekend' ? `Free weekend until **${end}**` : `Free until **${end}**`)
        : (kind === 'freeweekend' ? 'Free weekend' : 'Free to keep'))
    : '';
  const description = [pricePart, untilPart].filter(Boolean).join(' ').trim();

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setURL(item?.open_giveaway_url || item?.gamerpower_url || item?.url || '');

  if (description) embed.setDescription(description);
  if (showFooter) embed.setFooter({ text: `via GamerPower • © ${String(item?.publisher || platformLabel)}` });

  const icon = PLATFORM_ICON[platformKey];
  if (showThumb && icon) {
    try { embed.setThumbnail(icon); } catch {}
  }
  if (showImage && item?.thumbnail) {
    try { embed.setImage(String(item.thumbnail)); } catch {}
  }
  return embed;
}

function buildButtons(item, platformKey, embedOptions) {
  const eo = embedOptions || {};
  const showButtons = eo.showButtons !== false;
  const showClient = eo.showClientButton !== false;
  if (!showButtons) return null;
  const url = item?.open_giveaway_url || item?.gamerpower_url || item?.url;
  if (!url) return null;

  const buttons = [
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open in browser ↗').setURL(String(url))
  ];

  if (platformKey === 'steam' && showClient) {
    const appId = extractSteamAppId(url);
    if (appId) {
      buttons.push(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open in Steam Client ↗').setURL(`steam://store/${appId}`)
      );
    }
  }

  return new ActionRowBuilder().addComponents(buttons.slice(0, 5));
}

function toPreviewPayload(item, platformKey, kind, embedOptions) {
  const platformLabel = platformKey === 'epic' ? 'Epic Games Store' : platformKey === 'steam' ? 'Steam' : 'Ubisoft';
  const embed = buildEmbed(item, platformKey, platformLabel, kind, embedOptions);
  const url = item?.open_giveaway_url || item?.gamerpower_url || item?.url || '';
  const row = buildButtons(item, platformKey, embedOptions);
  const buttons = row?.components?.map((c) => ({ label: c.label, url: c.url })) || [{ label: 'Open in browser', url: String(url) }];

  return {
    platform: platformKey,
    kind,
    title: embed.data?.title || String(item?.title || ''),
    url: embed.data?.url || String(url),
    description: embed.data?.description || '',
    image: item?.thumbnail ? String(item.thumbnail) : '',
    platformIcon: (embedOptions && embedOptions.showThumbnail === false) ? '' : (PLATFORM_ICON[platformKey] || ''),
    footer: embed.data?.footer?.text || '',
    buttons
  };
}

const FreeToKeepConfigSchema = z.object({
  guildId: z.string().min(1),
  enabled: z.boolean().optional(),
  channelId: z.string().optional(),
  platforms: z
    .object({
      epic: z.boolean().optional(),
      steam: z.boolean().optional(),
      ubisoft: z.boolean().optional()
    })
    .optional(),
  offerTypes: z
    .object({
      freetokeep: z.boolean().optional(),
      freeweekend: z.boolean().optional()
    })
    .optional(),
  pollIntervalMs: z.number().int().optional(),
  maxPerCycle: z.number().int().optional(),
  embedOptions: z
    .object({
      showPrice: z.boolean().optional(),
      showUntil: z.boolean().optional(),
      showThumbnail: z.boolean().optional(),
      showImage: z.boolean().optional(),
      showButtons: z.boolean().optional(),
      showFooter: z.boolean().optional(),
      showClientButton: z.boolean().optional()
    })
    .optional()
});

function boolish(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function registerFreeToKeepRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  rateLimit,
  sanitizeId,
  FreeToKeepConfig,
  FreeToKeepPost,
  getClient
}) {
  // Defensive fallbacks (avoid fragile boot / proxy timeouts).
  const _rateLimit = typeof rateLimit === 'function' ? rateLimit : (req, res, next) => next();
  const _requireGuildAccess = typeof requireGuildAccess === 'function'
    ? requireGuildAccess
    : () => (req, res, next) => next();

  const guardGuildQuery = _requireGuildAccess({ from: 'query', key: 'guildId' });
  const guardGuildBody = _requireGuildAccess({ from: 'body', key: 'guildId' });

  // Bound DB ops; some hosting layers surface long waits as HTTP 504.
  const DB_MAX_MS = 5000;

  // Instant preview/sample payload (no external dependency).
  const SAMPLE_ITEM = {
    id: 'sample',
    title: 'Example Game',
    worth: '€19.99',
    end_date: '31/12/2099',
    open_giveaway_url: 'https://example.com',
    thumbnail: 'https://picsum.photos/1200/630',
    publisher: 'Example Publisher'
  };

  // Read config
  app.get('/api/freetokeep/config', _rateLimit, requireDashboardAuth, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId);
      if (!FreeToKeepConfig) return res.json({ ok: true, config: null });
      const cfg = await FreeToKeepConfig.findOne({ guildId }).maxTimeMS(DB_MAX_MS).lean();
      return res.json({ ok: true, config: cfg || null });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });

  // Upsert config
  app.put('/api/freetokeep/config', _rateLimit, requireDashboardAuth, requirePerm('admin'), guardGuildBody, async (req, res) => {
    try {
      const parsed = FreeToKeepConfigSchema.parse(req.body || {});
      const guildId = sanitizeId(parsed.guildId);

      if (!FreeToKeepConfig) return res.status(500).json({ ok: false, error: 'MODEL_NOT_READY' });

      const update = {};
      if (typeof parsed.enabled === 'boolean') update.enabled = parsed.enabled;
      if (typeof parsed.channelId === 'string') update.channelId = sanitizeId(parsed.channelId);

      if (parsed.platforms) {
        update.platforms = {
          epic: boolish(parsed.platforms.epic),
          steam: boolish(parsed.platforms.steam),
          ubisoft: boolish(parsed.platforms.ubisoft)
        };
      }

      if (parsed.offerTypes) {
        update.offerTypes = {
          freetokeep: boolish(parsed.offerTypes.freetokeep),
          freeweekend: boolish(parsed.offerTypes.freeweekend)
        };
      }

      if (typeof parsed.pollIntervalMs === 'number') {
        update.pollIntervalMs = clampInt(parsed.pollIntervalMs, 30_000, 30 * 60_000, 120_000);
      }
      if (typeof parsed.maxPerCycle === 'number') {
        update.maxPerCycle = clampInt(parsed.maxPerCycle, 1, 10, 3);
      }

      if (parsed.embedOptions) {
        update.embedOptions = {
          showPrice: boolish(parsed.embedOptions.showPrice),
          showUntil: boolish(parsed.embedOptions.showUntil),
          showThumbnail: boolish(parsed.embedOptions.showThumbnail),
          showImage: boolish(parsed.embedOptions.showImage),
          showButtons: boolish(parsed.embedOptions.showButtons),
          showFooter: boolish(parsed.embedOptions.showFooter),
          showClientButton: boolish(parsed.embedOptions.showClientButton)
        };
      }

      const cfg = await FreeToKeepConfig.findOneAndUpdate(
        { guildId },
        { $set: update, $setOnInsert: { guildId } },
        { upsert: true, new: true }
      ).maxTimeMS(DB_MAX_MS).lean();

      return res.json({ ok: true, config: cfg });
    } catch (e) {
      if (e?.name === 'ZodError') {
        return res.status(400).json({ ok: false, error: 'INVALID_BODY', details: e.errors });
      }
      return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });

  // Recent posts
  app.get('/api/freetokeep/recent', _rateLimit, requireDashboardAuth, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId);
      if (!FreeToKeepPost) return res.json({ ok: true, items: [] });
      const items = await FreeToKeepPost.find({ guildId })
        .sort({ postedAt: -1 })
        .limit(20)
        .maxTimeMS(DB_MAX_MS)
        .lean();
      return res.json({ ok: true, items: items || [] });
    } catch {
      return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });

  // Preview a candidate (does not send)
  // IMPORTANT: This must be instant and not depend on external services.
  app.get('/api/freetokeep/preview', _rateLimit, requireDashboardAuth, guardGuildQuery, async (req, res) => {
    try {
      const epic = boolish(req.query.epic);
      const steam = boolish(req.query.steam);
      const ubisoft = boolish(req.query.ubisoft);
      const keep = boolish(req.query.keep);
      const weekend = boolish(req.query.weekend);

      const platformKeys = [];
      if (epic) platformKeys.push('epic');
      if (steam) platformKeys.push('steam');
      if (ubisoft) platformKeys.push('ubisoft');

      const allow = {
        freetokeep: keep !== false,
        freeweekend: !!weekend
      };

      const embedOptions = {
        showPrice: boolish(req.query.sp),
        showUntil: boolish(req.query.su),
        showThumbnail: boolish(req.query.st),
        showImage: boolish(req.query.si),
        showButtons: boolish(req.query.sb),
        showFooter: boolish(req.query.sf),
        showClientButton: boolish(req.query.sc)
      };

      if (!platformKeys.length || (!allow.freetokeep && !allow.freeweekend)) {
        return res.json({ ok: true, preview: null });
      }

      const platformKey = platformKeys[0];
      const kind = allow.freeweekend ? 'freeweekend' : 'freetokeep';
      return res.json({ ok: true, preview: toPreviewPayload(SAMPLE_ITEM, platformKey, kind, embedOptions) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });

  // Send a test message to the selected channel (and returns preview payload)
  app.post('/api/freetokeep/test-send', _rateLimit, requireDashboardAuth, requirePerm('admin'), guardGuildBody, async (req, res) => {
    try {
      const guildId = sanitizeId(req.body.guildId);
      const channelId = sanitizeId(req.body.channelId);
      if (!guildId || !channelId) return res.status(400).json({ ok: false, error: 'INVALID_BODY' });

      const client = typeof getClient === 'function' ? getClient() : null;
      if (!client) return res.status(500).json({ ok: false, error: 'CLIENT_NOT_READY' });

      const platforms = req.body.platforms || {};
      const offerTypes = req.body.offerTypes || {};
      const embedOptions = req.body.embedOptions || {};
      const platformKeys = ['epic', 'steam', 'ubisoft'].filter((k) => boolish(platforms[k]));
      const allow = {
        freetokeep: boolish(offerTypes.freetokeep),
        freeweekend: boolish(offerTypes.freeweekend)
      };
      if (!platformKeys.length || (!allow.freetokeep && !allow.freeweekend)) {
        return res.status(400).json({ ok: false, error: 'INVALID_BODY' });
      }

      const platformKey = platformKeys[0];
      const kind = allow.freeweekend ? 'freeweekend' : 'freetokeep';
      const platformLabel = platformKey === 'epic' ? 'Epic Games Store' : platformKey === 'steam' ? 'Steam' : 'Ubisoft';
      const embed = buildEmbed(SAMPLE_ITEM, platformKey, platformLabel, kind, embedOptions);
      const row = buildButtons(SAMPLE_ITEM, platformKey, embedOptions);

      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (!ch || !ch.isTextBased?.()) return res.status(404).json({ ok: false, error: 'CHANNEL_NOT_FOUND' });
      const msg = await ch.send({ embeds: [embed], components: row ? [row] : [] });

      // Save as a normal post to appear in "recent" (but tag it as test)
      if (FreeToKeepPost) await FreeToKeepPost.create({
        guildId,
        platform: platformKey,
        giveawayId: 'sample',
        kind,
        title: String(SAMPLE_ITEM.title || ''),
        worth: String(SAMPLE_ITEM.worth || ''),
        endDate: String(SAMPLE_ITEM.end_date || ''),
        url: String(SAMPLE_ITEM.open_giveaway_url || ''),
        image: String(SAMPLE_ITEM.thumbnail || ''),
        publisher: String(SAMPLE_ITEM.publisher || ''),
        channelId,
        messageId: String(msg?.id || ''),
        postedAt: new Date(),
        isTest: true
      });

      return res.json({ ok: true, preview: toPreviewPayload(SAMPLE_ITEM, platformKey, kind, embedOptions) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });
}

module.exports = { registerFreeToKeepRoutes };
