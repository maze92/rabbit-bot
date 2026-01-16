/**
 * src/systems/gamenews.js
 * ============================================================
 * Sistema de Game News (RSS)
 *
 * O que faz:
 * - Lê feeds RSS configurados no defaultConfig.js
 * - Dedupe real com lastHashes (últimos N hashes por feed)
 * - Backoff por feed (pausa após X falhas consecutivas)
 * - Guarda lastSentAt por feed (último envio bem sucedido)
 *
 * Micro-upgrades:
 * ✅ Não envia notícia muito antiga (ex: > 7 dias)
 * ✅ Retry com jitter em falhas de RSS (reduz erros transitórios)
 * ✅ Jitter no agendamento (não bate sempre ao mesmo tempo)
 *
 * Proteções:
 * - started: evita iniciar 2x (duplicar timers)
 * - isRunning: evita overlaps (um ciclo não começa se o anterior ainda corre)
 * - 1 notícia por feed por ciclo (evita spam)
 * - envia o MAIS ANTIGO entre os novos (para manter ordem sem spammar)
 * ============================================================
 */

const Parser = require('rss-parser');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');

const GameNews = require('../database/models/GameNews');
const logger = require('./logger');

const parser = new Parser({ timeout: 15000 });

let started = false;
let isRunning = false;

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random int between [min, max]
 */
function randInt(min, max) {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

/**
 * Jitter helper:
 * - given base ms and +/- jitterMs, returns base +/- random
 */
function withJitter(baseMs, jitterMs) {
  const j = Math.max(0, Number(jitterMs || 0));
  if (!j) return baseMs;
  return Math.max(0, baseMs + randInt(-j, j));
}

/**
 * Gera hash estável para um item do RSS.
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
 * Normaliza data do item (para timestamp do embed).
 */
function getItemDate(item) {
  const d = item.isoDate || item.pubDate;
  const parsed = d ? new Date(d) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
}

/**
 * Verifica se a notícia é "muito antiga" com base em maxAgeDays
 * - Se não tiver data válida no item, consideramos "não antiga" (para não bloquear)
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
 * Busca ou cria record do feed na DB.
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

/**
 * Feed pausado por backoff?
 */
function isFeedPaused(record) {
  if (!record?.pausedUntil) return false;
  return record.pausedUntil.getTime() > Date.now();
}

/**
 * Regista falha + aplica backoff se atingir limite.
 */
async function registerFeedFailure(record, config) {
  const maxFails = Number(config?.gameNews?.backoff?.maxFails ?? 3);
  const pauseMs = Number(config?.gameNews?.backoff?.pauseMs ?? 30 * 60 * 1000);

  record.failCount = (record.failCount || 0) + 1;

  if (record.failCount >= maxFails) {
    record.pausedUntil = new Date(Date.now() + pauseMs);
    record.failCount = 0; // reseta ao pausar
  }

  await record.save();
}

/**
 * Sucesso -> reseta failCount (e limpa pausa expirada)
 */
async function registerFeedSuccess(record) {
  if (record.pausedUntil && record.pausedUntil.getTime() <= Date.now()) {
    record.pausedUntil = null;
  }

  if (record.failCount && record.failCount !== 0) {
    record.failCount = 0;
  }

  await record.save();
}

/**
 * Dedupe real: devolve apenas itens cujo hash NÃO está em lastHashes.
 * Se lastHashes vazio, devolve apenas o item mais recente (evita spam no primeiro arranque).
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
 * Adiciona hash e corta para manter apenas os últimos N.
 */
function pushHashAndTrim(record, hash, keepN) {
  if (!Array.isArray(record.lastHashes)) record.lastHashes = [];

  // remove duplicado se existir
  record.lastHashes = record.lastHashes.filter((h) => h !== hash);

  record.lastHashes.push(hash);

  if (record.lastHashes.length > keepN) {
    record.lastHashes = record.lastHashes.slice(record.lastHashes.length - keepN);
  }
}

/**
 * Parse do RSS com retry + jitter.
 * - Faz retries pequenos (ex: 2 tentativas) antes de considerar falha e contar no backoff
 */
async function parseWithRetry(url, retryCfg) {
  const attempts = Number(retryCfg?.attempts ?? 2); // total tentativas (2 = tenta 2x)
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

      // se ainda há tentativas, espera um bocadinho com jitter
      if (i < safeAttempts) {
        const waitMs = withJitter(safeBase * i, safeJitter);
        await sleep(waitMs);
      }
    }
  }

  throw lastErr;
}

/**
 * Envia 1 notícia e atualiza DB:
 * - lastHashes (dedupe)
 * - lastSentAt
 * - failCount/pausedUntil
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

  // atualiza hashes
  pushHashAndTrim(record, hash, keepN);

  // marca último envio
  record.lastSentAt = new Date();

  // sucesso: limpa falhas e pausa expirada
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
}

/**
 * Função principal.
 * Chamar UMA vez (no index.js após clientReady).
 */
module.exports = async function gameNewsSystem(client, config) {
  try {
    if (!config?.gameNews?.enabled) return;

    if (started) {
      console.log('[GameNews] Already started. Skipping duplicate start.');
      return;
    }
    started = true;

    // intervalo base global
    const baseIntervalMs = Number(config.gameNews.interval ?? 30 * 60 * 1000);
    const safeBaseInterval =
      Number.isFinite(baseIntervalMs) && baseIntervalMs >= 10_000 ? baseIntervalMs : 30 * 60 * 1000;

    // jitter global do ciclo (para não bater sempre ao mesmo tempo)
    const globalJitterMs = Number(config.gameNews.jitterMs ?? 20_000); // default 20s
    const safeGlobalJitter = Number.isFinite(globalJitterMs) && globalJitterMs >= 0 ? globalJitterMs : 20_000;

    // quantos hashes manter por feed
    const keepHashes = Number(config.gameNews.keepHashes ?? 10);
    const safeKeep =
      Number.isFinite(keepHashes) && keepHashes >= 5 && keepHashes <= 50 ? keepHashes : 10;

    // idade máxima (dias)
    const maxAgeDays = Number(config.gameNews.maxAgeDays ?? 7);
    const safeMaxAgeDays =
      Number.isFinite(maxAgeDays) && maxAgeDays >= 1 && maxAgeDays <= 365 ? maxAgeDays : 7;

    // retry config
    const retryCfg = config.gameNews.retry || { attempts: 2, baseDelayMs: 1200, jitterMs: 800 };

    console.log('[GameNews] News system started');

    // loop agendado "recursivo" com jitter (em vez de setInterval fixo)
    const runLoop = async () => {
      // evita overlaps
      if (isRunning) return;
      isRunning = true;

      try {
        const feeds = Array.isArray(config.gameNews.sources) ? config.gameNews.sources : [];
        if (feeds.length === 0) return;

        for (const feed of feeds) {
          const feedName = feed?.name || 'UnknownFeed';

          // jitter por feed (opcional): espalha chamadas dentro do mesmo ciclo
          const perFeedJitterMs = Number(config.gameNews.perFeedJitterMs ?? 1500);
          const safePerFeedJitter = Number.isFinite(perFeedJitterMs) && perFeedJitterMs >= 0 ? perFeedJitterMs : 1500;

          // pequeno delay com jitter entre feeds (evita bursts)
          await sleep(withJitter(300, safePerFeedJitter));

          // 1) record DB do feed
          let record = null;
          try {
            record = await getOrCreateFeedRecord(feedName);
          } catch (err) {
            console.error(`[GameNews] DB error for feed ${feedName}:`, err?.message || err);
            continue;
          }

          // 2) backoff: se feed estiver pausado, ignora
          if (isFeedPaused(record)) {
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[GameNews] Feed paused: ${feedName} until ${record.pausedUntil.toISOString()}`);
            }
            continue;
          }

          try {
            // 3) parse do RSS (com retry + jitter)
            const parsed = await parseWithRetry(feed.feed, retryCfg);
            const items = parsed?.items || [];
            if (items.length === 0) {
              await registerFeedSuccess(record).catch(() => null);
              continue;
            }

            // 4) canal Discord
            const channel = await client.channels.fetch(feed.channelId).catch(() => null);
            if (!channel) {
              console.warn(`[GameNews] Channel not found: ${feed.channelId} (${feedName})`);
              await registerFeedSuccess(record).catch(() => null);
              continue;
            }

            // 5) dedupe por lastHashes
            const newItems = getNewItemsByHashes(items, record.lastHashes);
            if (newItems.length === 0) {
              await registerFeedSuccess(record).catch(() => null);
              continue;
            }

            // 6) escolher o MAIS ANTIGO entre os novos para manter ordem e não spammar
            const itemToSend = newItems[newItems.length - 1];

            // item malformado: não conta como falha
            if (!itemToSend?.title || !itemToSend?.link) {
              await registerFeedSuccess(record).catch(() => null);
              continue;
            }

            // 7) bloquear notícia muito antiga
            if (isItemTooOld(itemToSend, safeMaxAgeDays)) {
              // Marca hash mesmo assim? NÃO.
              // Motivo: se o feed só tiver coisas antigas, não queremos “fixar” hashes e mascarar.
              // Só ignoramos silenciosamente.
              if (process.env.NODE_ENV !== 'production') {
                console.log(`[GameNews] Skipped old item (${feedName}): ${itemToSend.title}`);
              }
              await registerFeedSuccess(record).catch(() => null);
              continue;
            }

            // 8) enviar e atualizar DB
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

            // conta falha + backoff
            try {
              await registerFeedFailure(record, config);

              // se entrou em pausa, loga
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
      }
    };

    // Scheduler com jitter global
    const scheduleNext = async () => {
      // corre um ciclo
      await runLoop().catch(() => null);

      // agenda próximo com jitter global
      const nextInMs = withJitter(safeBaseInterval, safeGlobalJitter);
      setTimeout(scheduleNext, nextInMs).unref?.();
    };

    // primeira corrida ligeiramente "espalhada"
    const firstDelay = withJitter(1500, Math.min(5000, safeGlobalJitter));
    setTimeout(scheduleNext, firstDelay).unref?.();

  } catch (err) {
    console.error('[GameNews] Critical error starting system:', err);
  }
};
