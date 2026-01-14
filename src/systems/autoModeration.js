const { EmbedBuilder } = require('discord.js');
const User = require('../database/models/User');
const config = require('../config/defaultConfig');
const logger = require('./logger');

// Configurações
const bannedWords = [
  ...(config.bannedWords?.pt || []),
  ...(config.bannedWords?.en || [])
];
const maxWarnings = config.maxWarnings || 3;
const muteDuration = config.muteDuration || 10 * 60 * 1000; // 10 minutos

module.exports = async function autoModeration(message, client) {
  if (!message || !message.content || message.author.bot || !message.guild) return;

  // Evita processar a mesma mensagem várias vezes
  if (message._automodHandled) return;
  message._automodHandled = true;

  // Limpar conteúdo da mensagem
  const cleanContent = message.content
    .replace(/https?:\/\/\S+/gi, '')            // remove links
    .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')   // remove emojis custom
    .replace(/[.,!?;:'"(){}[\]]/g, '')         // remove pontuação
    .toLowerCase();

  // Verifica palavras proibidas
  const foundWord = bannedWords.find(word => cleanContent.includes(word.toLowerCase()));
  if (!foundWord) return;

  // Apagar mensagem ofensiva
  await message.delete().catch(() => null);

  // DB: obter ou criar utilizador
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

  // Incrementar warn
  user.warnings += 1;
  await user.save();

  // Aviso ao usuário
  await message.channel.send({
    content: `⚠️ ${message.author}, inappropriate language is not allowed.\n**Warning:** ${user.warnings}/${maxWarnings}`
  }).catch(() => null);

  // Log centralizado via logger.js
  await logger(
    client,
    'Automatic Warn',
    message.author,
    message.author,
    `Word: ${foundWord}\nWarnings: ${user.warnings}/${maxWarnings}`,
    message.guild
  );

  // Aplicar mute se excedeu warns
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

        // Reset warnings após mute
        user.warnings = 0;
        await user.save();
      } catch (err) {
        console.error('[AutoMod] Error muting user:', err);
      }
    }
  }
};
