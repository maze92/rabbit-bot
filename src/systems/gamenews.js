const Parser = require('rss-parser');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const GameNews = require('../database/models/GameNews');
const logger = require('./logger');

const parser = new Parser({ timeout: 15000 });

function hashItem(item) {
  return crypto
    .createHash('sha1')
    .update(item.title + item.link)
    .digest('hex');
}

module.exports = async (client, config) => {
  if (!config.gameNews?.enabled) return;

  console.log('[GameNews] System running');

  setInterval(async () => {
    for (const feed of config.gameNews.sources) {
      try {
        const parsed = await parser.parseURL(feed.feed);
        if (!parsed.items?.length) continue;

        let record = await GameNews.findOne({ source: feed.name });
        if (!record) {
          record = await GameNews.create({
            source: feed.name,
            hashes: []
          });
        }

        const channel = await client.channels
          .fetch(feed.channelId)
          .catch(() => null);

        if (!channel) continue;

        let sent = 0;

        for (const item of parsed.items.slice(0, 3)) {
          if (!item?.title || !item?.link) continue;

          const hash = hashItem(item);
          if (record.hashes.includes(hash)) continue;

          record.hashes.push(hash);
          sent++;

          const embed = new EmbedBuilder()
            .setTitle(item.title)
            .setURL(item.link)
            .setDescription(item.contentSnippet || 'No description available')
            .setColor(0xe60012)
            .setFooter({ text: feed.name })
            .setTimestamp(new Date(item.pubDate || Date.now()));

          if (item.enclosure?.url) {
            embed.setThumbnail(item.enclosure.url);
          }

          await channel.send({ embeds: [embed] });
        }

        if (sent > 0) {
          await record.save();

          await logger(
            client,
            'Game News',
            channel.guild.members.me.user,
            channel.guild.members.me.user,
            `Sent ${sent} new articles from ${feed.name}`,
            channel.guild
          );
        }

      } catch (err) {
        console.error(`[GameNews] ${feed.name}:`, err.message);
      }
    }
  }, config.gameNews.interval);
};
