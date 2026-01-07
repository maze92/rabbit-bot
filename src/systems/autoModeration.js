const { EmbedBuilder } = require('discord.js');
const User = require('../database/models/User');
const config = require('../config/defaultConfig');

// Configurações de segurança
const bannedWords = [...(config.bannedWords?.pt || []), ...(config.bannedWords?.en || [])];
const maxWarnings = config.maxWarnings || 3;
const muteDuration = config.muteDuration || 10 * 60 * 1000; // 10 minutos
const logChannelName = config.logChannelName || 'log-bot';

module.exports = async function autoModeration(message) {
  // ==============================
  // Proteções base
  // ==============================
  if (!message || !message.content) return;
  if (message.author?.bot) return;
  if (!message.guild) return;

  // Evita múltiplos avisos na mesma mensagem
  if (message._automodHandled) return;
  message._automodHandled = true;

  // ==============================
  // Limpar conteúdo
  // ==============================
  const cleanContent = message.content
    .replace(/https?:\/\/\S+/gi, '')               // links
    .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')       // emojis custom
    .toLowerCase();

  // ==============================
  // Verificar palavras proibidas
  // ==============================
  const foundWord = bannedWords.find(word => cleanContent.includes(word.toLowerCase()));
  if (!foundWord) return;

  // ==============================
  // Apagar mensagem ofensiva
  // ==============================
  await message.delete().catch(() => null);

  // ==============================
  // DB: obter ou criar utilizador
  // ==============================
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

  // ==============================
  // Incrementar warn
  // ==============================
  user.warnings += 1;
  await user.save();

  // ==============================
  // Aviso ao utilizador
  // ==============================
  await message.channel.send({
    content: `⚠️ ${message.author}, inappropriate language is not allowed.\n**Warning:** ${user.warnings}/${maxWarnings}`
  }).catch(() => null);

  // ==============================
  // Log para canal de moderação
  // ==============================
  const logChannel = message.guild.channels.cache.find(ch => ch.name === logChannelName);
  if (logChannel) {
    logChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚠️ Automatic Warn')
          .setColor('Red')
          .setDescription(
            `👤 **User:** ${message.author.tag}\n` +
            `📄 **Word:** ${foundWord}\n` +
            `📊 **Warnings:** ${user.warnings}/${maxWarnings}`
          )
          .setTimestamp()
      ]
    }).catch(() => null);
  }

  // ==============================
  // Aplicar Mute se excedeu warns
  // ==============================
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

        if (logChannel) {
          logChannel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle('🔇 Automatic Mute')
                .setColor('Orange')
                .setDescription(
                  `👤 **User:** ${message.author.tag}\n⏳ **Duration:** ${muteDuration / 60000} minutes`
                )
                .setTimestamp()
            ]
          }).catch(() => null);
        }

        // Reset warns após mute
        user.warnings = 0;
        await user.save();
      } catch {
        // silêncio intencional
      }
    }
  }
};

