// src/systems/automoderation.js

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const User = require('../database/models/User');
const config = require('../config/defaultConfig');
const logger = require('./logger');
const dashboard = require('../dashboard'); // Envia logs para o dashboard em tempo real

/**
 * Sistema de AutoModeração Avançado
 * - Detecta e remove mensagens com palavras proibidas
 * - Aplica warns automáticos
 * - Muta usuário ao atingir limite
 * - Logs centralizados no Discord e dashboard
 */
module.exports = async function autoModeration(message, client) {
  try {
    // ------------------------------
    // Validações básicas
    // ------------------------------
    if (!message || !message.guild || !message.content || message.author.bot) return;

    // Evitar processar a mesma mensagem mais de uma vez
    if (message._autoModHandled) return;
    message._autoModHandled = true;

    const botMember = message.guild.members.me;
    if (!botMember) return;

    // ------------------------------
    // Admin / Hierarquia bypass
    // ------------------------------
    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      console.log('[AutoMod] Administrator bypass:', message.author.tag);
      return;
    }

    if (message.member.roles.highest.position >= botMember.roles.highest.position) {
      console.warn(`[AutoMod] Cannot moderate ${message.author.tag} (higher role)`);
      return;
    }

    // ------------------------------
    // Verifica permissões do bot
    // ------------------------------
    const permissions = message.channel.permissionsFor(botMember);
    if (!permissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      console.error('[AutoMod] Missing Manage Messages permission');
      return;
    }

    // ------------------------------
    // Configurações do AutoMod
    // ------------------------------
    const bannedWords = [
      ...(config.bannedWords?.pt || []),
      ...(config.bannedWords?.en || [])
    ];
    const maxWarnings = config.maxWarnings || 3;
    const muteDuration = config.muteDuration || 10 * 60 * 1000; // 10 minutos

    // ------------------------------
    // Limpeza e normalização da mensagem
    // - Remove links, emojis custom, pontuação
    // - Converte para lowercase
    // ------------------------------
    let cleanContent = message.content
      .replace(/https?:\/\/\S+/gi, '') // Remove links
      .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '') // Remove emojis custom
      .replace(/[^\w\s]/g, '') // Remove pontuação
      .toLowerCase();

    // ------------------------------
    // Detecta palavras proibidas usando regex
    // - Suporta variações simples de caracteres (leet speak)
    // ------------------------------
    const foundWord = bannedWords.find(word => {
      const pattern = word
        .replace(/a/gi, '[a4@]')
        .replace(/e/gi, '[e3]')
        .replace(/i/gi, '[i1!]')
        .replace(/o/gi, '[o0]')
        .replace(/u/gi, '[uü]')
        .replace(/s/gi, '[s5$]');
      const regex = new RegExp(`\\b${pattern}\\b`, 'i');
      return regex.test(cleanContent);
    });

    if (!foundWord) return;

    // ------------------------------
    // Apagar mensagem ofensiva
    // ------------------------------
    await message.delete().catch(err => {
      console.error('[AutoMod] Failed to delete message:', err.message);
    });

    // ------------------------------
    // Registro no banco de dados
    // ------------------------------
    let user = await User.findOne({ userId: message.author.id, guildId: message.guild.id });
    if (!user) {
      user = await User.create({ userId: message.author.id, guildId: message.guild.id, warnings: 0, trust: 30 });
    }

    user.warnings += 1;
    await user.save();

    // ------------------------------
    // Aviso ao usuário no canal
    // ------------------------------
    await message.channel.send({
      content: `⚠️ ${message.author}, inappropriate language is not allowed.\n**Warning:** ${user.warnings}/${maxWarnings}`
    }).catch(() => null);

    // ------------------------------
    // Log centralizado no Discord e Dashboard
    // ------------------------------
    const logData = {
      title: 'Automatic Warn',
      user: message.author.tag,
      executor: client.user.tag,
      description: `Word detected: **${foundWord}**\nWarnings: ${user.warnings}/${maxWarnings}`,
      time: new Date()
    };

    await logger(client, logData.title, message.author, client.user, logData.description, message.guild);
    dashboard.sendToDashboard('log', logData);

    // ------------------------------
    // Timeout automático ao atingir limite
    // ------------------------------
    if (user.warnings >= maxWarnings) {
      if (!message.member.moderatable) {
        console.warn('[AutoMod] Member not moderatable:', message.author.tag);
        return;
      }

      await message.member.timeout(muteDuration, 'Exceeded automatic warning limit');

      await message.channel.send(
        `🔇 ${message.author} has been muted for ${muteDuration / 60000} minutes due to repeated infractions.`
      ).catch(() => null);

      const muteLogData = {
        title: 'Automatic Mute',
        user: message.author.tag,
        executor: client.user.tag,
        description: `Duration: ${muteDuration / 60000} minutes`,
        time: new Date()
      };

      await logger(client, muteLogData.title, message.author, client.user, muteLogData.description, message.guild);
      dashboard.sendToDashboard('log', muteLogData);

      // Reset warnings após mute
      user.warnings = 0;
      await user.save();
    }

  } catch (err) {
    console.error('[AutoMod] Critical error:', err);
  }
};
