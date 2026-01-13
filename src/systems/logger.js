const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');

/**
 * Sends a log message to the moderation channel
 * @param {Client} client
 * @param {string} title
 * @param {User|null} user
 * @param {User|null} executor
 * @param {string} description
 * @param {Guild} guild
 */
module.exports = async function logger(
  client,
  title,
  user,
  executor,
  description,
  guild
) {
  if (!guild) return;

  const logChannelName = config.logChannelName || 'log-bot';
  const logChannel = guild.channels.cache.find(
    ch => ch.name === logChannelName
  );
  if (!logChannel) return;

  let desc = '';
  if (user) desc += `👤 **User:** ${user.tag}\n`;
  if (executor) desc += `🛠️ **Executor:** ${executor.tag}\n`;
  if (description) desc += `${description}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor('Blue')
    .setDescription(desc)
    .setTimestamp();

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[logger] Failed to send log:', err);
  }
};
