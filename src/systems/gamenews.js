// src/systems/gamenews.js
/**
 * ============================================================
 * Sistema de Game News (RSS)
 *
 * - Lê feeds RSS configurados no defaultConfig.js
 * - Dedupe real guardando os últimos N hashes por feed
 * - Backoff por feed quando há erros consecutivos
 * - lastSentAt por feed
 * - Não envia notícias muito antigas (ex: > 7 dias)
 * - Retry com jitter para reduzir falhas transitórias
 * - Painel no Dashboard: gamenews_status (por feed)
 * ============================================================
 */

const Parser = require('rss-parser');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');

const GameNews = require('../database/models/GameNews'); // ✅ nome/case correto
const logger = require('./logger');
const dashboard = require('../dashboard');

const parser = new Parser({ timeout: 15000 });

let started = false;    // evita iniciar 2x
let isRunning = false;  // evita overlap entre ciclos

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

/**
 * Hash estável para dedupe
 */
function generateHash(item) {
  const base =
    item.guid ||
    item.id ||
    item.link ||
    `${item.title || ''}-${item.isoDate || item.pubDate || ''}`;

  return crypto.createHash('sha256').update(String(base)).digest('hex');
}

/**
 * Data do item para embed + validação de idade
 */
function getItemDate(item) {
  const d = item.isoDate || item.pubDate;
  const parsed = d ? new Date(d) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
}

/**
 * Bloqueia notícias muito antigas (por ex. > 7 dias)
 */
function isItemTooOld(item, maxAgeDays) {
  const days = Number(maxAgeDays);
  if (!Number.isFinite(days) || days <= 0) return false;

  const itemDate = getItemDate(item);
  if (!itemDate || Number.isNaN(itemDate.getTime())) return false;

  const ageMs = Date.now() - itemDate.getTime();
  const maxMs = days * 24 * 60 * 60 * 1000;
  return ageMs > maxMs;
}

/**
 * DB: obter/criar record do feed
 */
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

/**
 * Backoff por feed:
 * - se falhar X vezes seguidas => pausa por Y ms
 */
async function registerFeedFailure(record, cfg) {
  const maxFails = Number(cfg?.gameNews?.backoff?.maxFails ?? 3);
  const pauseMs = Number(cfg?.gameNews?.backoff?.pauseMs ?? 30 * 60 * 1000);

  record.failCount = (record.failCount || 0) + 1;

  if (record.failCount >= maxFails) {
    record.pausedUntil = new Date(Date.now() + pauseMs);
    record.failCount = 0; // reseta quando pausa
  }

  await record.save();
}

async function registerFeedSuccess(record) {
  // limpa pausa expirada
  if (record.pausedUntil && record.pausedUntil.getTime() <= Date.now()) {
    record.pausedUntil = null;
  }

  // reseta falhas
  if (record.failCount && record.failCount !== 0) record.failCount = 0;

  await record.save();
}

/**
 * Dedupe real:
 * - se lastHashes vazio => envia só a mais recente (não spamma no primeiro arranque)
 * - senão => devolve todos os itens cujo hash não está em lastHashes
 */
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

/**
 * Guarda hash e mantém só os últimos N
 */
function pushHashAndTrim(record, hash, keepN) {
  if (!Array.isArray(record.lastHashes)) record.lastHashes = [];

  // remover duplicado se existir
  record.lastHashes = record.lastHashes.filter((h) => h !== hash);

  // adicionar no fim
  record.lastHashes.push(hash);

  // cortar para os últimos N
  if (record.lastHashes.length > keepN) {
    record.lastHashes = record.lastHashes.slice(record.lastHashes.length - keepN);
  }
}

/**
 * Envia estado do feed para o dashboard
 */
function broadcastFeedStatus(record, feed) {
  if (!dashboard?.sendToDashboard) return;

  dashboard.sendToDashboard('gamenews_status', {
    source: feed?.name || record.source,
    feedUrl: feed?.feed || null,
    channelId: feed?.channelId || null,
    lastSentAt: record.lastSentAt || null,
    pausedUntil: record.pausedUntil || null,
    failCount: record.failCount || 0,
    lastHashesCount: Array.isArray(record.lastHashes) ? record.lastHashes.length : 0
  });
}

/**
 * Parse RSS com retry + jitter
 */
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
        await sleep(withJitter(safeBase * i, safeJitter));
      }
    }
  }

  throw lastErr;
}

/**
 * Envia 1 notícia e atualiza DB
 */
async function sendOneNewsAndUpdate({ client, feed, channel, record, item, keepN }) {
  const hash = generateHash(item);

  const embed = new EmbedBuilder()
    .setTitle(item.title || 'New article')
    .setURL(item.link || null)
    .setDescription(item.contentSnippet || item.content || 'No description available.')
    .setColor(0xe60012)
    .setFooter({ text: feed.name })
    .setTimestamp(getItemDate(item));

  if (item.enclosure?.url) embed.setThumbnail(item.enclosure.url);

  await channel.send({ embeds: [embed] });

  // dedupe
  pushHashAndTrim(record, hash, keepN);

  // lastSentAt
  record.lastSentAt = new Date();

  // reset backoff
  record.failCount = 0;
  if (record.pausedUntil && record.pausedUntil.getTime() <= Date.now()) {
    record.pausedUntil = null;
  }

  await record.save();

  await logger(
    client,
    'Game News',
    null,
    client.user,
    `Sent: **${feed.name}** -> **${item.title || 'Untitled'}**`,
    channel.guild
  );

  console.log(`[GameNews] Sent: ${feed.name} -> ${item.title}`);

  // dashboard status
  broadcastFeedStatus(record, feed);
}

/**
 * MAIN
 */
module.exports = async function gameNewsSystem(client, config) {
  try {
    if (!config?.gameNews?.enabled) return;

    if (started) {
      console.log('[GameNews] Already started. Skipping duplicate start.');
      return;
    }
    started = true;

    // configs (com defaults seguros)
    const intervalMs = Number(config.gameNews.interval ?? 30 * 60 * 1000);
    const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 10_000 ? intervalMs : 30 * 60 * 1000;

    const keepHashes = Number(config.gameNews.keepHashes ?? 10);
    const safeKeep = Number.isFinite(keepHashes) && keepHashes >= 5 && keepHashes <= 50 ? keepHashes : 10;

    const maxAgeDays = Number(config.gameNews.maxAgeDays ?? 7);
    const safeMaxAgeDays = Number.isFinite(maxAgeDays) && maxAgeDays >= 1 && maxAgeDays <= 365 ? maxAgeDays : 7;

    const retryCfg = config.gameNews.retry || { attempts: 2, baseDelayMs: 1200, jitterMs: 800 };

    const globalJitterMs = Number(config.gameNews.jitterMs ?? 20_000);
    const safeGlobalJitter = Number.isFinite(globalJitterMs) && globalJitterMs >= 0 ? globalJitterMs : 20_000;

    const perFeedJitterMs = Number(config.gameNews.perFeedJitterMs ?? 1500);
    const safePerFeedJitter = Number.isFinite(perFeedJitterMs) && perFeedJitterMs >= 0 ? perFeedJitterMs : 1500;

    console.log('[GameNews] News system started');

    // scheduler com jitter (em vez de setInterval fixo)
    const loopOnce = async () => {
      if (isRunning) return;
      isRunning = true;

      try {
        const feeds = Array.isArray(config.gameNews.sources) ? config.gameNews.sources : [];
        for (const feed of feeds) {
          await sleep(withJitter(250, safePerFeedJitter));

          const feedName = feed?.name || 'UnknownFeed';
          let record;

          try {
            record = await getOrCreateFeedRecord(feedName);
          } catch (err) {
            console.error(`[GameNews] DB error for feed ${feedName}:`, err?.message || err);
            continue;
          }

          // se pausado, envia status e skip
          if (isFeedPaused(record)) {
            broadcastFeedStatus(record, feed);
            continue;
          }

          try {
            // parse com retry
            const parsed = await parseWithRetry(feed.feed, retryCfg);
            const items = parsed?.items || [];
            if (items.length === 0) {
              await registerFeedSuccess(record).catch(() => null);
              broadcastFeedStatus(record, feed);
              continue;
            }

            // canal
            const channel = await client.channels.fetch(feed.channelId).catch(() => null);
            if (!channel) {
              console.warn(`[GameNews] Channel not found: ${feed.channelId} (${feedName})`);
              await registerFeedSuccess(record).catch(() => null);
              broadcastFeedStatus(record, feed);
              continue;
            }

            // dedupe
            const newItems = getNewItemsByHashes(items, record.lastHashes);
            if (newItems.length === 0) {
              await registerFeedSuccess(record).catch(() => null);
              broadcastFeedStatus(record, feed);
              continue;
            }

            // escolhe o MAIS ANTIGO entre os novos (para manter ordem e evitar spam)
            const itemToSend = newItems[newItems.length - 1];

            // validação mínima
            if (!itemToSend?.title || !itemToSend?.link) {
              await registerFeedSuccess(record).catch(() => null);
              broadcastFeedStatus(record, feed);
              continue;
            }

            // não enviar se for antigo demais
            if (isItemTooOld(itemToSend, safeMaxAgeDays)) {
              await registerFeedSuccess(record).catch(() => null);
              broadcastFeedStatus(record, feed);
              continue;
            }

            // envia só 1 por feed por ciclo
            await sendOneNewsAndUpdate({
              client,
              feed,
              channel,
              record,
              item: itemToSend,
              keepN: safeKeep
            });
          } catch (err) {
            console.error(`[GameNews] Error processing feed ${feedName}:`, err?.message || err);

            try {
              await registerFeedFailure(record, config);
              broadcastFeedStatus(record, feed);
            } catch (e) {
              console.error(`[GameNews] Failed updating failure/backoff for ${feedName}:`, e?.message || e);
            }
          }
        }
      } finally {
        isRunning = false;
      }
    };

    const schedule = async () => {
      await loopOnce().catch(() => null);
      setTimeout(schedule, withJitter(safeInterval, safeGlobalJitter)).unref?.();
    };

    setTimeout(schedule, withJitter(1500, Math.min(5000, safeGlobalJitter))).unref?.();
  } catch (err) {
    console.error('[GameNews] Critical error starting system:', err);
  }
};
