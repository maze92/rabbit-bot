const { EmbedBuilder } = require('discord.js');

/**
 * Sends a log message to the moderation channel
 * @param {Guild} guild - Discord guild
 * @param {string} title - Log title
 * @param {string} description - Log description
 */
module.exports = async function log(guild, title, description) {
  const logChannel = guild.channels.cache.find(ch => ch.name === 'log-bot');
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor('Blue')
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
};
