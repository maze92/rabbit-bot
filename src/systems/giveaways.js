// src/systems/giveaways.js
//
// Polls GamerPower giveaways and posts new items into configured guild channels.
// Uses /api/filter to support grouped platforms/types.
//
// Docs: https://www.gamerpower.com/api-read

const path = require('path');
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../database/models/GuildConfig');
const GiveawayPost = require('../database/models/GiveawayPost');
const { fetchChannel } = require('../services/discordFetchCache');

const GAMERPOWER_BASE = 'https://www.gamerpower.com/api';

// We attach platform icons to each message to avoid hotlink/rate-limit issues and
// avoid relying on PUBLIC_BASE_URL being configured.
const BADGE_DIR = path.join(__dirname, '../../public/assets/platform-badges');

function platformBadgePublicUrl(platform) {
  const p = String(platform || '').toLowerCase();
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (base) {
    if (p.includes('steam')) return `${base}/assets/platform-badges/steam.png`;
    if (p.includes('epic')) return `${base}/assets/platform-badges/epic.png`;
    if (p.includes('ubisoft') || p.includes('uplay')) return `${base}/assets/platform-badges/ubisoft.png`;
  }
  // Fallback to cached CDN->PNG proxy (stable https, no attach_files permission needed).
  // weserv expects the upstream url without protocol.
  if (p.includes('steam')) return 'https://images.weserv.nl/?url=cdn.jsdelivr.net/npm/simple-icons@v9/icons/steam.svg&output=png&w=240&h=240&fit=contain';
  if (p.includes('epic')) return 'https://images.weserv.nl/?url=cdn.jsdelivr.net/npm/simple-icons@v9/icons/epicgames.svg&output=png&w=240&h=240&fit=contain';
  if (p.includes('ubisoft') || p.includes('uplay')) return 'https://images.weserv.nl/?url=cdn.jsdelivr.net/npm/simple-icons@v9/icons/ubisoft.svg&output=png&w=240&h=240&fit=contain';
  return '';
}

function clampInt(n, { min = 0, max = 1_000_000, fallback = 0 } = {}) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function normalizeList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => String(s || '').trim()).filter(Boolean);
}

function pickPrimaryPlatform(platforms) {
  const p = String(platforms || '').toLowerCase();
  // API sometimes returns comma-separated, sometimes a single string.
  const parts = p.split(/\s*,\s*/).filter(Boolean);
  return parts[0] || null;
}

function platformLabel(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.includes('steam')) return 'Steam';
  if (p.includes('epic')) return 'Epic Games';
  if (p.includes('ubisoft') || p.includes('uplay')) return 'Ubisoft';
  if (p.includes('gog')) return 'GOG';
  if (p.includes('itch')) return 'itch.io';
  return platform || 'Platform';
}

function platformBadgeFile(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.includes('steam')) return { file: path.join(BADGE_DIR, 'steam.png'), name: 'steam.png' };
  if (p.includes('epic')) return { file: path.join(BADGE_DIR, 'epic.png'), name: 'epic.png' };
  if (p.includes('ubisoft') || p.includes('uplay')) return { file: path.join(BADGE_DIR, 'ubisoft.png'), name: 'ubisoft.png' };
  return null;
}

function buildPlatformBadgeAttachment(platform) {
  const info = platformBadgeFile(platform);
  if (!info) return null;
  return { file: info.file, name: info.name, url: `attachment://${info.name}` };
}

function safeText(v, max = 1024) {
  if (v == null) return '';
  let s = String(v);
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (s.length > max) s = s.slice(0, max);
  return s;
}

function cleanGiveawayTitle(raw) {
  let s = safeText(raw, 256);
  // Some items prepend platform branding like "(Epic Games)".
  s = s.replace(/^\s*\((steam|epic\s*games?|ubisoft)\)\s*/i, '');
  s = s.replace(/^\s*(steam|epic\s*games?|ubisoft)\s*:\s*/i, '');
  // GamerPower sometimes appends platform noise like "(Steam) Giveaway" or "Steam Giveaway".
  s = s.replace(/\s*\(?(steam|epic|ubisoft)\)?\s*giveaway\s*$/i, '');
  s = s.replace(/\s*giveaway\s*$/i, '');
  return s.trim();
}

function normalizeImageUrl(url) {
  const u = safeText(url, 2048);
  if (!u || u === 'N/A') return '';
  if (u.startsWith('http://')) return 'https://' + u.slice('http://'.length);
  return u;
}

function formatDateDMY(value) {
  const s = safeText(value, 64);
  if (!s || s === 'N/A') return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function parseToUnixSeconds(value) {
  const s = safeText(value, 64);
  if (!s || s === 'N/A') return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

function makeLinkLine({ browserUrl, clientUrl, platform }) {
  const browser = safeText(browserUrl, 2048);
  const client = safeText(clientUrl, 2048);
  if (!browser && !client) return '';

  // Discord markdown collapses normal spaces; use NBSP to mimic wide spacing.
  const SEP = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';

  const links = [];
  if (browser) links.push(`**[Open in browser ↗](${browser})**`);
  const p = String(platform || '').toLowerCase();
  if (p.includes('steam')) {
    if (client) links.push(`**[Open in Steam Client ↗](${client})**`);
  } else if (p.includes('epic')) {
    if (client) links.push(`**[Open in Epic Games ↗](${client})**`);
  } else if (p.includes('ubisoft')) {
    if (client) links.push(`**[Open in Ubisoft Games ↗](${client})**`);
  }
  return links.join(SEP);
}

function resolvePlatformFromItem(g, fallbackPlatform) {
  const fromItem = pickPrimaryPlatform(g && g.platforms);
  const norm = (p) => String(p || '').toLowerCase();
  if (fromItem && (norm(fromItem).includes('steam') || norm(fromItem).includes('epic') || norm(fromItem).includes('ubisoft') || norm(fromItem).includes('uplay'))) {
    return fromItem;
  }
  return fallbackPlatform || fromItem || null;
}

function makeEmbedFromGiveaway(g, { forcedPlatform = null } = {}) {
  const title = cleanGiveawayTitle(g.title);
  const worth = safeText(g.worth, 64);
  const endDate = formatDateDMY(g.end_date);
  const endUnix = parseToUnixSeconds(g.end_date);
  const publisher = safeText(g.publisher, 128);
  const image = normalizeImageUrl(g.image);
  const platform = resolvePlatformFromItem(g, forcedPlatform);
  const meta = [];

  if (worth && worth !== 'N/A') meta.push(`~~${worth}~~`);
  meta.push(`**Free** until ${endUnix ? `<t:${endUnix}:d>` : (endDate || '—')}`);

  // "Open in browser" should open the game's giveaway/store page when possible.
  // GamerPower often provides giveaway_url (store page) and open_giveaway_url (client/open flow).
  const browserUrl = safeText(g.giveaway_url, 2048) || safeText(g.open_giveaway_url, 2048) || safeText(g.gamerpower_url, 2048) || '';
  const clientUrl = safeText(g.open_giveaway_url, 2048) || '';
  const linkLine = makeLinkLine({ browserUrl, clientUrl, platform });
  const desc = linkLine
    ? `${meta.join(' ')}\n\n${linkLine}`
    : meta.join(' ');

  const embed = new EmbedBuilder()
    .setTitle(title || 'Giveaway')
    .setDescription(desc)
    .setFooter({ text: `via .rabbitstuff.xyz${publisher ? `  •  © ${publisher}` : ''}` });

  // Important: do NOT set embed URL (otherwise Discord will hyperlink the title).
  if (image) embed.setImage(image);

  const badge = buildPlatformBadgeAttachment(platform);
  // Thumbnail is decided at send-time. We return both options:
  // - attachment badge (best match to your provided PNGs, requires ATTACH_FILES)
  // - public https badge url (works even without ATTACH_FILES)
  const badgeUrl = platformBadgePublicUrl(platform);

  return { embed, badge, badgeUrl };
}

// Links are rendered inside embed description to match the screenshot (not Discord buttons).

async function fetchGiveaways({ platform, types }) {
  const p = String(platform || 'pc').trim() || 'pc';
  const t = normalizeList(types);
  // Use the /giveaways endpoint for single-platform fetches; it tends to be more consistent
  // than /filter for some platforms (notably Ubisoft).
  const typeParam = t.length ? t[0] : 'game';

  const url = `${GAMERPOWER_BASE}/giveaways?platform=${encodeURIComponent(p)}&type=${encodeURIComponent(typeParam)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'accept': 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GamerPower fetch failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

async function postGiveawayToGuild(client, guildId, channelId, g, { forcedPlatform = null } = {}) {
  const ch = await fetchChannel(client, channelId).catch(() => null);
  if (!ch || typeof ch.send !== 'function') return { ok: false, reason: 'channel_not_found' };

  const built = makeEmbedFromGiveaway(g, { forcedPlatform });
  const embed = built.embed;

  // Platform badge MUST be a perfect PNG (your provided files). We send it as an attachment
  // and reference it with attachment://... in the embed thumbnail.
  //
  // If this fails, it usually means: file missing in deployment, or the channel disallows
  // attachments/embeds. We only fallback to an HTTPS URL if explicitly enabled.
  const allowFallback = String(process.env.ALLOW_PLATFORM_ICON_FALLBACK || '').trim() === '1';

  if (built.badge) {
    if (!fs.existsSync(built.badge.file)) {
      throw new Error(`Platform badge missing on disk: ${built.badge.file}`);
    }

    embed.setThumbnail(built.badge.url);
    try {
      await ch.send({
        embeds: [embed],
        files: [{ attachment: fs.createReadStream(built.badge.file), name: built.badge.name }]
      });
      return { ok: true };
    } catch (e) {
      if (!allowFallback) {
        throw new Error(`Discord send failed (badge attachment): ${e && e.message ? e.message : String(e)}`);
      }
      // Optional fallback (not desired, but can keep the system alive if you choose).
      if (built.badgeUrl) embed.setThumbnail(built.badgeUrl);
      await ch.send({ embeds: [embed] });
      return { ok: true };
    }
  }

  // No badge for platform; send without thumbnail.
  await ch.send({ embeds: [embed] });

  return { ok: true };
}

async function startGiveaways(client) {
  if (!client) throw new Error('startGiveaways requires a Discord client');

  let stopped = false;
  const lastPollAt = new Map(); // guildId -> ts
  let lastConfigsFetchAt = 0;
  let cachedConfigs = [];

  async function loadEnabledConfigs() {
    const docs = await GuildConfig.find({ 'giveaways.enabled': true }).lean().catch(() => []);
    cachedConfigs = Array.isArray(docs) ? docs : [];
    lastConfigsFetchAt = Date.now();
    return cachedConfigs;
  }

  async function tick() {
    if (stopped) return;

    const now = Date.now();
    if (!lastConfigsFetchAt || now - lastConfigsFetchAt > 60_000) {
      await loadEnabledConfigs().catch(() => {});
    }

    const configs = cachedConfigs || [];
    for (const cfg of configs) {
      const guildId = String(cfg.guildId || '');
      const gcfg = cfg.giveaways || {};
      const channelId = String(gcfg.channelId || '');
      if (!guildId || !channelId) continue;

      const intervalSec = clampInt(gcfg.pollIntervalSeconds, { min: 60, max: 3600, fallback: 60 });
      const last = lastPollAt.get(guildId) || 0;
      if (now - last < intervalSec * 1000) continue;

      lastPollAt.set(guildId, now);

      const platforms = normalizeList(gcfg.platforms);
      const types = normalizeList(gcfg.types);
      const maxPerCycle = clampInt(gcfg.maxPerCycle, { min: 0, max: 50, fallback: 0 });

      const perPlatform = platforms.length ? platforms : ['steam'];
      let postedCount = 0;

      for (const plat of perPlatform) {
        if (maxPerCycle > 0 && postedCount >= maxPerCycle) break;

        let items = [];
        try {
          items = await fetchGiveaways({ platform: plat, types });
        } catch (_) {
          continue;
        }

        if (!Array.isArray(items) || !items.length) continue;

        // Post oldest->newest within the cycle to preserve chronology.
        const candidates = items
          .filter((it) => it && typeof it.id === 'number')
          .slice()
          .reverse();

        for (const it of candidates) {
          if (maxPerCycle > 0 && postedCount >= maxPerCycle) break;

          const exists = await GiveawayPost.findOne({ guildId, giveawayId: it.id }).lean().catch(() => null);
          if (exists) continue;

          try {
            await postGiveawayToGuild(client, guildId, channelId, it, { forcedPlatform: plat });
            await GiveawayPost.create({
              guildId,
              giveawayId: it.id,
              platform: plat,
              type: it.type || null,
              title: it.title || null,
              url: it.open_giveaway_url || it.giveaway_url || it.gamerpower_url || null
            }).catch(() => {});
            postedCount += 1;
          } catch (_) {
            // If sending fails, don't mark as posted.
          }
        }
      }
    }
  }

  // Main loop at a conservative cadence; per-guild interval controls real posting.
  const timer = setInterval(() => {
    tick().catch(() => {});
  }, 15_000);

  // Initial load
  loadEnabledConfigs().catch(() => {});
  tick().catch(() => {});

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    }
  };
}

module.exports = startGiveaways;
