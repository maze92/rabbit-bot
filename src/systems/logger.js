const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');

// Cache de logs para o dashboard
const logCache = [];
const MAX_CACHE = 100; // Últimos 100 logs

/**
 * Logger centralizado
 * @param {Client} client - Discord client
 * @param {string} title - Título do log
 * @param {User|null} user - Usuário afetado
 * @param {User|null} executor - Executor da ação
 * @param {string} description - Descrição adicional
 * @param {Guild} guild - Guilda (opcional)
 */
async function logger(client, title, user, executor, description, guild) {
  guild = guild || user?.guild;
  if (!guild) return;

  const logChannelName = config.logChannelName || 'log-bot';
  const logChannel = guild.channels.cache.find(ch => ch.name === logChannelName);

  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor('Blue')
    .setTimestamp();

  let desc = '';
  if (user) desc += `👤 **User:** ${user.tag}\n`;
  if (executor) desc += `🛠️ **Executor:** ${executor.tag}\n`;
  if (description) desc += description;

  embed.setDescription(desc);

  logChannel.send({ embeds: [embed] }).catch(() => null);

  // Armazena no cache para dashboard
  logCache.push({
    time: new Date(),
    title,
    user: user?.tag || null,
    executor: executor?.tag || null,
    description: description || ''
  });

  if (logCache.length > MAX_CACHE) logCache.shift();
}

module.exports = logger;
module.exports.logCache = logCache; // Exporta cache para o dashboard
