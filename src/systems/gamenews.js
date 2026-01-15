/**
 * src/systems/gamenews.js
 * ============================================================
 * Sistema de Game News (RSS)
 *
 * Faz:
 * - Lê feeds RSS configurados no defaultConfig.js
 * - Envia notícias para canais do Discord
 * - Evita reposts guardando o último hash por feed no MongoDB
 *
 * Proteções importantes:
 * - Impede arrancar 2x (evita 2 setIntervals e notícias duplicadas)
 * - Corre 1 vez imediatamente ao iniciar + depois corre no intervalo
 * - Envia mais do que 1 notícia por ciclo (configurável)
 * ============================================================
 */

const Parser = require('rss-parser');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const GameNews = require('../database/models/GameNews');
const logger = require('./logger');

// Parser RSS com timeout de segurança
const parser = new Parser({ timeout: 15000 });

// ------------------------------------------------------------
// Proteção contra arranque duplicado
// (muito comum acontecer quando o bot chama gameNews no ready.js e no index.js)
// ------------------------------------------------------------
let started = false;
let intervalId = null;

/**
 * Gera um hash único para cada notícia
 * (título + link costuma ser suficiente para RSS)
 * @param {Object} item - Item do feed RSS
 * @returns {string}
 */
function generateHash(item) {
  return crypto
    .createHash('sha256')
    .update(`${item.title || ''}-${item.link || ''}`)
    .digest('hex');
}

/**
 * Obtém o último hash guardado no MongoDB para um feed
 * @param {string} feedName
 * @returns {Promise<string|null>}
 */
async function getLastHash(feedName) {
  const record = await GameNews.findOne({ source: feedName }).lean();
  return record?.lastHash || null;
}

/**
 * Atualiza (ou cria) o último hash guardado no MongoDB para um feed
 * @param {string} feedName
 * @param {string} lastHash
 */
async function setLastHash(feedName, lastHash) {
  await GameNews.updateOne(
    { source: feedName },
    { $set: { lastHash } },
    { upsert: true }
  );
}

/**
 * Cria o embed da notícia
 * @param {Object} feed - config.gameNews.sources[x]
 * @param {Object} item - item RSS
 * @returns {EmbedBuilder}
 */
function buildNewsEmbed(feed, item) {
  const embed = new EmbedBuilder()
    .setTitle(item.title || 'Untitled')
    .setURL(item.link)
    .setDescription(item.contentSnippet || 'No description available')
    .setColor(0xe60012)
    .setFooter({ text: feed.name })
    .setTimestamp(new Date(item.pubDate || Date.now()));

  if (item.enclosure?.url) embed.setThumbnail(item.enclosure.url);

  return embed;
}

/**
 * Processa 1 feed:
 * - lê RSS
 * - identifica itens novos (até N)
 * - envia para o canal
 * - atualiza lastHash com o item mais recente que foi enviado
 *
 * @param {Client} client
 * @param {Object} feed
 * @param {Object} config
 */
async function processFeed(client, feed, config) {
  // Lê o feed RSS
  const parsed = await parser.parseURL(feed.feed);
  if (!parsed?.items?.length) return;

  // Alguns RSS vêm por ordem do mais recente para o mais antigo
  // Vamos assumir isso e processar em ordem (do mais antigo para o mais recente)
  // para enviar "em sequência" no canal.
  const items = parsed.items.filter(i => i?.title && i?.link);

  if (!items.length) return;

  const channel = await client.channels.fetch(feed.channelId).catch(() => null);
  if (!channel) {
    console.warn(`[GameNews] Channel not found: ${feed.channelId} (${feed.name})`);
    return;
  }

  // Quantas notícias no máximo enviar por ciclo (para evitar flood)
  const maxPerCycle = config.gameNews?.maxPerCycle ?? 3;

  // Vai buscar o último hash conhecido
  const lastHash = await getLastHash(feed.name);

  // Vamos percorrer do fim para o início para apanhar as mais recentes,
  // mas enviar na ordem correta no Discord (antigas -> novas).
  // 1) Encontrar novas até maxPerCycle
  const newItems = [];
  for (const item of items) {
    const hash = generateHash(item);

    // Se encontrarmos o lastHash, paramos (tudo antes disso já foi enviado)
    if (lastHash && hash === lastHash) {
      // a partir daqui (itens mais antigos) já foram enviados
      // como items pode vir ordenado, não necessariamente precisamos de break,
      // mas para feeds típicos isto ajuda.
      continue;
    }

    newItems.push({ item, hash });
  }

  // Se não houver lastHash (primeira vez), por segurança:
  // - NÃO enviar um dump do feed todo
  // - Enviar apenas o item mais recente
  if (!lastHash) {
    const mostRecent = items[0];
    const mostRecentHash = generateHash(mostRecent);

    const embed = buildNewsEmbed(feed, mostRecent);
    await channel.send({ embeds: [embed] });

    await logger(
      client,
      'Game News',
      channel.guild.members.me.user,
      channel.guild.members.me.user,
      `New news sent: **${mostRecent.title}**`,
      channel.guild
    );

    await setLastHash(feed.name, mostRecentHash);
    console.log(`[GameNews] First run -> sent latest: ${mostRecent.title}`);
    return;
  }

  // Filtrar apenas os mais recentes e limitar
  // Nota: items[0] normalmente é o mais recente; mas o nosso newItems pode vir grande.
  // Vamos cortar e enviar os últimos N em ordem correta.
  const limited = newItems.slice(0, maxPerCycle);

  if (!limited.length) {
    // Evitar spam de logs em produção
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[GameNews] No new items for ${feed.name}`);
    }
    return;
  }

  // Enviar do mais antigo para o mais recente (ordem natural)
  // Se parsed.items estiver ao contrário, ainda assim isto mantém consistência.
  const toSend = limited.slice().reverse();

  let newestHashSent = null;

  for (const { item, hash } of toSend) {
    const embed = buildNewsEmbed(feed, item);
    await channel.send({ embeds: [embed] });

    await logger(
      client,
      'Game News',
      channel.guild.members.me.user,
      channel.guild.members.me.user,
      `New news sent: **${item.title}**`,
      channel.guild
    );

    newestHashSent = hash;
    console.log(`[GameNews] Sent: ${feed.name} -> ${item.title}`);
  }

  // Atualiza lastHash com o item mais recente que foi enviado neste ciclo
  if (newestHashSent) {
    await setLastHash(feed.name, newestHashSent);
  }
}

/**
 * Função principal do sistema de Game News
 * @param {Client} client
 * @param {Object} config
 */
module.exports = async (client, config) => {
  if (!config.gameNews?.enabled) return;

  // ------------------------------------------------------------
  // Proteção: impedir arrancar 2x
  // ------------------------------------------------------------
  if (started) {
    console.warn('[GameNews] Start ignored (already started)');
    return;
  }
  started = true;

  console.log('[GameNews] News system started');

  // ------------------------------------------------------------
  // Função que corre 1 "ciclo" completo (todos os feeds)
  // ------------------------------------------------------------
  const runCycle = async () => {
    for (const feed of config.gameNews.sources || []) {
      try {
        await processFeed(client, feed, config);
      } catch (err) {
        // Alguns feeds falham ocasionalmente por bloqueios/limites
        console.error(`[GameNews] Error processing feed ${feed.name}:`, err?.message || err);
      }
    }
  };

  // 1) Corre imediatamente no arranque (para não esperar 30 minutos)
  await runCycle();

  // 2) Agenda o intervalo (guardamos o ID para debugging futuro)
  const intervalMs = config.gameNews.interval ?? 30 * 60 * 1000;

  intervalId = setInterval(() => {
    runCycle().catch(err => {
      console.error('[GameNews] Cycle error:', err?.message || err);
    });
  }, intervalMs);
};
