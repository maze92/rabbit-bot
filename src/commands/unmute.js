// src/commands/unmute.js
const { PermissionsBitField } = require('discord.js');
const logger = require('../systems/logger');
const config = require('../config/defaultConfig');

/**
 * Comando: !unmute
 * - Remove o timeout de um utilizador
 * - Loga no Discord + Dashboard
 * - (Não cria Infraction porque o enum não tem UNMUTE)
 */
module.exports = {
  name: 'unmute',
  description: 'Unmute a muted user',
  allowedRoles: config.staffRoles,

  async execute(message, args, client) {
    try {
      if (!message.guild) return;

      const executor = message.member;
      const botMember = message.guild.members.me;
      if (!executor || !botMember) return;

      const perms = message.channel.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('❌ I do not have permission to unmute members (Moderate Members).');
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply(`❌ Usage: ${config.prefix}unmute @user`);

      // Hierarquia
      if (target.roles.highest.position >= botMember.roles.highest.position) {
        return message.reply('❌ I cannot unmute this user (their role is higher/equal to my highest role).');
      }

      // Verifica se está muted
      if (!target.isCommunicationDisabled()) {
        return message.reply(`⚠️ **${target.user.tag}** is not muted.`);
      }

      // Remove timeout
      await target.timeout(null, `Unmuted by ${message.author.tag}`);

      await message.channel
        .send(`✅ **${target.user.tag}** has been unmuted.`)
        .catch(() => null);

      await logger(
        client,
        'Manual Unmute',
        target.user,
        message.author,
        'User unmuted manually',
        message.guild
      );
    } catch (err) {
      console.error('[unmute] Error:', err);
      message.reply('❌ Failed to unmute the user. Check my permissions and role hierarchy.').catch(() => null);
    }
  }
};
