const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');

/**
 * Logger centralizado para ações do bot
 * @param {Client} client - Discord client
 * @param {string} title - Título do log (ex: "Automatic Warn")
 * @param {User|null} user - Usuário afetado
 * @param {User|null} executor - Quem executou a ação
 * @param {string} description - Descrição adicional
 * @param {Guild} guild - Guild onde o log será enviado
 */
module.exports = async function logger(client, title, user, executor, description, guild) {
  if (!guild) return;

  const logChannelName = config.logChannelName || 'log-bot';
  const logChannel = guild.channels.cache.find(ch => ch.name === logChannelName);

  if (!logChannel) return;

  // Escolher cor de embed conforme tipo
  let color = 'Blue';
  if (title.toLowerCase().includes('warn')) color = 0xFFA500; // laranja para warn
  else if (title.toLowerCase().includes('mute')) color = 0xFF0000; // vermelho para mute
  else if (title.toLowerCase().includes('clear')) color = 0x00FFFF; // azul claro
  else if (title.toLowerCase().includes('purge')) color = 0xFF00FF; // roxo

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp();

  let desc = '';

  if (user) desc += `👤 **User:** ${user.tag}\n`;
  if (executor) desc += `🛠️ **Executor:** ${executor.tag}\n`;
  if (description) desc += `📄 **Details:** ${description}`;

  embed.setDescription(desc);

  // Adicionar avatar do usuário como thumbnail, se disponível
  if (user) {
    embed.setThumbnail(user.displayAvatarURL({ dynamic: true, size: 64 }));
  }

  await logChannel.send({ embeds: [embed] }).catch(() => null);
};
