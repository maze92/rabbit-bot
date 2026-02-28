// src/systems/giveaways.js
//
// Polls GamerPower giveaways and posts new items into configured guild channels.
// Uses /api/filter to support grouped platforms/types.
//
// Docs: https://www.gamerpower.com/api-read

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const GuildConfig = require('../database/models/GuildConfig');
const GiveawayPost = require('../database/models/GiveawayPost');
const { fetchChannel } = require('../services/discordFetchCache');

const GAMERPOWER_BASE = 'https://www.gamerpower.com/api';

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

function platformThumbnailUrl(platform) {
  const p = String(platform || '').toLowerCase();
  // Wikimedia rate-limits hotlinking (429) on some hosts. Use jsDelivr + weserv rasterizer.
  if (p.includes('steam')) return 'https://images.weserv.nl/?url=cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/steam.svg&output=png&bg=ffffff&w=256&h=256';
  if (p.includes('epic')) return 'https://images.weserv.nl/?url=cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/epicgames.svg&output=png&bg=ffffff&w=256&h=256';
  if (p.includes('ubisoft') || p.includes('uplay')) return 'https://images.weserv.nl/?url=cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/ubisoft.svg&output=png&bg=ffffff&w=256&h=256';
  return null;
}

function safeText(v, max = 1024) {
  if (v == null) return '';
  let s = String(v);
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (s.length > max) s = s.slice(0, max);
  return s;
}

function makeEmbedFromGiveaway(g) {
  const title = safeText(g.title, 256);
  const worth = safeText(g.worth, 64);
  const endDate = safeText(g.end_date, 64);
  const publisher = safeText(g.publisher, 128);
  const image = safeText(g.image, 2048);
  const platform = pickPrimaryPlatform(g.platforms);
  const descriptionParts = [];

  const untilText = `Free until ${endDate && endDate !== 'N/A' ? endDate : '—'}`;
  if (worth && worth !== 'N/A') {
    // Match the screenshot style: strikethrough worth then free-until.
    descriptionParts.push(`~~${worth}~~`);
    descriptionParts.push(untilText);
  } else {
    descriptionParts.push(untilText);
  }

  const embed = new EmbedBuilder()
    .setTitle(title || 'Giveaway')
    .setDescription(descriptionParts.join(' '))
    .setFooter({ text: `via gamerpower.com${publisher ? ' • ' + publisher : ''}` });

  // Important: do NOT set embed URL (otherwise Discord will hyperlink the title).
  if (image && image !== 'N/A') embed.setImage(image);

  const thumb = platformThumbnailUrl(platform);
  if (thumb) embed.setThumbnail(thumb);

  return embed;
}

function makeButtons(g) {
  const rows = [];
  const url = safeText(g.open_giveaway_url, 2048) || safeText(g.gamerpower_url, 2048) || '';
  const platform = pickPrimaryPlatform(g.platforms);

  const row = new ActionRowBuilder();
  if (url) {
    row.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Open in browser ↗')
        .setURL(url)
    );

    if (platform && platform.includes('steam')) {
      // Link Buttons must be http/https. Keep label, point to store URL.
      row.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Open in Steam Client ↗')
          .setURL(url)
      );
    } else if (platform && platform.includes('epic')) {
      row.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Open in Epic Games Launcher ↗')
          .setURL(url)
      );
    }
  }

  if (row.components && row.components.length) rows.push(row);
  return rows;
}

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
  const components = makeButtons(g);

  await ch.send({ embeds: [embed], components }).catch((e) => {
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
