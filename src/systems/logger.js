// src/logger.js
const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');
const dashboard = require('../dashboard');

/**
 * Logger centralizado
 * - Envia logs para o canal de logs no Discord
 * - Envia logs em tempo real para o dashboard
 *
 * @param {Client} client - Instância do Discord Client
 * @param {string} title - Título do log (ex: "Automatic Warn", "Game News")
 * @param {User|null} user - Usuário afetado pela ação (pode ser null)
 * @param {User|null} executor - Usuário que executou a ação (pode ser null)
 * @param {string} description - Descrição detalhada do log
 * @param {Guild|null} guild - Guilda onde ocorreu a ação (opcional)
 */
module.exports = async function logger(
  client,
  title,
  user,
  executor,
  description,
  guild
) {
  try {
    // Se guild não for passada, tenta pegar do usuário afetado
    guild = guild || user?.guild;
    if (!guild) return; // Se não houver guilda, não há onde enviar log

    // Nome do canal de logs
    const logChannelName = config.logChannelName || 'log-bot';

    // Procura o canal no cache da guilda
    const logChannel = guild.channels.cache.find(
      ch => ch.name === logChannelName
    );

    // Monta a descrição do embed
    let desc = '';
    if (user) desc += `👤 **User:** ${user.tag}\n`;
    if (executor) desc += `🛠️ **Executor:** ${executor.tag}\n`;
    if (description) desc += `${description}`;

    // Cria embed do Discord
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor('Blue')
      .setDescription(desc)
      .setTimestamp();

    // Envia para o canal de logs no Discord
    if (logChannel) {
      await logChannel.send({ embeds: [embed] }).catch(() => null);
    }

    // Envia para o dashboard em tempo real
    dashboard.sendToDashboard('log', {
      title,
      user: user ? { id: user.id, tag: user.tag } : null,
      executor: executor ? { id: executor.id, tag: executor.tag } : null,
      description,
      guild: { id: guild.id, name: guild.name }
    });

  } catch (err) {
    console.error('[Logger] Error:', err);
  }
};
