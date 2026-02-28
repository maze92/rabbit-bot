// src/systems/freeToKeep.js
//
// FreeToKeep notifier (Epic focus).
// Design goals:
// - Polls on a per-guild schedule (configurable).
// - Per cycle: sends ALL newly-free items (unless maxPerCycle > 0).
// - Persisted dedupe via FreeToKeepPost to avoid re-posting.

const { URL } = require('url');
const { fetchChannel } = require('../services/discordFetchCache');

let GuildConfig = null;
let FreeToKeepPost = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizeId(s) {
  const str = String(s || '');
  return /^[0-9]{16,20}$/.test(str) ? str : '';
}

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(min, Math.min(max, x));
}

function normalizeConfig(raw) {
  const c = raw || {};
  const platforms = c.platforms || {};
  const types = c.types || {};
  const embedOptions = c.embedOptions || {};

  return {
    enabled: c.enabled === true,
    channelId: sanitizeId(c.channelId || '') || null,
    pollIntervalSeconds: clamp(c.pollIntervalSeconds, 60, 3600) ?? 60,
    // 0/null => unlimited
    maxPerCycle: clamp(c.maxPerCycle, 0, 50) ?? 0,
    platforms: {
      epic: platforms.epic !== false,
      steam: platforms.steam === true, // not implemented yet
      ubisoft: platforms.ubisoft === true // not implemented yet
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

function formatDatePT(d) {
  try {
    return d.toLocaleDateString('pt-PT');
  } catch {
    return new Date(d).toISOString().slice(0, 10);
  }
}

function buildPayload(item, opts) {
  const o = normalizeConfig({ embedOptions: opts }).embedOptions;

  const thumbs = {
    steam: 'https://cdn.simpleicons.org/steam/ffffff',
    epic: 'https://cdn.simpleicons.org/epicgames/ffffff',
    ubisoft: 'https://cdn.simpleicons.org/ubisoft/ffffff'
  };

  const untilStr = item.until ? formatDatePT(item.until) : null;

  const descParts = [];
  if (o.showPrice) descParts.push('~~' + (item.originalPrice || '—') + '~~');
  if (o.showUntil && untilStr) descParts.push((item.type === 'weekend' ? 'Free weekend until ' : 'Free until ') + untilStr);

  const embed = {
    title: String(item.title || '').slice(0, 256),
    // IMPORTANT: no embed URL (title must not be a hyperlink)
    description: descParts.length ? descParts.join(' ') : undefined,
    thumbnail: o.showThumbnail ? { url: thumbs[item.platform] || thumbs.epic } : undefined,
    image: o.showImage && item.imageUrl ? { url: item.imageUrl } : undefined,
    footer: o.showFooter ? { text: 'via freestuffbot.xyz • © ' + (item.publisher || item.platformName || item.platform) } : undefined
  };

  const components = [];
  if (o.showButtons) {
    const row = { type: 1, components: [] };
    if (item.url) {
      row.components.push({ type: 2, style: 5, label: 'Open in browser ↗', url: item.url });
    }

    // Epic Launcher deep link when /p/<slug> exists
    if (item.platform === 'epic' && item.url) {
      try {
        const u = new URL(item.url);
        const m = u.pathname.match(/\/p\/([A-Za-z0-9-_.]+)/);
        if (m && m[1]) {
          row.components.push({
            type: 2,
            style: 5,
            label: 'Open in Epic Games Launcher ↗',
            url: 'com.epicgames.launcher://store/p/' + m[1]
          });
        }
      } catch {}
    }

    // Steam client deep link (optional)
    if (o.showSteamClientButton && item.platform === 'steam' && item.url) {
      const m = String(item.url).match(/store\.steampowered\.com\/app\/(\d+)/);
      if (m && m[1]) {
        row.components.push({ type: 2, style: 5, label: 'Open in Steam Client ↗', url: 'steam://store/' + m[1] });
      }
    }

    if (row.components.length) components.push(row);
  }

  return { embeds: [embed], components };
}

async function fetchEpicFreeToKeep() {
  // Epic "freeGamesPromotions" endpoint: widely used for current freebies.
  // We keep the request minimal and extract only "currently free" offers.
  const endpoint = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';
  const res = await fetch(endpoint, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; .rabbit/1.0)'
    }
  });
  if (!res.ok) throw new Error('Epic API HTTP ' + res.status);
  const json = await res.json();

  const elements = json?.data?.Catalog?.searchStore?.elements;
  if (!Array.isArray(elements)) return [];

  const out = [];
  for (const el of elements) {
    // We only want items that have a promotion right now.
    const promos = el?.promotions;
    const current = promos?.promotionalOffers?.[0]?.promotionalOffers?.[0];
    if (!current) continue;

    const start = current?.startDate ? new Date(current.startDate) : null;
    const end = current?.endDate ? new Date(current.endDate) : null;
    const now = new Date();
    if (!start || !end) continue;
    if (now < start || now > end) continue;

    const total = el?.price?.totalPrice;
    const discount = Number(total?.discountPrice ?? NaN);
    // discountPrice is in cents. For current freebies, it should be 0.
    if (!Number.isFinite(discount) || discount !== 0) continue;

    const originalFmt = total?.fmtPrice?.originalPrice || total?.fmtPrice?.discountPrice || '';
    const publisher = el?.seller?.name || el?.publisherName || '';

    // Pick best image
    const keyImages = Array.isArray(el?.keyImages) ? el.keyImages : [];
    const img =
      keyImages.find((i) => i?.type === 'OfferImageWide')?.url ||
      keyImages.find((i) => i?.type === 'DieselStoreFrontWide')?.url ||
      keyImages.find((i) => i?.type === 'Thumbnail')?.url ||
      keyImages[0]?.url ||
      null;

    const title = el?.title || el?.name || '';

    // Build /p/<slug> URL when possible (so dashboard can show deep link button)
    const slug =
      (Array.isArray(el?.catalogNs?.mappings) ? el.catalogNs.mappings[0]?.pageSlug : null) ||
      el?.productSlug ||
      el?.urlSlug ||
      null;
    const url = slug
      ? 'https://store.epicgames.com/en-US/p/' + slug
      : (el?.productHomeUrl || el?.url || null);

    out.push({
      id: 'epic:keep:' + String(el?.id || cryptoRandomId(title + String(end))),
      title,
      platform: 'epic',
      platformName: 'Epic Games',
      type: 'keep',
      originalPrice: originalFmt,
      url,
      imageUrl: img,
      until: end,
      publisher
    });
  }

  // Stable ordering: soonest ending first, then title
  out.sort((a, b) => {
    const ta = a.until ? new Date(a.until).getTime() : 0;
    const tb = b.until ? new Date(b.until).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(a.title).localeCompare(String(b.title));
  });

  return out;
}

function cryptoRandomId(seed) {
  // cheap deterministic-ish fallback without importing crypto
  const s = String(seed || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

async function getAllGuildConfigs() {
  if (!GuildConfig) return [];
  const docs = await GuildConfig.find({ 'freeToKeep.enabled': true }).select('guildId freeToKeep').lean();
  return Array.isArray(docs) ? docs : [];
}

async function alreadyPosted(guildId, platform, type, url) {
  if (!FreeToKeepPost) return false;
  if (!url) return false;
  const existing = await FreeToKeepPost.findOne({ guildId, platform, type, url, isTest: false })
    .select('_id')
    .maxTimeMS(5000)
    .lean();
  return !!existing;
}

async function recordPosted(guildId, channelId, messageId, item) {
  if (!FreeToKeepPost) return;
  try {
    await FreeToKeepPost.create({
      guildId,
      channelId,
      messageId,
      platform: item.platform,
      type: item.type,
      title: item.title,
      url: item.url,
      originalPrice: item.originalPrice || '',
      until: item.until || null,
      publisher: item.publisher || '',
      isTest: false
    });
  } catch {}
}

async function runOnceForGuild(client, guildId, cfg) {
  const c = normalizeConfig(cfg);
  if (!c.enabled) return;
  if (!c.channelId) return;

  // Only Epic implemented right now
  if (!c.platforms.epic) return;
  if (!c.types.keep) return;

  const channel = await fetchChannel(client, c.channelId);
  if (!channel) return;

  const items = await fetchEpicFreeToKeep();
  if (!items.length) return;

  let sent = 0;
  for (const item of items) {
    if (c.maxPerCycle > 0 && sent >= c.maxPerCycle) break;
    if (!item?.url) continue;
    if (await alreadyPosted(guildId, item.platform, item.type, item.url)) continue;

    const payload = buildPayload(item, c.embedOptions);
    try {
      const msg = await channel.send(payload);
      await recordPosted(guildId, channel.id, msg?.id || null, item);
      sent++;
      // small delay to avoid bursts
      await sleep(750);
    } catch {
      // If we fail to send, stop to avoid hammering
      break;
    }
  }
}

async function startFreeToKeep(client, config) {
  if (!client) throw new Error('client is required');

  try { GuildConfig = require('../database/models/GuildConfig'); } catch {}
  try { FreeToKeepPost = require('../database/models/FreeToKeepPost'); } catch {}

  if (!GuildConfig) {
    console.warn('[FreeToKeep] GuildConfig model missing. System disabled.');
    return;
  }
  if (!FreeToKeepPost) {
    console.warn('[FreeToKeep] FreeToKeepPost model missing. Deduping disabled.');
  }

  const state = new Map();
  let running = true;

  // scheduler loop
  (async () => {
    while (running) {
      try {
        const docs = await getAllGuildConfigs();
        const now = Date.now();

        for (const d of docs) {
          const gid = sanitizeId(d.guildId);
          if (!gid) continue;
          const c = normalizeConfig(d.freeToKeep);

          const key = gid;
          const last = state.get(key) || { nextAt: 0, busy: false };
          const intervalMs = (c.pollIntervalSeconds || 60) * 1000;
          if (last.busy) continue;
          if (now < last.nextAt) continue;

          last.busy = true;
          last.nextAt = now + intervalMs;
          state.set(key, last);

          runOnceForGuild(client, gid, d.freeToKeep)
            .catch(() => null)
            .finally(() => {
              const cur = state.get(key) || last;
              cur.busy = false;
              state.set(key, cur);
            });
        }
      } catch (err) {
        console.warn('[FreeToKeep] loop error:', err?.message || err);
      }

      await sleep(10_000);
    }
  })().catch(() => null);

  return {
    stop() {
      running = false;
    }
  };
}

module.exports = startFreeToKeep;
