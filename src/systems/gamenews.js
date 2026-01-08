// src/systems/gamenews.js
const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");
const GameNews = require("../database/models/GameNews");
const logger = require("./logger");

const parser = new Parser();

/**
 * Normalize a URL to avoid duplicates caused by extra parameters
 * @param {string} url 
 * @returns {string} normalized URL
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.sort(); // sort URL query parameters
    return urlObj.toString();
  } catch {
    return url; // return original if it's not a valid URL
  }
}

/**
 * Checks if a news item is new
 * @param {string} feedName - Unique feed name
 * @param {string} link - News URL
 * @returns {boolean} true if the news is new
 */
async function isNewNews(feedName, link) {
  const normalizedLink = normalizeUrl(link);
  
  let record = await GameNews.findOne({ source: feedName });

  if (!record) {
    record = await GameNews.create({ source: feedName, lastLink: normalizedLink });
    return true;
  }

  if (record.lastLink === normalizedLink) {
    return false; // news already sent
  }

  record.lastLink = normalizedLink;
  await record.save();
  return true;
}

/**
 * Automatic news system
 * @param {Client} client - Discord.js client
 * @param {Object} config - Configuration from defaultConfig.js
 */
module.exports = async (client, config) => {
  if (!config.gameNews?.enabled) return;

  console.log("[GameNews] Automatic news system started.");

  setInterval(async () => {
    for (const feed of config.gameNews.sources) {
      try {
        const parsedFeed = await parser.parseURL(feed.feed);
        if (!parsedFeed.items || !parsedFeed.items.length) continue;

        const latestNews = parsedFeed.items[0];
        if (!latestNews?.link) continue;

        const isNew = await isNewNews(feed.name, latestNews.link);
        if (!isNew) continue;

        const channel = await client.channels.fetch(feed.channelId);
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

        if (latestNews.enclosure?.url) {
          embed.setThumbnail(latestNews.enclosure.url);
        }

        await channel.send({ embeds: [embed] });

        if (channel.guild) {
          logger(channel.guild, "Game News", `New news sent: **${latestNews.title}**`);
        }

        console.log(`[GameNews] Sent news for ${feed.name}: ${latestNews.title}`);

      } catch (err) {
        console.error(`[GameNews] Error processing feed ${feed.name}:`, err.message);
      }
    }
  }, config.gameNews.interval);
};
