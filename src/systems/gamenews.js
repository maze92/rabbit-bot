// src/systems/gamenews.js

const Parser = require('rss-parser');
const crypto = require('crypto');
const { URL } = require('url');
const { EmbedBuilder } = require('discord.js');

const { logError, logWarn } = require('../utils/log.js');
const GameNews = require('../database/models/GameNews');
let GameNewsFeed = null;
try {
  GameNewsFeed = require('../database/models/GameNewsFeed');
} catch (e) {
  console.warn('[GameNews] GameNewsFeed model not loaded, falling back to static config.sources');
}

const logger = require('./logger');
const AbortController = global.AbortController || require('abort-controller');

function clampNumber(n, min, max) {
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function hasSendPerm(channel, client) {
  try {
    return channel?.permissionsFor?.(client.user)?.has?.('SendMessages');
  } catch {
    return false;
  }
}

async function fetchWithTimeout(parser, url, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await parser.parseURL(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

const dashboard = require('../dashboard');

const parser = new Parser({ timeout: 15000 });

const FEED_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; OzarkBot/1.0; +https://github.com/maze92/ozark-bot)',
  'Accept': 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7'
};

let started = false;
let lastHeartbeatAt = 0;

let isRunning = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randInt(min, max) {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function withJitter(baseMs, jitterMs) {
  const j = Math.max(0, Number(jitterMs || 0));
  if (!j) return baseMs;
  return Math.max(0, baseMs + randInt(-j, j));
}

function normalizeLink(rawLink, base) {
  if (!rawLink || typeof rawLink !== 'string') return null;
  try {
    const u = base ? new URL(rawLink, base) : new URL(rawLink);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return rawLink;
  }
}


function generateHash(item) {
  const normalizedLink = item.link ? normalizeLink(item.link) : null;

  const base =
    item.guid ||
    item.id ||
    normalizedLink ||
    `${item.title || ''}-${item.isoDate || item.pubDate || ''}`;

  return crypto.createHash('sha256').update(String(base)).digest('hex');
}

function getItemDate(item) {
  const d = item.isoDate || item.pubDate;
  const parsed = d ? new Date(d) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
}

function isItemTooOld(item, maxAgeDays) {
  const days = Number(maxAgeDays);
  if (!Number.isFinite(days) || days <= 0) return false;

  const itemDate = getItemDate(item);
  if (!itemDate || Number.isNaN(itemDate.getTime())) return false;

  const ageMs = Date.now() - itemDate.getTime();
  const maxMs = days * 24 * 60 * 60 * 1000;

  return ageMs > maxMs;
}


function makeFeedSourceKey(feed) {
  // Stable key to avoid collisions between feeds that share the same "name".
  // Keep it ASCII and deterministic.
  const g = (feed && feed.guildId ? String(feed.guildId) : '').trim();
  const u = (feed && (feed.feed || feed.feedUrl) ? String(feed.feed || feed.feedUrl) : '').trim();
  const c = (feed && feed.channelId ? String(feed.channelId) : '').trim();
  // JSON is unambiguous and avoids delimiter collisions.
  return JSON.stringify({ guildId: g || null, feedUrl: u || null, channelId: c || null });
}

async function getOrCreateFeedRecord(feed) {
  const sourceKey = makeFeedSourceKey(feed);
  const legacyName = feed && feed.name ? String(feed.name) : null;

  let record = await GameNews.findOne({ source: sourceKey });

  // Backward compatibility: if an older record exists keyed by name, keep it,
  // but do NOT reuse it for other feeds; create a proper per-feed record instead.
  if (!record && legacyName) {
    const legacy = await GameNews.findOne({ source: legacyName });
    if (legacy) {
      // Create a fresh per-feed record (state starts empty to avoid cross-feed interference).
      // This may cause one-time re-sends for this feed; acceptable for correctness.
      record = await GameNews.create({
        source: sourceKey,
        guildId: feed.guildId || null,
        feedUrl: feed.feed || feed.feedUrl || null,
        channelId: feed.channelId || null,
        name: legacyName,
        lastHashes: [],
        failCount: 0,
        pausedUntil: null,
        lastSentAt: null
      });
    }
  }

  if (!record) {
    record = await GameNews.create({
      source: sourceKey,
      guildId: feed.guildId || null,
      feedUrl: feed.feed || feed.feedUrl || null,
      channelId: feed.channelId || null,
      name: legacyName || null,
      lastHashes: [],
      failCount: 0,
      pausedUntil: null,
      lastSentAt: null
    });
  }

  if (!Array.isArray(record.lastHashes)) record.lastHashes = [];
  return record;
}

function isFeedPaused(record) {
  if (!record?.pausedUntil) return false;
  return record.pausedUntil.getTime() > Date.now();
}

async function registerFeedFailure(record, config, client, feed) {
  const maxFails = Number(config?.gameNews?.backoff?.maxFails ?? 3);
  const pauseMs = Number(config?.gameNews?.backoff?.pauseMs ?? 30 * 60 * 1000);

  record.failCount = (record.failCount || 0) + 1;

  // Optional per-feed log channel
  await sendFeedLog(client, feed, `⚠️ GameNews: falha no feed **${feed?.name || 'Feed'}** (tentativas: ${record.failCount})`).catch(() => null);

  if (record.failCount >= maxFails) {
    record.pausedUntil = new Date(Date.now() + pauseMs);
    record.failCount = 0;
    await sendFeedLog(client, feed, `⏸️ GameNews: feed **${feed?.name || 'Feed'}** em pausa até ${(record.pausedUntil ? record.pausedUntil.toISOString() : '')} (backoff).`).catch(() => null);
  }

  await record.save();
}

async function registerFeedSuccess(record) {
  if (record.pausedUntil && record.pausedUntil.getTime() <= Date.now()) {
    record.pausedUntil = null;
  }

  if (record.failCount && record.failCount !== 0) {
    record.failCount = 0;
  }

  await record.save();
}

function getNewItemsByHashes(items, lastHashes) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const set = new Set(Array.isArray(lastHashes) ? lastHashes : []);

  if (set.size === 0) return [items[0]];

  const newOnes = [];
  for (const it of items) {
    const h = generateHash(it);
    if (!set.has(h)) newOnes.push(it);
  }
  return newOnes;
}

function pushHashAndTrim(record, hash, keepN) {
  if (!Array.isArray(record.lastHashes)) record.lastHashes = [];

  record.lastHashes = record.lastHashes.filter((h) => h !== hash);

  record.lastHashes.push(hash);

  if (record.lastHashes.length > keepN) {
    record.lastHashes = record.lastHashes.slice(record.lastHashes.length - keepN);
  }
}

async function parseWithRetry(url, retryCfg) {
  const attempts = Number(retryCfg?.attempts ?? 2);
  const baseDelayMs = Number(retryCfg?.baseDelayMs ?? 1200);
  const jitterMs = Number(retryCfg?.jitterMs ?? 800);

  const safeAttempts = Number.isFinite(attempts) && attempts >= 1 && attempts <= 5 ? attempts : 2;
  const safeBase = Number.isFinite(baseDelayMs) && baseDelayMs >= 100 ? baseDelayMs : 1200;
  const safeJitter = Number.isFinite(jitterMs) && jitterMs >= 0 ? jitterMs : 800;

  let lastErr = null;

  for (let i = 1; i <= safeAttempts; i++) {
    try {
      const res = await fetch(url, { headers: FEED_HEADERS, redirect: 'follow' });
      if (!res.ok) {
        const err = new Error(`Status code ${res.status}`);
        err.statusCode = res.status;
        throw err;
      }
      const xml = await res.text();
      return await parser.parseString(xml);
    } catch (err) {
      lastErr = err;

      if (i < safeAttempts) {
        const waitMs = withJitter(safeBase * i, safeJitter);
        await sleep(waitMs);
      }
    }
  }

  throw lastErr;
}

async function sendOneNewsAndUpdate({ client, feed, channel, record, item, keepN, config }) {
  const hash = generateHash(item);

  const descriptionRaw = item.contentSnippet || item.content || "";
  const trimmed = typeof descriptionRaw === "string" ? descriptionRaw.trim() : "";
  const MAX_DESC = 4000;
  const description = trimmed.length > MAX_DESC ? trimmed.slice(0, MAX_DESC) + "..." : trimmed;

  let finalDescription = description;
  if (!finalDescription) {
    const snippet =
      (item.contentSnippet || '').toString().trim() ||
      (item.summary || '').toString().trim() ||
      (item.title || '').toString().trim() ||
      (item.link || '').toString().trim() ||
      'New article available.';
    finalDescription = snippet.length > MAX_DESC ? snippet.slice(0, MAX_DESC) + "..." : snippet;
  }

  const embed = new EmbedBuilder()
    .setTitle(item.title || 'New article')
    .setURL(item.link || null)
    .setDescription(finalDescription)
    .setColor(0xe60012)
    .setFooter({ text: feed.name })
    .setTimestamp(getItemDate(item));

  if (item.enclosure?.url) embed.setThumbnail(item.enclosure.url);

  // Cache-first channel resolution + permission check
  let ch = channel;
  if (!ch) {
    ch = client.channels.cache.get(feed.channelId) || await client.channels.fetch(feed.channelId).catch(() => null);
  }
  if (!ch || !ch.isTextBased?.() || !hasSendPerm(ch, client)) {
    await sendFeedLog(client, feed, '⚠️ GameNews: sem permissão para enviar mensagens no canal.').catch(() => null);
    return;
  }

  await ch.send({ embeds: [embed] });

  pushHashAndTrim(record, hash, keepN);
  record.lastSentAt = new Date();
  record.failCount = 0;
  if (record.pausedUntil && record.pausedUntil.getTime() <= Date.now()) {
    record.pausedUntil = null;
  }
  await record.save();

  if (config?.gameNews?.logEnabled !== false) {
    await logger(
      client,
      'Game News',
      null,
      client.user,
      `Sent: **${feed.name}** -> **${item.title || 'Untitled'}**`,
      ch.guild
    );
  }
}async function getFeedsFromDb() {
  if (!GameNewsFeed) return [];
  try {
    const docs = await GameNewsFeed.find({}).lean();
    return docs
      .filter((d) => d && d.feedUrl && d.channelId)
      .map((d) => ({
        guildId: d.guildId || null,
        name: d.name || 'Feed',
        feed: d.feedUrl,
        channelId: d.channelId,
        logChannelId: d.logChannelId || null,
        enabled: d.enabled !== false,
        // Per-feed interval override (ms). Falls back to config.gameNews.interval when null/invalid.
        intervalMs: typeof d.intervalMs === 'number' ? d.intervalMs : null
      }));
  } catch (err) {
    console.error('[GameNews] Failed to load feeds from DB:', err?.message || err);
    return [];
  }
}

async function getEffectiveFeeds(config) {
  // DB is the single source of truth for GameNews feeds.
  const dbFeeds = await getFeedsFromDb();
  const activeDb = dbFeeds.filter((f) => f.enabled && f.feed && f.channelId);
  return activeDb;
}

async function buildStatusPayload(config) {
  const feeds = await getEffectiveFeeds(config);
          if (!Array.isArray(feeds) || feeds.length === 0) {
            const now = Date.now();
            if (!lastHeartbeatAt || now - lastHeartbeatAt > 10 * 60 * 1000) {
              console.log('[GameNews] No feeds configured/enabled yet. Waiting...');
              lastHeartbeatAt = now;
            }
          }
  if (!feeds.length) return [];

  const names = feeds.map(f => f?.name).filter(Boolean);
  const docs = await GameNews.find({ source: { $in: names } }).lean();

  const map = new Map();
  for (const d of docs) map.set(d.source, d);

  const now = Date.now();
  const baseIntervalMs = clampNumber(Number(config?.gameNews?.interval ?? 30 * 60 * 1000), 60_000, 7 * 24 * 60 * 60 * 1000) ?? (30 * 60 * 1000);

  return feeds.map((f) => {
    const d = map.get(f.name);

    const pausedUntil = d?.pausedUntil ? new Date(d.pausedUntil) : null;
    const paused = pausedUntil ? pausedUntil.getTime() > now : false;

    const intervalOverride = Number(f.intervalMs ?? 0);
    const safeBase = Number.isFinite(baseIntervalMs) && baseIntervalMs > 0 ? baseIntervalMs : 30 * 60 * 1000;
    const effectiveIntervalMs = Number.isFinite(intervalOverride) && intervalOverride > 0 ? intervalOverride : safeBase;

    return {
      source: f.name,
      feedName: f.name,
      feedUrl: f.feed,
      channelId: f.channelId,

      failCount: d?.failCount ?? 0,
      pausedUntil: d?.pausedUntil ?? null,
      lastSentAt: d?.lastSentAt ?? null,
      lastHashesCount: Array.isArray(d?.lastHashes) ? d.lastHashes.length : 0,

      paused,
      updatedAt: d?.updatedAt ?? null,

      intervalMs: effectiveIntervalMs,
      intervalOverrideMs: Number.isFinite(intervalOverride) && intervalOverride > 0 ? intervalOverride : null
    };
  });
}

async function emitStatusToDashboard(config) {
  try {
    if (!dashboard?.sendToDashboard) return;
    const payload = await buildStatusPayload(config);
    dashboard.sendToDashboard('gamenews_status', payload);
  } catch (err) {
    console.error('[GameNews] Failed emitting status to dashboard:', err?.message || err);
  }
}

async function gameNewsSystem(client, config) {
  try {
    if (!config?.gameNews?.enabled) {
      console.log('[GameNews] Game News system is disabled in config.');
      return;
    }

    if (started) {
      console.log('[GameNews] Already started. Skipping duplicate start.');
      return;
    }
    started = true;

    console.log('[GameNews] Game News system starting...');

    const baseIntervalMs = Number(config.gameNews.interval ?? 30 * 60 * 1000);
    const safeBaseInterval =
      Number.isFinite(baseIntervalMs) && baseIntervalMs >= 10_000 ? baseIntervalMs : 30 * 60 * 1000;

    const globalJitterMs = Number(config.gameNews.jitterMs ?? 20_000);
    const safeGlobalJitter = Number.isFinite(globalJitterMs) && globalJitterMs >= 0 ? globalJitterMs : 20_000;

    const keepHashes = Number(config.gameNews.keepHashes ?? 10);
    const safeKeep =
      Number.isFinite(keepHashes) && keepHashes >= 5 && keepHashes <= 50 ? keepHashes : 10;

    const maxAgeDays = Number(config.gameNews.maxAgeDays ?? 7);
    const safeMaxAgeDays =
      Number.isFinite(maxAgeDays) && maxAgeDays >= 1 && maxAgeDays <= 365 ? maxAgeDays : 7;

    const retryCfg = config.gameNews.retry || { attempts: 2, baseDelayMs: 1200, jitterMs: 800 };

    console.log('[GameNews] News system started');

    emitStatusToDashboard(config).catch(() => null);

    const runLoop = async () => {
      if (isRunning) return;
      isRunning = true;

      try {
        const feeds = await getEffectiveFeeds(config);
        if (!feeds.length) return;

        for (const feed of feeds) {
          const feedName = feed?.name || 'UnknownFeed';
          const perFeedJitterMs = clampNumber(Number(config.gameNews.perFeedJitterMs ?? 1500), 0, 10000) ?? 1500;
          const safePerFeedJitter = Number.isFinite(perFeedJitterMs) && perFeedJitterMs >= 0 ? perFeedJitterMs : 1500;

          await sleep(withJitter(300, safePerFeedJitter));

          let record = null;
          try {
            record = await getOrCreateFeedRecord(feed);
          } catch (err) {
            console.error(`[GameNews] DB error for feed ${feedName}:`, err?.message || err);
            continue;
          }

          if (isFeedPaused(record)) {
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[GameNews] Feed paused: ${feedName} until ${(record.pausedUntil ? record.pausedUntil.toISOString() : '')}`);
            }
            continue;
          }

          // Respect optional per-feed interval override (ms).
          // If feed.intervalMs is set and lastSentAt is recent, skip this cycle.
          try {
            const overrideMs = Number(feed.intervalMs ?? 0);
            const effectiveInterval = Number.isFinite(overrideMs) && overrideMs > 0 ? overrideMs : safeBaseInterval;
            const last = record.lastSentAt ? new Date(record.lastSentAt).getTime() : 0;
            if (last && Date.now() - last < effectiveInterval) {
              if (process.env.NODE_ENV !== 'production') {
                console.log(`[GameNews] Skipping feed ${feedName} (interval not reached yet).`);
              }
              continue;
            }
          } catch {
            // ignore interval errors, fall back to default behaviour
          }

          try {
            const parsed = await parseWithRetry(feed.feed, retryCfg);
            let items = parsed?.items || [];
            if (!Array.isArray(items) || items.length === 0) {
              await registerFeedSuccess(record).catch(() => null);
              continue;
            }

            items = items
              .map((it) => ({ it, date: getItemDate(it) }))
              .sort((a, b) => a.date - b.date)
              .map((x) => x.it);

            const lastSentAt = record.lastSentAt ? new Date(record.lastSentAt) : null;
            const newItemsFromAll = getNewItemsByHashes(items, record.lastHashes || []);

            // Prefer new items by hash; if none, allow a one-time send of the most recent item
            let candidateItems = newItemsFromAll;

            if (!candidateItems || candidateItems.length === 0) {
              if (!record.lastHashes || record.lastHashes.length === 0) {
                // First run for this feed: send the most recent item so the system "warms up"
                if (items.length > 0) {
                  candidateItems = [items[items.length - 1]];
                }
              }
            }

            if (!candidateItems || candidateItems.length === 0) {
              await registerFeedSuccess(record).catch(() => null);
              continue;
            }

            // Apply maxAgeDays as a soft filter: if everything is too old, still send the newest one once.
            let recentNewItems = candidateItems.filter((it) => !isItemTooOld(it, safeMaxAgeDays));

            if (!recentNewItems || recentNewItems.length === 0) {
              recentNewItems = candidateItems.slice(-1);
            }

            const newItems = recentNewItems;
            const channel = await client.channels.fetch(feed.channelId).catch(() => null);
            if (!channel) {
              console.warn(`[GameNews] Channel not found: ${feed.channelId} (${feedName})`);
              await registerFeedSuccess(record).catch(() => null);
              continue;
            }

            const maxPerCycle = Number(config.gameNews?.maxPerCycle ?? 3);
            const safeMaxPerCycle = Number.isFinite(maxPerCycle) && maxPerCycle >= 1 && maxPerCycle <= 10
              ? maxPerCycle
              : 3;

            const itemsToSend = newItems.slice(-safeMaxPerCycle);

            for (const itemToSend of itemsToSend) {
              if (!itemToSend?.title || !itemToSend?.link) {
                await registerFeedSuccess(record).catch(() => null);
                continue;
              }

              if (isItemTooOld(itemToSend, safeMaxAgeDays)) {
                if (process.env.NODE_ENV !== 'production') {
                  console.log(`[GameNews] Skipped old item (${feedName}): ${itemToSend.title}`);
                }
                await registerFeedSuccess(record).catch(() => null);
                continue;
              }

              await sendOneNewsAndUpdate({
                client,
                feed,
                channel,
                record,
                item: itemToSend,
                keepN: safeKeep,
                config
              });
            }

          } catch (err) {
            console.error(`[GameNews] Error processing feed ${feedName}:`, err?.message || err);

            try {
              await registerFeedFailure(record, config, client, feed);

              if (record.pausedUntil && record.pausedUntil.getTime() > Date.now()) {
                console.warn(
                  `[GameNews] Feed "${feedName}" paused until ${(record.pausedUntil ? record.pausedUntil.toISOString() : '')} (backoff).`
                );
              }
            } catch (e) {
              console.error(`[GameNews] Failed updating failure/backoff for ${feedName}:`, e?.message || e);
            }
          }
        }
      } finally {
        isRunning = false;
        try {
          console.log('[GameNews] Cycle completed.');
        } catch (e) {
          // ignore logging errors
        }
        emitStatusToDashboard(config).catch(() => null);
      }
    };

    const scheduleNext = async () => {
      await runLoop().catch(() => null);

      const nextInMs = withJitter(safeBaseInterval, safeGlobalJitter);
      setTimeout(scheduleNext, nextInMs).unref?.();
    };

    const firstDelay = withJitter(1500, Math.min(5000, safeGlobalJitter));
    setTimeout(scheduleNext, firstDelay).unref?.();

  } catch (err) {
    console.error('[GameNews] Critical error starting system:', err);
  }
};


async function testSendGameNews({ client, config, guildId, feedId }) {
  if (!client) {
    throw new Error('Discord client not available');
  }

  const cfg = config && config.gameNews ? config : { gameNews: {} };
  if (!cfg.gameNews || cfg.gameNews.enabled === false) {
    throw new Error('GameNews system is disabled in config');
  }

  if (!GameNewsFeed) {
    throw new Error('GameNewsFeed model not available');
  }

  const safeGuildId = (guildId || '').toString().trim();
  const safeFeedId = (feedId || '').toString().trim();

  if (!safeGuildId) {
    throw new Error('guildId is required');
  }
  if (!safeFeedId) {
    throw new Error('feedId is required');
  }

  const doc = await GameNewsFeed.findOne({ _id: safeFeedId, guildId: safeGuildId }).lean();
  if (!doc) {
    throw new Error('Feed not found for this guild');
  }

  const feed = {
    guildId: doc.guildId || null,
    name: doc.name || 'Feed',
    feed: doc.feedUrl,
    channelId: doc.channelId,
    logChannelId: doc.logChannelId || null,
    enabled: doc.enabled !== false,
    intervalMs: typeof doc.intervalMs === 'number' ? doc.intervalMs : null
  };

  if (!feed.enabled) {
    throw new Error('Feed is disabled');
  }
  if (!feed.feed || !feed.channelId) {
    throw new Error('Feed URL or channelId missing');
  }

  // Resolve runtime config pieces similar to main loop
  const keepHashes = Number(cfg.gameNews.keepHashes ?? 10);
  const safeKeep =
    Number.isFinite(keepHashes) && keepHashes >= 5 && keepHashes <= 50 ? keepHashes : 10;

  const maxAgeDays = Number(cfg.gameNews.maxAgeDays ?? 7);
  const safeMaxAgeDays =
    Number.isFinite(maxAgeDays) && maxAgeDays >= 1 && maxAgeDays <= 365 ? maxAgeDays : 7;

  const retryCfg = cfg.gameNews.retry || { attempts: 2, baseDelayMs: 1200, jitterMs: 800 };

  // Fetch RSS feed once
  const parsed = await parseWithRetry(feed.feed, retryCfg);
  const items = Array.isArray(parsed?.items) ? parsed.items.slice() : [];

  if (!items.length) {
    throw new Error('RSS feed returned no items');
  }

  // Load / create GameNews record for this source
  const record = await getOrCreateFeedRecord(feed);

  const newItems = getNewItemsByHashes(items, record.lastHashes);
  const candidates = newItems.length ? newItems : [items[0]];

  let chosen = null;
  for (const it of candidates) {
    if (!isItemTooOld(it, safeMaxAgeDays)) {
      chosen = it;
      break;
    }
  }

  if (!chosen) {
    throw new Error('No recent items found for this feed (all older than maxAgeDays)');
  }

  const channel =
    client.channels.cache.get(feed.channelId) ||
    (await client.channels.fetch(feed.channelId).catch(() => null));

  if (!channel || !channel.isTextBased?.()) {
    throw new Error('Configured channel not found or not text-based');
  }
  if (!hasSendPerm(channel, client)) {
    throw new Error('Missing permission to send messages in the configured channel');
  }

  await sendOneNewsAndUpdate({
    client,
    feed,
    channel,
    record,
    item: chosen,
    keepN: safeKeep,
    config: cfg
  });

  return {
    ok: true,
    feedName: feed.name,
    title: chosen.title || null,
    link: chosen.link || null
  };
}

async function sendFeedLog(client, feed, message) {
  try {
    if (!feed?.logChannelId) return;
    const channel =
      client.channels.cache.get(feed.logChannelId) ||
      (await client.channels.fetch(feed.logChannelId).catch(() => null));

    if (!channel || !channel.isTextBased?.() || !hasSendPerm(channel, client)) return;

    await channel.send(String(message).slice(0, 1800));
  } catch (e) {
    logWarn('GameNews sendFeedLog', e);
  }
}



async function getDashboardStatus(config) {
  try {
    const payload = await buildStatusPayload(config);
    return Array.isArray(payload) ? payload : [];
  } catch (err) {
    logError('GameNews getDashboardStatus', err);
    return [];
  }
}

module.exports = gameNewsSystem;
module.exports.testSendGameNews = testSendGameNews;
module.exports.getDashboardStatus = getDashboardStatus;
