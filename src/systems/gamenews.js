 /**
 * Sistema de Game News
 * - Lê feeds RSS
 * - Envia notícias novas para canais do Discord
 * - Evita reposts usando hash guardado no MongoDB
 */

const Parser = require('rss-parser');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const GameNews = require('../database/models/GameNews');
const logger = require('./logger');

// Parser RSS com timeout de segurança
const parser = new Parser({ timeout: 15000 });

 /**
 * Gera um hash único para uma notícia
 * Usamos título + link para garantir unicidade
 */
function generateHash(item) {
  return crypto
    .createHash('sha256')
    .update(`${item.title}-${item.link}`)
    .digest('hex');
}

 /**
 * Verifica se a notícia já foi enviada
 * - Se for a primeira vez do feed → guarda hash
 * - Se o hash for igual → notícia duplicada
 * - Se for diferente → atualiza e permite envio
 */
async function isNewNews(feedName, item) {
  const hash = generateHash(item);

  let record = await GameNews.findOne({ source: feedName });

  // Primeira notícia desse feed
  if (!record) {
    await GameNews.create({
      source: feedName,
      lastHash: hash
    });
    return true;
  }

  // Notícia repetida
  if (record.lastHash === hash) return false;

  // Nova notícia encontrada
  record.lastHash = hash;
  await record.save();
  return true;
}

 /**
 * Função principal do sistema de Game News
 */
module.exports = async (client, config) => {
  // Verifica se o sistema está ativo
  if (!config.gameNews?.enabled) return;

  console.log('[GameNews] News system started');

   /**
   * Executa a cada X milissegundos (definido no config)
   */
  setInterval(async () => {
    for (const feed of config.gameNews.sources) {
      try {
        // Faz parse do RSS
        const parsed = await parser.parseURL(feed.feed);
        if (!parsed.items || parsed.items.length === 0) continue;

        // Usamos apenas a notícia mais recente
        const item = parsed.items[0];
        if (!item?.title || !item?.link) continue;

        // Verifica se já foi enviada
        const isNew = await isNewNews(feed.name, item);
        if (!isNew) {
          // Evita spam de logs em produção
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[GameNews] Duplicate news skipped: ${item.title}`);
          }
          continue;
        }

        // Busca o canal do Discord
        const channel = await client.channels
          .fetch(feed.channelId)
          .catch(() => null);

        if (!channel) continue;

        // Cria embed da notícia
        const embed = new EmbedBuilder()
          .setTitle(item.title)
          .setURL(item.link)
          .setDescription(item.contentSnippet || 'No description available')
          .setColor(0xe60012)
          .setFooter({ text: feed.name })
          .setTimestamp(new Date(item.pubDate || Date.now()));

        // Thumbnail se existir
        if (item.enclosure?.url) {
          embed.setThumbnail(item.enclosure.url);
        }

        // Envia a notícia
        await channel.send({ embeds: [embed] });

        // Log no Discord + Dashboard
        await logger(
          client,
          'Game News',
          channel.guild.members.me.user,
          channel.guild.members.me.user,
          `New news sent: **${item.title}**`,
          channel.guild
        );

        console.log(`[GameNews] Sent news: ${item.title}`);
      } catch (err) {
        console.error(
          `[GameNews] Error processing feed ${feed.name}:`,
          err.message
        );
      }
    }
  }, config.gameNews.interval);
};
