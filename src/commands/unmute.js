/**
 * Comando: !unmute
 * - Remove o timeout (mute) de um utilizador
 * - Protegido por cargos de staff
 * - Regista a ação no sistema de logs
 */

const { PermissionsBitField } = require('discord.js');
const logger = require('../systems/logger');

module.exports = {
  name: 'unmute',
  description: 'Unmute a muted user',

  // Cargos autorizados a usar o comando
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
          '❌ I do not have permission to unmute members.'
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
        return message.reply('❌ Please mention a user to unmute.');
      }

      // ------------------------------
      // Verifica se está muted
      // ------------------------------
      if (!target.isCommunicationDisabled()) {
        return message.reply(
          `⚠️ **${target.user.tag}** is not muted.`
        );
      }

      // ------------------------------
      // Remove timeout
      // ------------------------------
      await target.timeout(null, 'Unmute by moderator');

      await message.channel.send(
        `✅ **${target.user.tag}** has been unmuted.`
      );

      // ------------------------------
      // Log da ação
      // ------------------------------
      await logger(
        client,
        'Unmute',
        target,
        message.author,
        'User unmuted manually',
        message.guild
      );

    } catch (err) {
      console.error('[UNMUTE COMMAND ERROR]', err);
      message.reply('❌ Failed to unmute the user.');
    }
  }
};
