const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');

/**
 * Sends a log message to the moderation channel
 * @param {Client} client - Discord client
 * @param {string} title - Log title
 * @param {User} user - Usuário afetado
 * @param {User} executor - Quem realizou a ação (pode ser o mesmo do user)
 * @param {string} description - Descrição adicional
 */
module.exports = async function logger(client, title, user, executor, description) {
  if (!user?.guild) return;

  const guild = user.guild;
  const logChannelName = config.logChannelName || 'log-bot';
  const logChannel = guild.channels.cache.find(ch => ch.name === logChannelName);

  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor('Blue')
    .setDescription(
      `👤 **User:** ${user.tag}\n` +
      `🛠️ **Executor:** ${executor?.tag || 'N/A'}\n` +
      `${description}`
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] }).catch(() => null);
};
