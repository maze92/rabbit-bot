const Parser = require('rss-parser');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const GameNews = require('../database/models/GameNews');
const logger = require('./logger');

const parser = new Parser({ timeout: 15000 });

function generateHash(item) {
  return crypto
    .createHash('sha256')
    .update(`${item.title}-${item.link}`)
    .digest('hex');
}

async function isNewNews(feedName, item) {
  const hash = generateHash(item);
  let record = await GameNews.findOne({ source: feedName });

  if (!record) {
    await GameNews.create({ source: feedName, lastHash: hash });
    return true;
  }

  if (record.lastHash === hash) return false;

  record.lastHash = hash;
  await record.save();
  return true;
}

module.exports = async (client, config) => {
  if (!config.gameNews?.enabled) return;

  console.log('[GameNews] System started');

  setInterval(async () => {
    for (const feed of config.gameNews.sources) {
      try {
        const parsed = await parser.parseURL(feed.feed);
        if (!parsed.items?.length) continue;

        const item = parsed.items[0];
        if (!item?.title || !item?.link) continue;

        if (!await isNewNews(feed.name, item)) continue;

        const channel = await client.channels.fetch(feed.channelId).catch(() => null);
        if (!channel) continue;

        const embed = new EmbedBuilder()
          .setTitle(item.title)
          .setURL(item.link)
          .setDescription(item.contentSnippet || 'No description available')
          .setColor(0xe60012)
          .setFooter({ text: feed.name })
          .setTimestamp(new Date(item.pubDate || Date.now()));

        if (item.enclosure?.url) embed.setThumbnail(item.enclosure.url);

        await channel.send({ embeds: [embed] });

        // 🔴 LOG DA NEWS
        await logger(
          client,
          'Game News Posted',
          client.user,
          client.user,
          `Source: **${feed.name}**\nTitle: **${item.title}**`,
          channel.guild
        );

        console.log(`[GameNews] Sent: ${item.title}`);
      } catch (err) {
        console.error(`[GameNews ERROR - ${feed.name}]`, err.message);
      }
    }
  }, config.gameNews.interval);
};
