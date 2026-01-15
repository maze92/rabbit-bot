/**
 * Comando: !mute
 * - Aplica timeout (mute) a um utilizador
 * - Duração configurável (em minutos)
 * - Protegido por cargos de staff
 * - Regista a ação no sistema de logs
 */

const { PermissionsBitField } = require('discord.js');
const logger = require('../systems/logger');

module.exports = {
  name: 'mute',
  description: 'Mute a user for a specified time',

  // Cargos autorizados
  allowedRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  async execute(message, args, client) {
    try {
      if (!message.guild) return;

      const executor = message.member;
      const botMember = message.guild.members.me;

      if (!botMember) return;

      // ------------------------------
      // Permissão do bot
      // ------------------------------
      if (
        !botMember.permissions.has(
          PermissionsBitField.Flags.ModerateMembers
        )
      ) {
        return message.reply(
          '❌ I do not have permission to mute members.'
        );
      }

      // ------------------------------
      // Permissão do executor
      // ------------------------------
      const hasAllowedRole = executor.roles.cache.some(role =>
        this.allowedRoles.includes(role.id)
      );

      if (
        !hasAllowedRole &&
        !executor.permissions.has(
          PermissionsBitField.Flags.Administrator
        )
      ) {
        return message.reply(
          '❌ You do not have permission to use this command.'
        );
      }

      // ------------------------------
      // Utilizador alvo
      // ------------------------------
      const target = message.mentions.members.first();
      if (!target) {
        return message.reply(
          '❌ Please mention a user to mute.'
        );
      }

      if (target.user.bot) {
        return message.reply(
          '⚠️ You cannot mute bots.'
        );
      }

      if (target.id === message.author.id) {
        return message.reply(
          '⚠️ You cannot mute yourself.'
        );
      }

      // ------------------------------
      // Duração do mute
      // ------------------------------
      const durationMinutes = parseInt(args[1]) || 10; // default: 10 minutos

      if (durationMinutes < 1 || durationMinutes > 10080) {
        return message.reply(
          '❌ Duration must be between 1 minute and 7 days.'
        );
      }

      const durationMs = durationMinutes * 60 * 1000;

      // ------------------------------
      // Verifica se já está muted
      // ------------------------------
      if (target.isCommunicationDisabled()) {
        return message.reply(
          `⚠️ **${target.user.tag}** is already muted.`
        );
      }

      // ------------------------------
      // Aplica timeout
      // ------------------------------
      await target.timeout(
        durationMs,
        `Muted by ${message.author.tag}`
      );

      await message.channel.send(
        `🔇 **${target.user.tag}** has been muted for **${durationMinutes} minutes**.`
      );

      // ------------------------------
      // Log da ação
      // ------------------------------
      await logger(
        client,
        'Mute',
        target,
        message.author,
        `Muted for ${durationMinutes} minutes`,
        message.guild
      );

    } catch (err) {
      console.error('[MUTE COMMAND ERROR]', err);
      message.reply('❌ Failed to mute the user.');
    }
  }
};
