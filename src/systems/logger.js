const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');

/**
 * Logger centralizado
 * @param {Client} client
 * @param {string} title - Título do log
 * @param {User|null} user - Usuário afetado
 * @param {User|null} executor - Quem realizou a ação
 * @param {string} description - Descrição adicional
 * @param {Guild|null} guild - Guilda onde será enviado (opcional)
 */
module.exports = async function logger(
  client,
  title,
  user,
  executor,
  description,
  guild
) {
  guild = guild || user?.guild;
  if (!guild) return;

  const logChannelName = config.logChannelName || 'log-bot';
  const logChannel = guild.channels.cache.find(ch => ch.name === logChannelName);
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

  logChannel.send({ embeds: [embed] }).catch(() => null);
};
