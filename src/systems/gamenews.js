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
 *
 * Melhorias nesta versão:
 * - Run imediato no arranque (não espera pelo primeiro intervalo)
 * - Sanitiza + limita descrição (evita embeds gigantes / HTML feio)
 * - Normaliza links
 * - Logs de erro mais claros (inclui URL do feed)
 * ============================================================
 */

const Parser = require('rss-parser');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');

const GameNews = require('../database/models/GameNews'); // ✅ (confirmado por ti)
const logger = require('./logger');

// Parser RSS com timeout
const parser = new Parser({ timeout: 15000 }); // 15s timeout

let started = false;   // evita iniciar 2x
let isRunning = false; // evita overlap entre ciclos

/**
 * Remove HTML simples e limita tamanho de texto para embeds.
 * @param {string} input
 * @param {number} maxLen
 */
function sanitizeText(input, maxLen = 350) {
  const raw = String(input || '')
    // remove tags HTML comuns
    .replace(/<\/?[^>]+(>|$)/g, '')
    // normaliza espaços
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) return 'No description available.';

  // Limite para ficar “limpo” no embed
  if (raw.length > maxLen) return raw.slice(0, maxLen - 3) + '...';
  return raw;
}

/**
 * Normaliza link (garante http/https quando possível).
 * @param {string} link
 */
function normalizeLink(link) {
  if (!link) return null;
  const s = String(link).trim();
  if (!s) return null;

  if (s.startsWith('http://') || s.startsWith('https://')) return s;

  // alguns feeds dão //domain/path
  if (s.startsWith('//')) return `https:${s}`;

  // se vier só domain/path, tentamos https
  if (s.includes('.') && !s.startsWith('mailto:')) return `https://${s}`;

  return null;
}

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

  const title = sanitizeText(item.title || 'New article', 240);
  const url = normalizeLink(item.link);

  // Escolhe descrição: snippet > content > fallback
  const description = sanitizeText(item.contentSnippet || item.content || 'No description available.', 350);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0xe60012)
    .setFooter({ text: feed.name })
    .setTimestamp(getItemDate(item))
    .setDescription(description);

  // Só mete URL se for válida
  if (url) embed.setURL(url);

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
    `Sent: **${feed.name}** -> **${title}**`,
    channel.guild
  );

  console.log(`[GameNews] Sent: ${feed.name} -> ${title}`);
}

/**
 * Um ciclo completo:
 * - percorre todos os feeds
 * - manda 1 notícia por feed se houver novidades
 */
async function runCycle(client, config) {
  for (const feed of config.gameNews.sources || []) {
    try {
      if (!feed?.feed || !feed?.channelId || !feed?.name) continue;

      // 1) Parse do RSS
      let parsed;
      try {
        parsed = await parser.parseURL(feed.feed);
      } catch (err) {
        console.error(`[GameNews] RSS parse error (${feed.name}) URL=${feed.feed}:`, err?.message || err);
        continue;
      }

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
       */
      const itemToSend = newItems[newItems.length - 1];

      // Proteção: item inválido
      if (!itemToSend?.title && !itemToSend?.link) continue;

      // 5) Enviar e atualizar
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
    const safeInterval =
      Number.isFinite(intervalMs) && intervalMs >= 10_000
        ? intervalMs
        : 30 * 60 * 1000;

    console.log('[GameNews] News system started');

    // ------------------------------
    // Run imediato no arranque
    // ------------------------------
    if (!isRunning) {
      isRunning = true;
      runCycle(client, config)
        .catch((err) => console.error('[GameNews] Startup cycle error:', err?.message || err))
        .finally(() => { isRunning = false; });
    }

    // ------------------------------
    // Loop de verificação periódica
    // ------------------------------
    setInterval(async () => {
      if (isRunning) return;
      isRunning = true;

      try {
        await runCycle(client, config);
      } finally {
        isRunning = false;
      }
    }, safeInterval);

  } catch (err) {
    console.error('[GameNews] Critical error starting system:', err);
  }
};
