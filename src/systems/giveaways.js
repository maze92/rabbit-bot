// src/systems/giveaways.js

const path = require('path');
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../database/models/GuildConfig');
const GiveawayPost = require('../database/models/GiveawayPost');
const { fetchChannel } = require('../services/discordFetchCache');

const GAMERPOWER_BASE = 'https://www.gamerpower.com/api';
const BADGE_DIR = path.join(__dirname, '../../public/assets/platform-badges');

const _statusByGuild = new Map();
const runningGuilds = new Set(); // ✅ FIX: lock por guild

function _setGuildStatus(guildId, patch) {
  if (!guildId) return;
  const prev = _statusByGuild.get(guildId) || {};
  _statusByGuild.set(guildId, { ...prev, ...patch });
}

function normalizeList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => String(s || '').trim()).filter(Boolean);
}

function safeText(v, max = 1024) {
  if (v == null) return '';
  let s = String(v);
  if (s.length > max) s = s.slice(0, max);
  return s;
}

function cleanGiveawayTitle(raw) {
  let s = safeText(raw, 256);
  s = s.replace(/^\s*\((steam|epic|ubisoft)\)\s*/i, '');
  s = s.replace(/\s*giveaway\s*$/i, '');
  return s.trim();
}

function normalizeImageUrl(url) {
  if (!url || url === 'N/A') return '';
  if (url.startsWith('http://')) return 'https://' + url.slice(7);
  return url;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return value;
  return `<t:${Math.floor(d.getTime() / 1000)}:d>`;
}

function makeLinkLine({ browserUrl, clientUrl, platform }) {
  const SEP = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';

  const links = [];
  if (browserUrl) links.push(`**[Open in browser ↗](${browserUrl})**`);

  const p = String(platform || '').toLowerCase();
  if (p.includes('steam')) {
    if (clientUrl) links.push(`**[Open in Steam Client ↗](${clientUrl})**`);
  } else if (p.includes('epic')) {
    if (clientUrl) links.push(`**[Open in Epic Games ↗](${clientUrl})**`);
  } else if (p.includes('ubisoft')) {
    if (clientUrl) links.push(`**[Open in Ubisoft Games ↗](${clientUrl})**`);
  }

  return links.join(SEP);
}

function makeEmbed(g, platform, publicBaseUrl) {
  const title = cleanGiveawayTitle(g.title);
  const image = normalizeImageUrl(g.image);

  const browserUrl = g.giveaway_url || g.gamerpower_url || '';
  const clientUrl = g.open_giveaway_url || '';

  const desc =
    `**Free** until ${formatDate(g.end_date)}\n\n` +
    makeLinkLine({ browserUrl, clientUrl, platform });

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: 'via .rabbitstuff.xyz' });

  if (image) embed.setImage(image);

  // ✅ badge real
  if (publicBaseUrl) {
    const p = platform.toLowerCase();
    if (p.includes('steam'))
      embed.setThumbnail(`${publicBaseUrl}/platform-badge/steam.png`);
    if (p.includes('epic'))
      embed.setThumbnail(`${publicBaseUrl}/platform-badge/epic.png`);
    if (p.includes('ubisoft'))
      embed.setThumbnail(`${publicBaseUrl}/platform-badge/ubisoft.png`);
  }

  return embed;
}

async function fetchGiveaways(platform) {
  const url = `${GAMERPOWER_BASE}/giveaways?platform=${platform}&type=game`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('API error');
  return await res.json();
}

async function postGiveaway(client, guildId, channelId, g, platform, publicBaseUrl) {
  const ch = await fetchChannel(client, channelId);
  if (!ch) return;

  const embed = makeEmbed(g, platform, publicBaseUrl);
  await ch.send({ embeds: [embed] });
}

async function startGiveaways(client) {
  let stopped = false;
  const lastPoll = new Map();

  async function tick() {
    if (stopped) return;

    const configs = await GuildConfig.find({ 'giveaways.enabled': true }).lean();

    for (const cfg of configs) {
      const guildId = String(cfg.guildId);
      const gcfg = cfg.giveaways || {};
      const channelId = gcfg.channelId;

      if (!guildId || !channelId) continue;

      // ✅ FIX: lock
      if (runningGuilds.has(guildId)) continue;
      runningGuilds.add(guildId);

      try {
        const now = Date.now();
        const last = lastPoll.get(guildId) || 0;
        const interval = (gcfg.pollIntervalSeconds || 60) * 1000;

        if (now - last < interval) continue;
        lastPoll.set(guildId, now);

        const sentThisCycle = new Set(); // ✅ FIX

        const platforms = normalizeList(gcfg.platforms).length
          ? gcfg.platforms
          : ['steam'];

        for (const plat of platforms) {
          const items = await fetchGiveaways(plat);

          for (const it of items.reverse()) {
            const uniqueKey =
              it.open_giveaway_url ||
              it.giveaway_url ||
              it.gamerpower_url ||
              it.id;

            // ✅ FIX: evitar duplicados no ciclo
            if (sentThisCycle.has(uniqueKey)) continue;
            sentThisCycle.add(uniqueKey);

            // ✅ FIX: dedupe DB forte
            const exists = await GiveawayPost.findOne({
              guildId,
              $or: [{ giveawayId: it.id }, { url: uniqueKey }]
            });

            if (exists) continue;

            await postGiveaway(
              client,
              guildId,
              channelId,
              it,
              plat,
              gcfg.publicBaseUrl
            );

            await GiveawayPost.create({
              guildId,
              giveawayId: it.id,
              url: uniqueKey
            });
          }
        }
      } catch (err) {
        console.error('[Giveaways error]', err.message);
      } finally {
        runningGuilds.delete(guildId); // ✅ unlock
      }
    }
  }

  const timer = setInterval(tick, 15000);
  tick();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    }
  };
}

module.exports = startGiveaways;
