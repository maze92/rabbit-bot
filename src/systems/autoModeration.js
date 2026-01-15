// src/systems/autoModeration.js
const { PermissionsBitField } = require('discord.js');

const User = require('../database/models/User');
const config = require('../config/defaultConfig');
const logger = require('./logger');
const infractionsService = require('./infractionsService');

/**
 * Sistema de AutoModeração
 * - Deteta palavras proibidas
 * - Tenta apagar a mensagem (se o bot tiver ManageMessages)
 * - Regista WARN no MongoDB (User + Infraction)
 * - Se atingir limite, aplica timeout e regista MUTE no MongoDB
 */
module.exports = async function autoModeration(message, client) {
  try {
    // ------------------------------
    // Validações básicas
    // ------------------------------
    if (!message?.guild) return;
    if (!message?.content) return;
    if (message.author?.bot) return;

    // Evitar processar a mesma mensagem mais de uma vez
    if (message._autoModHandled) return;
    message._autoModHandled = true;

    const guild = message.guild;
    const member = message.member; // pode existir (normalmente existe)
    const botMember = guild.members.me;
    if (!botMember) return;

    // ------------------------------
    // Configurações
    // ------------------------------
    const bannedWords = [
      ...(config.bannedWords?.pt || []),
      ...(config.bannedWords?.en || [])
    ];

    const maxWarnings = config.maxWarnings ?? 3;
    const muteDuration = config.muteDuration ?? 10 * 60 * 1000;

    // ------------------------------
    // (Opcional) Bypass admins
    // Se quiseres moderar admins também, remove este bloco.
    // ------------------------------
    if (
      member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    ) {
      return;
    }

    // ------------------------------
    // Limpeza / normalização do conteúdo
    // ------------------------------
    const cleanContent = message.content
      .replace(/https?:\/\/\S+/gi, '')                 // remove links
      .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')         // remove emojis custom
      .replace(/[^\w\s]/g, '')                         // remove pontuação
      .toLowerCase();

    // ------------------------------
    // Detetar palavra proibida (regex com leet básico)
    // ------------------------------
    const foundWord = bannedWords.find((word) => {
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
    // 1) Apagar mensagem (independe da hierarquia do user)
    // ------------------------------
    const channelPerms = message.channel.permissionsFor(botMember);
    const canDelete = channelPerms?.has(PermissionsBitField.Flags.ManageMessages);

    if (canDelete) {
      await message.delete().catch((err) => {
        console.error('[AutoMod] Failed to delete message:', err.message);
      });
    } else {
      console.warn('[AutoMod] Missing ManageMessages permission to delete messages.');
    }

    // ------------------------------
    // 2) Atualizar warnings no User (MongoDB)
    // ------------------------------
    let dbUser = await User.findOne({
      userId: message.author.id,
      guildId: guild.id
    });

    if (!dbUser) {
      dbUser = await User.create({
        userId: message.author.id,
        guildId: guild.id,
        warnings: 0,
        trust: 30
      });
    }

    dbUser.warnings += 1;
    await dbUser.save();

    // ------------------------------
    // 3) Registar infração WARN (MongoDB)
    // ------------------------------
    await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'WARN',
      reason: `AutoMod: forbidden word detected (${foundWord})`,
      duration: null
    });

    // ------------------------------
    // 4) Aviso no canal
    // ------------------------------
    await message.channel
      .send(`⚠️ ${message.author}, inappropriate language is not allowed.\n**Warning:** ${dbUser.warnings}/${maxWarnings}`)
      .catch(() => null);

    // ------------------------------
    // 5) Log (Discord + Dashboard via logger)
    // ------------------------------
    await logger(
      client,
      'Automatic Warn',
      message.author,
      client.user,
      `Word: **${foundWord}**\nWarnings: **${dbUser.warnings}/${maxWarnings}**\nDeleted: **${canDelete ? 'Yes' : 'No (missing permission)'}**`,
      guild
    );

    // ------------------------------
    // 6) Timeout automático ao atingir limite
    // - Aqui sim a hierarquia importa (moderatable)
    // ------------------------------
    if (dbUser.warnings >= maxWarnings) {
      // Se não houver member, não dá timeout
      if (!member) return;

      if (!member.moderatable) {
        await logger(
          client,
          'Automatic Mute Failed',
          message.author,
          client.user,
          `User reached **${maxWarnings}** warnings, but I cannot timeout them (role hierarchy / permissions).`,
          guild
        );
        return;
      }

      await member.timeout(muteDuration, 'Exceeded automatic warning limit').catch((err) => {
        console.error('[AutoMod] Failed to timeout member:', err.message);
      });

      // Registar infração MUTE (MongoDB)
      await infractionsService.create({
        guild,
        user: message.author,
        moderator: client.user,
        type: 'MUTE',
        reason: 'AutoMod: exceeded warning limit',
        duration: muteDuration
      });

      await message.channel
        .send(`🔇 ${message.author} has been muted for **${Math.round(muteDuration / 60000)}** minutes due to repeated infractions.`)
        .catch(() => null);

      await logger(
        client,
        'Automatic Mute',
        message.author,
        client.user,
        `Duration: **${Math.round(muteDuration / 60000)} minutes**`,
        guild
      );

      // Reset warnings após mute (como já tinhas)
      dbUser.warnings = 0;
      await dbUser.save();
    }
  } catch (err) {
    console.error('[AutoMod] Critical error:', err);
  }
};
