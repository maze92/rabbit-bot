const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');

/**
 * Envia logs para o canal de moderação/logs
 * @param {Client} client - Discord client
 * @param {string} title - Título do log
 * @param {User|null} user - Usuário afetado (pode ser null)
 * @param {User|null} executor - Quem realizou a ação (pode ser null)
 * @param {string} description - Descrição detalhada
 * @param {Guild} guild - Guilda onde enviar o log (opcional)
 */
module.exports = async function logger(client, title, user, executor, description, guild) {
  // Tenta obter a guilda do executor ou do usuário, se não for passada
  guild = guild || executor?.guild || user?.guild;
  if (!guild) return;

  const logChannelName = config.logChannelName || 'log-bot';
  const logChannel = guild.channels.cache.find(ch => ch.name === logChannelName);

  if (!logChannel) return;

  // Criar embed
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor('Blue')
    .setTimestamp();

  let desc = '';
  if (user) desc += `👤 **User:** ${user.tag}\n`;
  if (executor) desc += `🛠️ **Executor:** ${executor.tag}\n`;
  if (description) desc += description;

  embed.setDescription(desc);

  // Enviar embed para o canal de log
  logChannel.send({ embeds: [embed] }).catch(() => null);
};
