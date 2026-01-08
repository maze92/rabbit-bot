const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");
const GameNews = require("../database/models/GameNews");
const logger = require("./logger");

const parser = new Parser();

/**
 * Verifica se a notícia é nova
 * @param {string} source - Nome do feed
 * @param {string} link - Link da notícia
 * @returns {boolean} true se for nova
 */
async function isNewNews(source, link) {
  const record = await GameNews.findOne({ source });

  if (!record) {
    await GameNews.create({ source, lastLink: link });
    return true;
  }

  if (record.lastLink === link) return false;

  record.lastLink = link;
  await record.save();
  return true;
}

/**
 * Sistema de notícias automáticas
 * @param {Client} client - Discord.js client
 * @param {Object} config - Configurações do defaultConfig.js
 */
module.exports = async (client, config) => {
  if (!config.gameNews?.enabled) return;

  // Rodar a cada intervalo definido
  setInterval(async () => {
    for (const feed of config.gameNews.sources) {
      try {
        const parsedFeed = await parser.parseURL(feed.feed);
        if (!parsedFeed.items.length) continue;

        const latestNews = parsedFeed.items[0];
        if (!latestNews || !latestNews.link) continue;

        const isNew = await isNewNews(feed.name, latestNews.link);
        if (!isNew) continue;

        const channel = await client.channels.fetch(feed.channelId);
        if (!channel) continue;

        // Criar embed da notícia
        const embed = new EmbedBuilder()
          .setTitle(latestNews.title)
          .setURL(latestNews.link)
          .setDescription(latestNews.contentSnippet || "Nova notícia disponível")
          .setColor(0xe60012)
          .setFooter({ text: "IGN - PC Games" })
          .setTimestamp(new Date(latestNews.pubDate));

        if (latestNews.enclosure?.url) {
          embed.setThumbnail(latestNews.enclosure.url);
        }

        // Enviar embed para o Discord
        await channel.send({ embeds: [embed] });

        // Log usando logger.js
        if (channel.guild) {
          logger(channel.guild, "Game News", `Nova notícia enviada: **${latestNews.title}**`);
        }

      } catch (err) {
        console.error(`[GameNews] (${feed.name})`, err.message);
      }
    }
  }, config.gameNews.interval);
};
