// src/systems/gamenews.js
const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");
const GameNews = require("../database/models/GameNews");
const logger = require("./logger");

const parser = new Parser();

/**
 * Normaliza URLs para evitar duplicações causadas por parâmetros extras
 * @param {string} url
 * @returns {string} URL normalizada
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    urlObj.search = params.toString();
    return urlObj.toString();
  } catch {
    return url; // retorna original se não for URL válida
  }
}

/**
 * Verifica se uma notícia já foi enviada
 * @param {string} feedName
 * @param {string} link
 * @returns {Promise<boolean>} true se for nova
 */
async function isNewNews(feedName, link) {
  const normalizedLink = normalizeUrl(link);

  let record = await GameNews.findOne({ source: feedName });

  if (!record) {
    await GameNews.create({ source: feedName, lastLink: normalizedLink });
    return true;
  }

  if (record.lastLink === normalizedLink) return false;

  record.lastLink = normalizedLink;
  await record.save();
  return true;
}

/**
 * Sistema automático de notícias
 * @param {Client} client
 * @param {Object} config
 */
module.exports = async (client, config) => {
  if (!config.gameNews?.enabled) return;

  console.log("[GameNews] Automatic news system started.");

  setInterval(async () => {
    for (const feed of config.gameNews.sources) {
      try {
        const parsedFeed = await parser.parseURL(feed.feed);
        const latestNews = parsedFeed.items?.[0];
        if (!latestNews?.link) continue;

        const isNew = await isNewNews(feed.name, latestNews.link);
        if (!isNew) continue;

        const channel = await client.channels.fetch(feed.channelId).catch(() => null);
        if (!channel) {
          console.warn(`[GameNews] Channel not found: ${feed.channelId}`);
          continue;
        }

        const embed = new EmbedBuilder()
          .setTitle(latestNews.title)
          .setURL(latestNews.link)
          .setDescription(latestNews.contentSnippet || "No description available")
          .setColor(0xe60012)
          .setFooter({ text: feed.name })
          .setTimestamp(new Date(latestNews.pubDate));

        if (latestNews.enclosure?.url) embed.setThumbnail(latestNews.enclosure.url);

        await channel.send({ embeds: [embed] });

        // Log centralizado
        if (channel.guild) {
          await logger(
            client,
            "Game News",
            channel.guild.me.user,
            channel.guild.me.user,
            `New news sent: **${latestNews.title}**`
          );
        }

        console.log(`[GameNews] Sent news for ${feed.name}: ${latestNews.title}`);
      } catch (err) {
        console.error(`[GameNews] Error processing feed ${feed.name}:`, err.message);
      }
    }
  }, config.gameNews.interval);
};

