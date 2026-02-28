// src/systems/gamenews.js

const Parser = require('rss-parser');
const crypto = require('crypto');
const { URL } = require('url');
const dns = require('dns').promises;
const net = require('net');
const { EmbedBuilder } = require('discord.js');
const { fetchChannel } = require('../services/discordFetchCache');

const GameNews = require('../database/models/GameNews');
let GameNewsFeed = null;
try {
  GameNewsFeed = require('../database/models/GameNewsFeed');
} catch (e) {
  console.warn('[GameNews] GameNewsFeed model not loaded, falling back to static config.sources');
}

const logger = require('./logger');
// Node 20+ includes AbortController. Keep a safe fallback.
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

const dashboardBridge = require('./dashboardBridge');

const parser = new Parser({ timeout: 15000 });

const FEED_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; .rabbit/1.0; +https://github.com/maze92/rabbit-bot)',
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

function normalizeIp(ip) {
  if (!ip || typeof ip !== 'string') return '';
  // IPv6-mapped IPv4: ::ffff:1.2.3.4
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

function isPrivateIp(ip) {
  const addr = normalizeIp(ip);
  const family = net.isIP(addr);
  if (!family) return false;

  if (family === 4) {
    const parts = addr.split('.').map((x) => Number(x));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a, b] = parts;

    // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
    if (a === 0 || a === 10 || a === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 (CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // Multicast / reserved high ranges
    if (a >= 224) return true;

    return false;
  }

  // IPv6 checks (string comparisons are safe for these well-known prefixes)
  const low = addr.toLowerCase();
  if (low === '::1' || low === '::') return true;
  // Unique local fc00::/7
  if (low.startsWith('fc') || low.startsWith('fd')) return true;
  // Link-local fe80::/10
  if (low.startsWith('fe8') || low.startsWith('fe9') || low.startsWith('fea') || low.startsWith('feb')) return true;
  // Documentation 2001:db8::/32
  if (low.startsWith('2001:db8')) return true;

  return false;
}

function isBlockedHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  // Basic defense against cloud metadata hostnames (in addition to IP checks)
  if (h === 'metadata.google.internal') return true;
  return false;
}

async function withTimeout(promise, ms, label = 'timeout') {
  const t = Number(ms);
  const safeMs = Number.isFinite(t) && t > 0 ? t : 2000;
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), safeMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function assertSafeUrl(urlStr, dnsTimeoutMs = 2000) {
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error('Invalid feed URL');
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Unsupported feed URL protocol');
  }
  if (u.username || u.password) {
    throw new Error('Feed URL must not include credentials');
  }
  if (isBlockedHostname(u.hostname)) {
    throw new Error('Blocked feed host');
  }

  // If hostname is an IP literal, validate directly.
  if (net.isIP(u.hostname)) {
    if (isPrivateIp(u.hostname)) throw new Error('Blocked feed IP');
    return u;
  }

  // Resolve DNS and block private/loopback/link-local ranges.
  const addrs = await withTimeout(dns.lookup(u.hostname, { all: true, verbatim: true }), dnsTimeoutMs, 'DNS timeout');
  if (!Array.isArray(addrs) || addrs.length === 0) throw new Error('DNS lookup failed');

  for (const a of addrs) {
    const ip = a && a.address ? String(a.address) : '';
    if (isPrivateIp(ip)) throw new Error('Blocked feed IP');
  }

  return u;
}

async function readBodyTextLimited(res, maxBytes, controller) {
  const limit = Number(maxBytes);
  const safeLimit = Number.isFinite(limit) && limit >= 10_000 ? limit : 1_500_000;

  // Prefer web streams (undici) when available.
  const body = res && res.body;
  const reader = body && typeof body.getReader === 'function' ? body.getReader() : null;

  if (reader) {
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += buf.byteLength;
      if (total > safeLimit) {
        try { controller?.abort?.(); } catch {}
        throw new Error('Feed payload too large');
      }
      chunks.push(buf);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(out);
  }

  // Fallback (may buffer everything): guard via content-length when present.
  const cl = Number(res.headers?.get?.('content-length') || 0);
  if (Number.isFinite(cl) && cl > 0 && cl > safeLimit) throw new Error('Feed payload too large');
  const txt = await res.text();
  if (txt && Buffer.byteLength(txt, 'utf8') > safeLimit) throw new Error('Feed payload too large');
  return txt;
}

async function fetchFeedXmlWithGuards(urlStr, record, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? 15_000);
  const maxBytes = Number(opts.maxBytes ?? 1_500_000);
  const maxRedirects = Number(opts.maxRedirects ?? 5);
  const dnsTimeoutMs = Number(opts.dnsTimeoutMs ?? 2000);

  const safeTimeout = Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? timeoutMs : 15_000;
  const safeRedirects = Number.isFinite(maxRedirects) && maxRedirects >= 0 && maxRedirects <= 10 ? maxRedirects : 5;

  let current = urlStr;
  for (let r = 0; r <= safeRedirects; r++) {
    const u = await assertSafeUrl(current, dnsTimeoutMs);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), safeTimeout);

    // Conditional GET support (ETag / Last-Modified)
    const headers = { ...FEED_HEADERS };
    if (record?.etag) headers['If-None-Match'] = record.etag;
    if (record?.lastModified) headers['If-Modified-Since'] = record.lastModified;

    let res;
    try {
      res = await fetch(u.toString(), { headers, redirect: 'manual', signal: controller.signal });
    } finally {
      clearTimeout(t);
    }

    if (res.status === 304) return null;

    // Handle redirects manually so we can re-validate targets.
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirect without Location (${res.status})`);
      current = new URL(loc, u).toString();
      continue;
    }

    if (!res.ok) {
      const err = new Error(`Status code ${res.status}`);
      err.statusCode = res.status;
      throw err;
    }

    // Update cache hints
    const newEtag = res.headers.get('etag');
    const newLastMod = res.headers.get('last-modified');
    if (record) {
      record.etag = newEtag || record.etag || null;
      record.lastModified = newLastMod || record.lastModified || null;
    }

    const xml = await readBodyTextLimited(res, maxBytes, controller);
    return xml;
  }

  throw new Error('Too many redirects');
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

// Backward-compatible signature:
// - parseWithRetry(url, retryCfg, record)
// - parseWithRetry(url, retryCfg, record, timeoutMsNumber)
// - parseWithRetry(url, retryCfg, record, { timeoutMs, maxBytes, maxRedirects, dnsTimeoutMs })
async function parseWithRetry(url, retryCfg, record, options = undefined) {
  const attempts = Number(retryCfg?.attempts ?? 2);
  const baseDelayMs = Number(retryCfg?.baseDelayMs ?? 1200);
  const jitterMs = Number(retryCfg?.jitterMs ?? 800);

  const safeAttempts = Number.isFinite(attempts) && attempts >= 1 && attempts <= 5 ? attempts : 2;
  const safeBase = Number.isFinite(baseDelayMs) && baseDelayMs >= 100 ? baseDelayMs : 1200;
  const safeJitter = Number.isFinite(jitterMs) && jitterMs >= 0 ? jitterMs : 800;

  let lastErr = null;

  // Normalize options (keep compatibility with old numeric timeout).
  const opts = (typeof options === 'number') ? { timeoutMs: options } : (options && typeof options === 'object' ? options : {});

  for (let i = 1; i <= safeAttempts; i++) {
    try {
      const xml = await fetchFeedXmlWithGuards(url, record, opts);
      if (xml === null) return null; // 304 Not Modified
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
    ch = client.channels.cache.get(feed.channelId) || await fetchChannel(client, feed.channelId);
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

  // Optional success log (only when a per-feed log channel is configured).
  if (feed?.logChannelId && config?.gameNews?.logEnabled === true) {
    await sendFeedLog(
      client,
      feed,
      `📰 GameNews: enviado **${feed.name}** -> **${item.title || 'Untitled'}**`
    ).catch(() => null);
  }
}async function getFeedsFromDb() {
  if (!GameNewsFeed) return [];
  try {
    const docs = await GameNewsFeed.find({}).lean();

    // Backward-compat: older documents may use { feed } and/or { channel }.
    // We normalize in-memory and opportunistically migrate to the new fields.
    const out = [];
    for (const d of docs) {
      if (!d) continue;

      const feedUrl = d.feedUrl || d.feed || d.url || null;
      const channelId = d.channelId || d.channel || d.targetChannelId || null;

      if (!feedUrl || !channelId) continue;

      // Opportunistic one-way migration (safe no-op if already migrated)
      if ((d.feed && !d.feedUrl) || (d.channel && !d.channelId)) {
        try {
          const $set = {};
          if (d.feed && !d.feedUrl) $set.feedUrl = d.feed;
          if (d.channel && !d.channelId) $set.channelId = d.channel;
          if (Object.keys($set).length) {
            await GameNewsFeed.updateOne({ _id: d._id }, { $set }).exec();
          }
        } catch (e) {
          // ignore migration errors; do not block startup
        }
      }

      out.push({
        guildId: d.guildId || null,
        name: d.name || 'Feed',
        feed: feedUrl,
        channelId,
        logChannelId: d.logChannelId || null,
        enabled: d.enabled !== false,
        // Per-feed interval override (ms). Falls back to config.gameNews.interval when null/invalid.
        intervalMs: typeof d.intervalMs === 'number' ? d.intervalMs : null
      });
    }

    return out;
  } catch (err) {
    console.error('[GameNews] Failed to load feeds from DB:', err?.message || err);
    return [];
  }
}

async function getEffectiveFeeds(config) {
  // Single source of truth: GameNewsFeed collection.
  // Se não existirem feeds na DB, o sistema não envia nada
  // até o utilizador configurar feeds na dashboard.
  const dbFeeds = await getFeedsFromDb();
  const activeDb = dbFeeds.filter((f) => f.enabled && f.feed && f.channelId);
  return activeDb;
}

async function buildStatusPayload(config) {
  const feeds = await getEffectiveFeeds(config);
  if (!Array.isArray(feeds) || feeds.length === 0) return [];

  const baseIntervalMs = Number(config.gameNews?.interval ?? 30 * 60 * 1000);
  const now = Date.now();

  // Build stable source keys for each feed (guildId + feedUrl + channelId).
  const sourceKeys = feeds.map((f) => makeFeedSourceKey(f));

  // Also include legacy name-based keys as a fallback, in case the DB still has old docs.
  const legacyNames = feeds.map((f) => f?.name).filter(Boolean);

  const queryKeys = Array.from(new Set([...sourceKeys, ...legacyNames]));
  const docs = await GameNews.find({ source: { $in: queryKeys } }).lean();

  const bySource = new Map();
  const byName = new Map();
  for (const d of docs) {
    if (d.source) bySource.set(d.source, d);
    if (d.name) byName.set(d.name, d);
  }

  return feeds.map((f, idx) => {
    const sourceKey = sourceKeys[idx];
    let d = bySource.get(sourceKey) || null;

    // Legacy fallback: if we don't have a record for the stable key yet,
    // try to fall back to an old name-based record.
    if (!d && f.name) {
      d = bySource.get(f.name) || byName.get(f.name) || null;
    }

    const pausedUntil = d?.pausedUntil ? new Date(d.pausedUntil) : null;
    const paused = pausedUntil ? pausedUntil.getTime() > now : false;

    const intervalOverride = Number(f.intervalMs ?? 0);
    const safeBase =
      Number.isFinite(baseIntervalMs) && baseIntervalMs > 0 ? baseIntervalMs : 30 * 60 * 1000;
    const effectiveIntervalMs =
      Number.isFinite(intervalOverride) && intervalOverride > 0 ? intervalOverride : safeBase;

    return {
      // Use the stable source key so the dashboard can uniquely identify feeds.
      source: sourceKey,
      feedName: f.name,
      feedUrl: f.feed || f.feedUrl,
      channelId: f.channelId,

      failCount: d?.failCount ?? 0,
      pausedUntil: d?.pausedUntil ?? null,
      lastSentAt: d?.lastSentAt ?? null,
      lastHashesCount: Array.isArray(d?.lastHashes) ? d.lastHashes.length : 0,

      paused,
      updatedAt: d?.updatedAt ?? null,

      intervalMs: effectiveIntervalMs,
      intervalOverrideMs:
        Number.isFinite(intervalOverride) && intervalOverride > 0 ? intervalOverride : null
    };
  });
}


async function emitStatusToDashboard(config) {
  try {
    const payload = await buildStatusPayload(config);
    // Usa a bridge para evitar dependência circular com o módulo dashboard.
    dashboardBridge.emit('gamenews_status', payload);
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
            const fetchOpts = {
              timeoutMs: Number(config.gameNews?.timeoutMs ?? 15_000),
              maxBytes: Number(config.gameNews?.maxXmlBytes ?? 1_500_000),
              maxRedirects: Number(config.gameNews?.maxRedirects ?? 5),
              dnsTimeoutMs: Number(config.gameNews?.dnsTimeoutMs ?? 2000)
            };

            const parsed = await parseWithRetry(feed.feed, retryCfg, record, fetchOpts);
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
            const channel = await fetchChannel(client, feed.channelId);
            if (!channel) {
              console.warn(`[GameNews] Channel not found: ${feed.channelId} (${feedName})`);
              await registerFeedSuccess(record).catch(() => null);
              continue;
            }

            const maxPerCycle =
              (typeof feed?.maxPerCycle === 'number' && Number.isFinite(feed.maxPerCycle))
                ? Number(feed.maxPerCycle)
                : Number(config.gameNews?.maxPerCycle ?? 3);
            const safeMaxPerCycle = Number.isFinite(maxPerCycle) && maxPerCycle >= 1 && maxPerCycle <= 10
              ? Math.round(maxPerCycle)
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

  // Load / create GameNews record for this source (also holds HTTP cache hints)
  const record = await getOrCreateFeedRecord(feed);

  // Fetch RSS feed once (conditional GET may return null when 304 Not Modified)
  const fetchOpts = {
    timeoutMs: Number(cfg.gameNews?.timeoutMs ?? 15_000),
    maxBytes: Number(cfg.gameNews?.maxXmlBytes ?? 1_500_000),
    maxRedirects: Number(cfg.gameNews?.maxRedirects ?? 5),
    dnsTimeoutMs: Number(cfg.gameNews?.dnsTimeoutMs ?? 2000)
  };

  const parsed = await parseWithRetry(feed.feed, retryCfg, record, fetchOpts);
  const items = Array.isArray(parsed?.items) ? parsed.items.slice() : [];

  if (!parsed) {
    // Nothing changed; still persist any cache hint changes safely.
    await registerFeedSuccess(record).catch(() => null);
    return { ok: true, feedName: feed.name, title: null, link: null, note: 'Not modified (304)' };
  }

  if (!items.length) {
    throw new Error('RSS feed returned no items');
  }

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
    (await fetchChannel(client, feed.channelId));

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
      (await fetchChannel(client, feed.logChannelId));

    if (!channel || !channel.isTextBased?.() || !hasSendPerm(channel, client)) return;

    await channel.send(String(message).slice(0, 1800));
  } catch (e) {
    // silent
  }
}

module.exports = gameNewsSystem;
module.exports.testSendGameNews = testSendGameNews;