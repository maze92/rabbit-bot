const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');
const { io } = require('../dashboard'); // Socket.IO do dashboard

// Cache de logs em memória (últimos 200 logs)
const logCache = [];

/**
 * Logger centralizado
 * @param {Client} client - Cliente Discord
 * @param {string} title - Título do log (ex: "Clear Messages", "Automatic Warn")
 * @param {User|null} user - Usuário afetado
 * @param {User|null} executor - Quem executou a ação
 * @param {string} description - Descrição detalhada
 * @param {Guild|null} guild - Guild onde será enviado o log
 */
async function logger(client, title, user, executor, description, guild) {
  guild = guild || user?.guild;
  if (!guild) return;

  const logChannelName = config.logChannelName || 'log-bot';
  const logChannel = guild.channels.cache.find(ch => ch.name === logChannelName);

  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(getColor(title))
    .setDescription(description)
    .setTimestamp();

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Logger] Failed to send log to channel:', err.message);
  }

  // Adiciona ao cache local
  const logItem = {
    time: Date.now(),
    title,
    user: user?.tag || null,
    executor: executor?.tag || null,
    description
  };
  logCache.push(logItem);

  // Mantém apenas os últimos 200 logs
  if (logCache.length > 200) logCache.shift();

  // Envia via Socket.IO para o dashboard
  if (io) io.emit('logs', logCache);
}

/**
 * Retorna cor do embed com base no tipo de log
 * @param {string} title 
 * @returns {number} Cor hexadecimal
 */
function getColor(title) {
  title = title.toLowerCase();
  if (title.includes('warn')) return 0xffcc00;     // Amarelo para avisos
  if (title.includes('mute')) return 0xff6600;     // Laranja para mutes
  if (title.includes('clear') || title.includes('purge')) return 0x00ccff; // Azul para deletes
  if (title.includes('game news')) return 0xe60012; // Vermelho para notícias
  return 0x00ff00; // Verde para outros
}

module.exports = logger;
module.exports.logCache = logCache;

