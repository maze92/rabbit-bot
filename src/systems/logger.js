const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');

/**
 * Logger centralizado do bot
 * @param {Client} client - Instância do Discord
 * @param {string} title - Título do log
 * @param {User} user - Usuário afetado (pode ser null)
 * @param {User} executor - Executor da ação (pode ser null)
 * @param {string} description - Descrição adicional
 * @param {Guild} guild - Guilda onde o log será enviado (opcional)
 */
module.exports = async function logger(client, title, user, executor, description, guild) {
  // Tenta definir a guilda correta
  if (!guild) {
    if (user?.guild) guild = user.guild;
    else if (executor?.guild) guild = executor.guild;
  }
  if (!guild) return; // sem guilda, não loga

  const logChannelName = config.logChannelName || 'log-bot';
  const logChannel = guild.channels.cache.find(ch => ch.name === logChannelName);

  if (!logChannel) return; // sem canal, ignora

  // Cria embed
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor('Blue')
    .setTimestamp();

  let desc = '';
  if (user) desc += `👤 **User:** ${user.tag}\n`;
  if (executor) desc += `🛠️ **Executor:** ${executor.tag}\n`;
  if (description) desc += `${description}\n`;

  embed.setDescription(desc);

  // Envia no canal
  await logChannel.send({ embeds: [embed] }).catch(() => null);
};
