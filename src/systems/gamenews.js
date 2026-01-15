/**
 * src/systems/gamenews.js
 * ============================================================
 * Sistema de Game News (RSS)
 *
 * O que faz:
 * - Lê feeds RSS configurados no defaultConfig.js
 * - Deteta notícias novas (sem repost)
 * - Envia no Discord (embeds)
 * - Guarda o "lastHash" no MongoDB (GameNews model)
 *
 * Proteções importantes:
 * - "started" evita iniciar 2 vezes (duplicar setInterval)
 * - "isRunning" evita overlaps (um ciclo não começa se o anterior ainda está a correr)
 * - Envia no máximo 1 notícia por feed e por intervalo (evita spam)
 * - Em caso de várias novas notícias, envia sempre a mais antiga das novas
 *   (para manter ordem e ir "apanhando" gradualmente sem spammar)
 * ============================================================
 */

const Parser = require('rss-parser');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');

const GameNews = require('../database/models/GameNews'); // ✅ (confirmado por ti)
const logger = require('./logger');

const parser = new Parser({ timeout: 15000 }); // 15s timeout

let started = false;   // evita iniciar 2x
let isRunning = false; // evita overlap entre ciclos

/**
 * Gera um hash estável para um item de RSS.
 * Usamos várias opções para ser mais resistente (guid/link/title).
 */
function generateHash(item) {
  const base =
    item.guid ||
    item.id ||
    item.link ||
    `${item.title || ''}-${item.pubDate || item.isoDate || ''}`;

  return crypto.createHash('sha256').update(String(base)).digest('hex');
}

/**
 * Normaliza a data do item (para timestamp do embed).
 */
function getItemDate(item) {
  const d = item.isoDate || item.pubDate;
  const parsed = d ? new Date(d) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
}

/**
 * Busca (ou cria) o registo do feed na DB.
 */
async function getOrCreateFeedRecord(feedName) {
  let record = await GameNews.findOne({ source: feedName });

  if (!record) {
    record = await GameNews.create({
      source: feedName,
      lastHash: null
    });
  }

  return record;
}

/**
 * Dado um array de items RSS (normalmente ordenados do mais novo para o mais antigo),
 * devolve a lista de itens "novos" até encontrar o lastHash.
 *
 * Exemplo:
 * - items: [A, B, C, D] (A = mais novo)
 * - lastHash = hash(C)
 * - novos = [A, B]
 */
function getNewItemsSinceLast(items, lastHash) {
  if (!Array.isArray(items) || items.length === 0) return [];

  // Se nunca enviou nada, consideramos "novo" só o mais recente,
  // para não mandar 30 posts no primeiro arranque.
  if (!lastHash) return [items[0]];

  const newItems = [];
  for (const it of items) {
    const h = generateHash(it);

    // Quando encontramos o lastHash, paramos: daqui para baixo já foi "visto"
    if (h === lastHash) break;

    newItems.push(it);
  }

  return newItems;
}

/**
 * Envia 1 notícia para o canal e atualiza o lastHash no MongoDB.
 */
async function sendOneNewsAndUpdate({ client, feed, channel, record, item }) {
  const hash = generateHash(item);

  const embed = new EmbedBuilder()
    .setTitle(item.title || 'New article')
    .setURL(item.link || null)
    .setDescription(item.contentSnippet || item.content || 'No description available.')
    .setColor(0xe60012)
    .setFooter({ text: feed.name })
    .setTimestamp(getItemDate(item));

  // Thumbnail se existir
  if (item.enclosure?.url) {
    embed.setThumbnail(item.enclosure.url);
  }

  await channel.send({ embeds: [embed] });

  // Atualiza lastHash para este item (enviado)
  record.lastHash = hash;
  await record.save();

  // Log (Discord + dashboard via logger centralizado)
  await logger(
    client,
    'Game News',
    null,               // user afetado (não se aplica)
    client.user,        // executor = bot
    `Sent: **${feed.name}** -> **${item.title || 'Untitled'}**`,
    channel.guild
  );

  console.log(`[GameNews] Sent: ${feed.name} -> ${item.title}`);
}

/**
 * Função principal.
 * Deve ser chamada UMA vez (normalmente no index.js após clientReady).
 */
module.exports = async function gameNewsSystem(client, config) {
  try {
    if (!config?.gameNews?.enabled) return;

    if (started) {
      console.log('[GameNews] Already started. Skipping duplicate start.');
      return;
    }
    started = true;

    const intervalMs = Number(config.gameNews.interval ?? 30 * 60 * 1000);
    const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 10_000
      ? intervalMs
      : 30 * 60 * 1000;

    console.log('[GameNews] News system started');

    setInterval(async () => {
      // Evita overlaps (um ciclo ainda está a correr)
      if (isRunning) return;
      isRunning = true;

      try {
        for (const feed of config.gameNews.sources || []) {
          try {
            // 1) Parse do RSS
            const parsed = await parser.parseURL(feed.feed);
            const items = parsed?.items || [];
            if (items.length === 0) continue;

            // 2) Canal Discord
            const channel = await client.channels.fetch(feed.channelId).catch(() => null);
            if (!channel) {
              console.warn(`[GameNews] Channel not found: ${feed.channelId} (${feed.name})`);
              continue;
            }

            // 3) DB record do feed
            const record = await getOrCreateFeedRecord(feed.name);

            // 4) Descobrir itens novos desde o lastHash
            const newItems = getNewItemsSinceLast(items, record.lastHash);

            if (newItems.length === 0) {
              // Sem novidades
              continue;
            }

            /**
             * IMPORTANTE:
             * newItems vem do mais novo para o mais antigo (porque o feed vem assim).
             * Para não spammar e manter ordem:
             * - enviamos apenas 1 por intervalo
             * - enviamos o MAIS ANTIGO entre os novos (último da lista)
             * Assim, se aparecerem 3 de uma vez, ele vai enviando 1 de cada vez a cada ciclo.
             */
            const itemToSend = newItems[newItems.length - 1];

            // 5) Enviar e atualizar
            if (!itemToSend?.title || !itemToSend?.link) {
              // Se vier malformado, ignoramos
              continue;
            }

            await sendOneNewsAndUpdate({
              client,
              feed,
              channel,
              record,
              item: itemToSend
            });

          } catch (err) {
            console.error(`[GameNews] Error processing feed ${feed?.name}:`, err?.message || err);
          }
        }
      } finally {
        isRunning = false;
      }
    }, safeInterval);

  } catch (err) {
    console.error('[GameNews] Critical error starting system:', err);
  }
};
