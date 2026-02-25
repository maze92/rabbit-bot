// src/systems/freetokeep.js
//
// Polls GamerPower API for live "game" giveaways on selected platforms
// (Epic Games Store, Steam, Ubisoft) and posts them to a configured channel.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { fetchChannel } = require('../services/discordFetchCache');

const FreeToKeepConfig = require('../database/models/FreeToKeepConfig');
const FreeToKeepPost = require('../database/models/FreeToKeepPost');

let started = false;
let isRunning = false;

const PLATFORM_QUERY = {
  epic: 'epic-games-store',
  steam: 'steam',
  ubisoft: 'ubisoft'
};

const PLATFORM_EMOJI = {
  epic: '🟦',
  steam: '🟩',
  ubisoft: '🟪'
};

function detectOfferKind(item) {
  // GamerPower doesn't expose a dedicated "free weekend" flag.
  // We infer it from common wording in the title/description.
  const hay = `${item?.title || ''} ${item?.description || ''} ${item?.instructions || ''}`.toLowerCase();
  if (hay.includes('free weekend') || hay.includes('free-weekend') || hay.includes('weekend only')) return 'freeweekend';
  if (hay.includes('play for free') || hay.includes('play free') || hay.includes('free to play this weekend')) return 'freeweekend';
  return 'freetokeep';
}

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function hasSendPerm(channel, client) {
  try {
    return channel?.permissionsFor?.(client.user)?.has?.('SendMessages');
  } catch {
    return false;
  }
}

function buildEmbed(item, platformKey, platformLabel, kind) {
  const title = item?.title ? String(item.title) : 'Free game';
  const worth = item?.worth ? String(item.worth) : '';
  const end = item?.end_date ? String(item.end_date) : '';

  const kindTag = kind === 'freeweekend' ? '**FREE WEEKEND**' : '**FREE TO KEEP**';

  const descParts = [];
  descParts.push(kindTag);
  if (worth) descParts.push(`**${worth}**`);
  if (end && end.toLowerCase() !== 'n/a') {
    descParts.push(kind === 'freeweekend' ? `Until **${end}**` : `Free until **${end}**`);
  }
  const description = descParts.length ? descParts.join(' — ') : '';

  const emoji = PLATFORM_EMOJI[platformKey] || '🎮';

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${title}`)
    .setURL(item?.open_giveaway_url || item?.gamerpower_url || item?.url || '')
    .setDescription(description)
    .setFooter({ text: `via GamerPower • ${platformLabel}` });

  if (item?.thumbnail) {
    try { embed.setImage(String(item.thumbnail)); } catch {}
  }

  return embed;
}

function buildButtons(item) {
  const url = item?.open_giveaway_url || item?.gamerpower_url || item?.url;
  if (!url) return null;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Open in browser ↗')
      .setURL(String(url))
  );
  return row;
}

async function postItem({ client, guildId, channelId, platformKey, item, kind }) {
  const channel = client.channels.cache.get(channelId) || (await fetchChannel(client, channelId));
  if (!channel || !channel.isTextBased?.()) throw new Error('Configured channel not found or not text-based');
  if (!hasSendPerm(channel, client)) throw new Error('Missing permission to send messages');

  const platformLabel = platformKey === 'epic' ? 'Epic Games Store' : platformKey === 'steam' ? 'Steam' : 'Ubisoft';
  const embed = buildEmbed(item, platformKey, platformLabel, kind);
  const row = buildButtons(item);

  const msg = await channel.send({ embeds: [embed], components: row ? [row] : [] });

  await FreeToKeepPost.create({
    guildId,
    platform: platformKey,
    giveawayId: Number(item.id),
    kind,
    title: String(item.title || ''),
    worth: String(item.worth || ''),
    endDate: String(item.end_date || ''),
    url: String(item.open_giveaway_url || item.gamerpower_url || ''),
    image: String(item.thumbnail || ''),
    channelId,
    messageId: String(msg?.id || ''),
    postedAt: new Date()
  });
}

async function runForGuild(client, cfg) {
  const guildId = String(cfg.guildId);
  if (!cfg.enabled) return;
  if (!cfg.channelId) return;

  const maxPerCycle = clampInt(cfg.maxPerCycle, 1, 10, 3);

  const platforms = cfg.platforms || {};
  const platformKeys = ['epic', 'steam', 'ubisoft'].filter((k) => platforms[k]);
  if (!platformKeys.length) return;

  const offerTypes = cfg.offerTypes || { freetokeep: true, freeweekend: false };

  // Collect candidates newest-first
  const candidates = [];
  for (const key of platformKeys) {
    const q = PLATFORM_QUERY[key];
    const url = `https://www.gamerpower.com/api/giveaways?platform=${encodeURIComponent(q)}&type=game&sort-by=date`;
    const arr = await fetchJson(url, 15000);
    const list = Array.isArray(arr) ? arr : [];
    for (const it of list) {
      if (!it || !it.id) continue;
      const kind = detectOfferKind(it);
      if (kind === 'freeweekend' && !offerTypes.freeweekend) continue;
      if (kind === 'freetokeep' && !offerTypes.freetokeep) continue;
      candidates.push({ platformKey: key, item: it, kind });
    }
    // Stay well under 4 req/sec.
    await sleep(350);
  }

  // Newest first
  candidates.sort((a, b) => {
    const da = Date.parse(a?.item?.published_date || '') || 0;
    const db = Date.parse(b?.item?.published_date || '') || 0;
    return db - da;
  });

  let posted = 0;
  for (const c of candidates) {
    if (posted >= maxPerCycle) break;
    const giveawayId = Number(c.item.id);
    if (!Number.isFinite(giveawayId)) continue;

    const exists = await FreeToKeepPost.findOne({ guildId, platform: c.platformKey, giveawayId }).select('_id').lean();
    if (exists) continue;

    await postItem({ client, guildId, channelId: cfg.channelId, platformKey: c.platformKey, item: c.item, kind: c.kind });
    posted++;
    await sleep(550);
  }
}

async function loop(client) {
  if (isRunning) return;
  isRunning = true;
  try {
    const configs = await FreeToKeepConfig.find({ enabled: true }).lean();
    for (const cfg of configs) {
      const pollMs = clampInt(cfg.pollIntervalMs, 30_000, 30 * 60_000, 120_000);
      // If we ran recently, skip.
      const last = cfg.lastRunAt ? new Date(cfg.lastRunAt).getTime() : 0;
      if (last && Date.now() - last < pollMs) continue;

      try {
        await FreeToKeepConfig.updateOne({ guildId: cfg.guildId }, { $set: { lastRunAt: new Date(), lastError: '' } });
        await runForGuild(client, cfg);
      } catch (e) {
        await FreeToKeepConfig.updateOne(
          { guildId: cfg.guildId },
          { $set: { lastRunAt: new Date(), lastError: String(e?.message || e || 'error').slice(0, 300) } }
        ).catch(() => null);
      }

      // small pacing between guilds
      await sleep(400);
    }
  } finally {
    isRunning = false;
  }
}

async function startFreeToKeep(client, config) {
  if (started) return;
  started = true;

  if (config?.freeToKeep?.enabled === false) {
    console.log('[FreeToKeep] System disabled in config');
    return;
  }

  console.log('[FreeToKeep] System starting...');

  // Tick often; per-guild pollIntervalMs gates actual work.
  const tickMs = clampInt(config?.freeToKeep?.tickMs, 20_000, 120_000, 30_000);

  const tick = async () => {
    try {
      await loop(client);
    } catch (e) {
      console.warn('[FreeToKeep] tick error:', e?.message || e);
    }
  };

  // initial
  tick().catch(() => null);
  setInterval(() => tick().catch(() => null), tickMs);
}

module.exports = startFreeToKeep;
