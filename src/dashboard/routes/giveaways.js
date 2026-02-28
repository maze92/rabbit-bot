// src/dashboard/routes/giveaways.js
//
// Dashboard routes to configure GamerPower giveaways per guild.

const { z } = require('zod');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

const GAMERPOWER_BASE = 'https://www.gamerpower.com/api';
const BADGE_DIR = path.join(__dirname, '../../../public/assets/platform-badges');

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

      const payload = await buildTestMessage({ platform });
      await ch.send(payload);

      return res.json({ ok: true });
    } catch (e) {
      // Surface a trimmed error to help debugging in production logs/UI.
      const msg = (e && e.message) ? String(e.message) : String(e);
      return res.status(500).json({ ok: false, error: 'internal_error', message: msg.slice(0, 180) });
    }
  });
}

function normalizeImageUrl(url) {
  const u = String(url || '').trim();
  if (!u || u === 'N/A') return '';
  return u.startsWith('http://') ? ('https://' + u.slice('http://'.length)) : u;
}

function cleanGiveawayTitle(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/\s*\(?(steam|epic|ubisoft)\)?\s*giveaway\s*$/i, '');
  s = s.replace(/\s*giveaway\s*$/i, '');
  return s.trim();
}

function formatDateDMY(value) {
  const s = String(value || '').trim();
  if (!s || s === 'N/A') return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function badgeAttachment(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.includes('steam')) return { file: path.join(BADGE_DIR, 'steam.png'), name: 'steam.png' };
  if (p.includes('epic')) return { file: path.join(BADGE_DIR, 'epic.png'), name: 'epic.png' };
  return { file: path.join(BADGE_DIR, 'ubisoft.png'), name: 'ubisoft.png' };
}

function makeLinkLine({ browserUrl, clientUrl, platform }) {
  const browser = String(browserUrl || '').trim();
  const client = String(clientUrl || '').trim();
  if (!browser && !client) return '';
  const SEP = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';
  const links = [];
  if (browser) links.push(`**[Open in browser ↗](${browser})**`);
  const p = String(platform || '').toLowerCase();
  if (p.includes('steam')) { if (client) links.push(`**[Open in Steam Client ↗](${client})**`); }
  else if (p.includes('epic')) { if (client) links.push(`**[Open in Epic Games Launcher ↗](${client})**`); }
  else if (p.includes('ubisoft')) { if (client) links.push(`**[Open in Ubisoft ↗](${client})**`); }
  return links.join(SEP);
}

async function buildTestMessage({ platform }) {
  const platParam = (String(platform).includes('steam') ? 'steam' : (String(platform).includes('epic') ? 'epic-games-store' : 'ubisoft'));
  const url = `${GAMERPOWER_BASE}/filter?platform=${encodeURIComponent(platParam)}&type=game`;
  const res = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } }).catch(() => null);
  const list = res && res.ok ? await res.json().catch(() => []) : [];
  // Prefer an item that has an image and links, otherwise fall back to the first.
  const g = (Array.isArray(list) && list.length)
    ? (list.find((it) => it && it.image && it.image !== 'N/A' && it.gamerpower_url) || list[0])
    : null;

  const title = g && g.title ? cleanGiveawayTitle(g.title) : 'TEST';
  const worth = g && g.worth ? String(g.worth) : '';
  const until = formatDateDMY(g && g.end_date ? g.end_date : '');
  const image = normalizeImageUrl(g && g.image ? g.image : '');
  const browserUrl = (g && g.gamerpower_url) ? String(g.gamerpower_url) : 'https://www.gamerpower.com/';
  const clientUrl = (g && g.open_giveaway_url) ? String(g.open_giveaway_url) : browserUrl;
  const publisher = g && g.publisher ? String(g.publisher) : '';

  const meta = `${(worth && worth !== 'N/A') ? `~~${worth}~~ ` : ''}**Free** until ${until || '—'}`;
  const linkLine = makeLinkLine({ browserUrl, clientUrl, platform: platParam });

  const badgeInfo = badgeAttachment(platParam);
  const badgeFile = badgeInfo ? new AttachmentBuilder(badgeInfo.file, { name: badgeInfo.name }) : null;

  const embed = {
    title,
    description: linkLine ? `${meta}

${linkLine}` : meta,
    thumbnail: badgeFile ? { url: `attachment://${badgeInfo.name}` } : undefined,
    image: image ? { url: image } : undefined,
    footer: { text: `via .rabbitstuff.xyz${publisher ? `  •  © ${publisher}` : ''}` }
  };

  return { embeds: [embed], files: badgeFile ? [badgeFile] : [] };
}

module.exports = { registerGiveawaysRoutes };
