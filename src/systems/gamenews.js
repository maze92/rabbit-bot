// src/systems/gamenews.js

const Parser = require('rss-parser');
const crypto = require('crypto');
const { URL } = require('url');
const { EmbedBuilder } = require('discord.js');

const GameNews = require('../database/models/GameNews');
let GameNewsFeed = null;
try {
  GameNewsFeed = require('../database/models/GameNewsFeed');
} catch (e) {
  console.warn('[GameNews] GameNewsFeed model not loaded, falling back to static config.sources');
}

const logger = require('./logger');
const dashboard = require('../dashboard');

const parser = new Parser({ timeout: 15000 });

let started = false;
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

function normalizeLink(rawLink) {
  if (!rawLink || typeof rawLink !== 'string') return null;
  try {
    const u = new URL(rawLink);
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

async function getOrCreateFeedRecord(feedName) {
  let record = await GameNews.findOne({ source: feedName });

  if (!record) {
    record = await GameNews.create({
      source: feedName,
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

async function registerFeedFailure(record, config) {
  const maxFails = Number(config?.gameNews?.backoff?.maxFails ?? 3);
  const pauseMs = Number(config?.gameNews?.backoff?.pauseMs ?? 30 * 60 * 1000);

  record.failCount = (record.failCount || 0) + 1;

  if (record.failCount >= maxFails) {
    record.pausedUntil = new Date(Date.now() + pauseMs);
    record.failCount = 0;
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
      return await parser.parseURL(url);
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

// Fallback para itens sem descrição (não saltar notícia só por ser curta)
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

  await channel.send({ embeds: [embed] });

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
      channel.guild
    );
  }

  console.log(`[GameNews] Sent: ${feed.name} -> ${item.title}`);
}

async function getFeedsFromDb() {
  if (!GameNewsFeed) return [];
  try {
    const docs = await GameNewsFeed.find({}).lean();
    return docs
      .filter((d) => d && d.feedUrl && d.channelId)
      .map((d) => ({
        name: d.name || 'Feed',
        feed: d.feedUrl,
        channelId: d.channelId,
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
  const dbFeeds = await getFeedsFromDb();
  const activeDb = dbFeeds.filter((f) => f.enabled && f.feed && f.channelId);
  if (activeDb.length) return activeDb;

  const fallback = Array.isArray(config?.gameNews?.sources) ? config.gameNews.sources : [];
  return fallback.filter((f) => f && f.feed && f.channelId);
}

async function buildStatusPayload(config) {
  const feeds = await getEffectiveFeeds(config);
  if (!feeds.length) return [];

  const names = feeds.map(f => f?.name).filter(Boolean);
  const docs = await GameNews.find({ source: { $in: names } }).lean();

  const map = new Map();
  for (const d of docs) map.set(d.source, d);

  const now = Date.now();
  const baseIntervalMs = Number(config?.gameNews?.interval ?? 30 * 60 * 1000);

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

module.exports = async function gameNewsSystem(client, config) {
  try {
    if (!config?.gameNews?.enabled) return;

    if (started) {
      console.log('[GameNews] Already started. Skipping duplicate start.');
      return;
    }
    started = true;

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
          const perFeedJitterMs = Number(config.gameNews.perFeedJitterMs ?? 1500);
          const safePerFeedJitter = Number.isFinite(perFeedJitterMs) && perFeedJitterMs >= 0 ? perFeedJitterMs : 1500;

          await sleep(withJitter(300, safePerFeedJitter));

          let record = null;
          try {
            record = await getOrCreateFeedRecord(feedName);
          } catch (err) {
            console.error(`[GameNews] DB error for feed ${feedName}:`, err?.message || err);
            continue;
          }

          if (isFeedPaused(record)) {
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[GameNews] Feed paused: ${feedName} until ${record.pausedUntil.toISOString()}`);
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
            const freshItems = lastSentAt
              ? items.filter((it) => {
                  const d = getItemDate(it);
                  return d && !Number.isNaN(d.getTime()) && d.getTime() > lastSentAt.getTime();
                })
              : items;

            if (freshItems.length === 0) {
              await registerFeedSuccess(record).catch(() => null);
              continue;
            }

            const channel = await client.channels.fetch(feed.channelId).catch(() => null);
            if (!channel) {
              console.warn(`[GameNews] Channel not found: ${feed.channelId} (${feedName})`);
              await registerFeedSuccess(record).catch(() => null);
              continue;
            }

            const newItems = getNewItemsByHashes(freshItems, record.lastHashes);
            if (newItems.length === 0) {
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
              await registerFeedFailure(record, config);

              if (record.pausedUntil && record.pausedUntil.getTime() > Date.now()) {
                console.warn(
                  `[GameNews] Feed "${feedName}" paused until ${record.pausedUntil.toISOString()} (backoff).`
                );
              }
            } catch (e) {
              console.error(`[GameNews] Failed updating failure/backoff for ${feedName}:`, e?.message || e);
            }
          }
        }
      } finally {
        isRunning = false;
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
