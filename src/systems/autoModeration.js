const { EmbedBuilder } = require('discord.js');
const User = require('../database/models/User');
const config = require('../config/defaultConfig');
const logger = require('./logger'); // Logger centralizado

// Configurações
const bannedWords = [
  ...(config.bannedWords?.pt || []),
  ...(config.bannedWords?.en || [])
];
const maxWarnings = config.maxWarnings || 3;
const muteDuration = config.muteDuration || 10 * 60 * 1000; // 10 minutos

/**
 * Função principal de moderação automática
 * @param {Message} message - Mensagem recebida
 * @param {Client} client - Cliente do Discord
 */
module.exports = async function autoModeration(message, client) {
  if (!message || !message.content || message.author.bot || !message.guild) return;

  // Evita processar a mesma mensagem várias vezes
  if (message._automodHandled) return;
  message._automodHandled = true;

  // Limpa a mensagem (remove links, emojis customizados e pontuação)
  const cleanContent = message.content
    .replace(/https?:\/\/\S+/gi, '')            // remove links
    .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')   // remove emojis custom
    .replace(/[.,!?;:'"(){}[\]]/g, '')         // remove pontuação
    .toLowerCase();

  // Verifica se existe palavra proibida
  const foundWord = bannedWords.find(word => cleanContent.includes(word.toLowerCase()));
  if (!foundWord) return;

  // Apaga mensagem ofensiva
  await message.delete().catch(() => null);

  // DB: obtém ou cria o registro do usuário
  let user = await User.findOne({
    userId: message.author.id,
    guildId: message.guild.id
  });

  if (!user) {
    user = await User.create({
      userId: message.author.id,
      guildId: message.guild.id,
      warnings: 0,
      trust: 30
    });
  }

  // Incrementa o número de avisos
  user.warnings += 1;
  await user.save();

  // Envia aviso ao usuário
  await message.channel.send({
    content: `⚠️ ${message.author}, inappropriate language is not allowed.\n**Warning:** ${user.warnings}/${maxWarnings}`
  }).catch(() => null);

  // Log centralizado no canal de logs
  await logger(
    client,
    'Automatic Warn',
    message.author,
    message.author,
    `Word: ${foundWord}\nWarnings: ${user.warnings}/${maxWarnings}`,
    message.guild
  );

  // Aplica mute se excedeu warnings
  if (user.warnings >= maxWarnings) {
    if (message.member?.moderatable) {
      try {
        await message.member.timeout(
          muteDuration,
          'Exceeded automatic warning limit'
        );

        await message.channel.send(
          `🔇 ${message.author} has been muted for ${muteDuration / 60000} minutes due to repeated infractions.`
        );

        await logger(
          client,
          'Automatic Mute',
          message.author,
          message.author,
          `Duration: ${muteDuration / 60000} minutes`,
          message.guild
        );

        // Reseta warnings após mute
        user.warnings = 0;
        await user.save();
      } catch (err) {
        console.error('[AutoMod] Error muting user:', err);
      }
    }
  }
};
