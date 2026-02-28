// src/systems/giveaways.js
//
// Polls GamerPower giveaways and posts new items into configured guild channels.
// Uses /api/filter to support grouped platforms/types.
//
// Docs: https://www.gamerpower.com/api-read

const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../database/models/GuildConfig');
const GiveawayPost = require('../database/models/GiveawayPost');
const { fetchChannel } = require('../services/discordFetchCache');

const GAMERPOWER_BASE = 'https://www.gamerpower.com/api';

// Public base used for serving local assets (logos) to Discord.
// Must be reachable from the internet (your dashboard domain).
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');

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

function platformBadgePath(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.includes('steam')) return '/assets/platform-badges/steam.png';
  if (p.includes('epic')) return '/assets/platform-badges/epic.png';
  if (p.includes('ubisoft') || p.includes('uplay')) return '/assets/platform-badges/ubisoft.png';
  return null;
}

function platformBadgeUrl(platform) {
  const rel = platformBadgePath(platform);
  if (!rel) return null;
  if (!PUBLIC_BASE_URL) return null;
  return `${PUBLIC_BASE_URL}${rel}`;
}

function safeText(v, max = 1024) {
  if (v == null) return '';
  let s = String(v);
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (s.length > max) s = s.slice(0, max);
  return s;
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

function makeLinkLine({ browserUrl, platform }) {
  const url = safeText(browserUrl, 2048);
  if (!url) return '';
  const links = [`[Open in browser ↗](${url})`];
  const p = String(platform || '').toLowerCase();
  if (p.includes('steam')) {
    links.push(`[Open in Steam Client ↗](steam://openurl/${url})`);
  } else if (p.includes('epic')) {
    const m = url.match(/\/p\/([a-z0-9-]+)/i);
    if (m && m[1]) links.push(`[Open in Epic Games Launcher ↗](com.epicgames.launcher://store/p/${m[1]})`);
  }
  return links.join('     ');
}

function makeEmbedFromGiveaway(g) {
  const title = safeText(g.title, 256);
  const worth = safeText(g.worth, 64);
  const endDate = formatDateDMY(g.end_date);
  const publisher = safeText(g.publisher, 128);
  const image = normalizeImageUrl(g.image);
  const platform = pickPrimaryPlatform(g.platforms);
  const meta = [];

  if (worth && worth !== 'N/A') meta.push(`~~${worth}~~`);
  meta.push(`**Free** until ${endDate || '—'}`);

  const url = safeText(g.open_giveaway_url, 2048) || safeText(g.gamerpower_url, 2048) || '';
  const linkLine = makeLinkLine({ browserUrl: url, platform });
  const desc = linkLine ? `${meta.join(' ')}

${linkLine}` : meta.join(' '); else {
    descriptionParts.push(untilText);
  }

  const embed = new EmbedBuilder()
    .setTitle(title || 'Giveaway')
    .setDescription(desc)
    .setFooter({ text: `via .rabbitstuff.xyz${publisher ? `  •  © ${publisher}` : ''}` });

  // Important: do NOT set embed URL (otherwise Discord will hyperlink the title).
  if (image) embed.setImage(image);

  const thumb = platformBadgeUrl(platform);
  if (thumb) embed.setThumbnail(thumb);

  return embed;
}

// Links are rendered inside embed description to match the screenshot (not Discord buttons).

async function fetchGiveaways({ platforms, types }) {
  const p = normalizeList(platforms);
  const t = normalizeList(types);
  const platformParam = p.length ? p.join('.') : 'pc';
  const typeParam = t.length ? t.join('.') : 'game';

  const url = `${GAMERPOWER_BASE}/filter?platform=${encodeURIComponent(platformParam)}&type=${encodeURIComponent(typeParam)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'accept': 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GamerPower fetch failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

async function postGiveawayToGuild(client, guildId, channelId, g) {
  const ch = await fetchChannel(client, channelId).catch(() => null);
  if (!ch || typeof ch.send !== 'function') return { ok: false, reason: 'channel_not_found' };

  const embed = makeEmbedFromGiveaway(g);
  await ch.send({ embeds: [embed] }).catch((e) => {
    throw new Error(`Discord send failed: ${e && e.message ? e.message : String(e)}`);
  });

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

      let items = [];
      try {
        items = await fetchGiveaways({ platforms, types });
      } catch (e) {
        // Keep silent to avoid spamming logs; you can wire this to logger later.
        continue;
      }

      if (!Array.isArray(items) || !items.length) continue;

      // Newest first isn't ideal; post oldest->newest within the cycle to preserve chronology.
      // We also limit to the configured max.
      const candidates = items
        .filter((it) => it && typeof it.id === 'number')
        .slice()
        .reverse();

      const toPost = [];
      for (const it of candidates) {
        // Dedupe by (guildId, giveawayId)
        const exists = await GiveawayPost.findOne({ guildId, giveawayId: it.id }).lean().catch(() => null);
        if (exists) continue;
        toPost.push(it);
        if (maxPerCycle > 0 && toPost.length >= maxPerCycle) break;
      }

      for (const it of toPost) {
        try {
          await postGiveawayToGuild(client, guildId, channelId, it);
          await GiveawayPost.create({
            guildId,
            giveawayId: it.id,
            platform: pickPrimaryPlatform(it.platforms),
            type: it.type || null,
            title: it.title || null,
            url: it.open_giveaway_url || it.gamerpower_url || null
          }).catch(() => {});
        } catch (e) {
          // If sending fails, don't mark as posted.
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
