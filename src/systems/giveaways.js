// src/systems/giveaways.js

const path = require('path');
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../database/models/GuildConfig');
const GiveawayPost = require('../database/models/GiveawayPost');
const { fetchChannel } = require('../services/discordFetchCache');

const GAMERPOWER_BASE = 'https://www.gamerpower.com/api';

const BADGE_DIR = path.join(__dirname, '../../public/assets/platform-badges');

const runningGuilds = new Set();

function cleanTitle(title) {
  if (!title) return 'Giveaway';

  return String(title)
    .replace(/^\s*\((steam|epic\s*games?|ubisoft|steam key)\)\s*/i, '')
    .replace(/^\s*(steam|epic\s*games?|ubisoft|steam key)\s*:\s*/i, '')
    .replace(/\s*\(?(steam|epic|ubisoft)\)?\s*giveaway\s*$/i, '')
    .replace(/\s*giveaway\s*$/i, '')
    .trim();
}

function formatDate(value) {
  if (!value || value === 'N/A') return '—';

  const d = new Date(value);
  if (isNaN(d.getTime())) return value;

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

function parseUnix(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

function resolvePlatform(it, fallback) {
  const p = String(it.platforms || '').toLowerCase();

  if (p.includes('steam')) return 'steam';
  if (p.includes('epic')) return 'epic';
  if (p.includes('ubisoft') || p.includes('uplay')) return 'ubisoft';

  return fallback;
}

function badgeUrl(platform, base, id) {
  if (!base) return '';

  if (platform === 'steam') return `${base}/platform-badge/steam.png?v=${id}`;
  if (platform === 'epic') return `${base}/platform-badge/epic.png?v=${id}`;
  if (platform === 'ubisoft') return `${base}/platform-badge/ubisoft.png?v=${id}`;

  return '';
}

function buildLinks(g, platform) {
  const browser = g.giveaway_url || g.gamerpower_url || '';
  const client = g.open_giveaway_url || '';

  const SEP = '   ';

  const links = [];

  if (browser) {
    links.push(`**[Open in browser ↗](${browser})**`);
  }

  if (client) {
    if (platform === 'steam') {
      links.push(`**[Open in Steam Client ↗](${client})**`);
    } else if (platform === 'epic') {
      links.push(`**[Open in Epic Games ↗](${client})**`);
    } else if (platform === 'ubisoft') {
      links.push(`**[Open in Ubisoft Games ↗](${client})**`);
    }
  }

  return links.join(SEP);
}

function makeEmbed(g, platform, baseUrl) {
  const title = cleanTitle(g.title);

  const worth = g.worth && g.worth !== 'N/A' ? `~~${g.worth}~~` : '';
  const endUnix = parseUnix(g.end_date);
  const endDate = formatDate(g.end_date);

  const freeLine = `**Free** until ${endUnix ? `<t:${endUnix}:d>` : endDate}`;

  const links = buildLinks(g, platform);

  const description = [worth, freeLine].filter(Boolean).join(' ') +
    (links ? `\n\n${links}` : '');

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'via .rabbitstuff.xyz' });

  if (g.image) embed.setImage(g.image);

  const badge = badgeUrl(platform, baseUrl, g.id || Date.now());
  if (badge) embed.setThumbnail(badge);

  return embed;
}

async function fetchGiveaways(platform) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `${GAMERPOWER_BASE}/giveaways?platform=${platform}&type=game`;
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) throw new Error('API error');

    return await res.json();
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function postGiveaway(client, guildId, channelId, g, platform, baseUrl) {
  const ch = await fetchChannel(client, channelId).catch(() => null);
  if (!ch) return;

  const embed = makeEmbed(g, platform, baseUrl);

  await ch.send({ embeds: [embed] });
}

async function startGiveaways(client) {
  setInterval(async () => {
    const configs = await GuildConfig.find({ 'giveaways.enabled': true }).lean();

    for (const cfg of configs) {
      const guildId = String(cfg.guildId);
      const gcfg = cfg.giveaways;

      if (runningGuilds.has(guildId)) continue;
      runningGuilds.add(guildId);

      try {
        const channelId = gcfg.channelId;
        const platforms = gcfg.platforms || ['steam'];
        const maxPerCycle = gcfg.maxPerCycle || 5;

        const sentThisCycle = new Set();
        let sentCount = 0;

        for (const plat of platforms) {
          if (sentCount >= maxPerCycle) break;

          const items = await fetchGiveaways(plat);

          for (const it of items.reverse()) {
            if (!it?.id) continue;
            if (sentCount >= maxPerCycle) break;

            const uniqueKey = it.open_giveaway_url || it.giveaway_url;

            if (sentThisCycle.has(uniqueKey)) continue;

            const exists = await GiveawayPost.findOne({
              guildId,
              $or: [{ giveawayId: it.id }, { url: uniqueKey }]
            }).lean();

            if (exists) continue;

            const platform = resolvePlatform(it, plat);

            await postGiveaway(
              client,
              guildId,
              channelId,
              it,
              platform,
              gcfg.publicBaseUrl
            );

            await GiveawayPost.create({
              guildId,
              giveawayId: it.id,
              url: uniqueKey,
              platform
            });

            sentThisCycle.add(uniqueKey);
            sentCount++;
          }
        }
      } catch (err) {
        console.error('[Giveaways]', err);
      } finally {
        runningGuilds.delete(guildId);
      }
    }
  }, 15000);
}

module.exports = startGiveaways;
