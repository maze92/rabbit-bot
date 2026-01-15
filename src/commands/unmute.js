// src/commands/unmute.js
const { PermissionsBitField } = require('discord.js');

const logger = require('../systems/logger');
const infractionsService = require('../systems/infractionsService');

module.exports = {
  name: 'unmute',
  description: 'Remove timeout (unmute) from a user',

  /**
   * Uso: !unmute @user
   */
  async execute(message, args, client) {
    try {
      if (!message.guild) return;

      const guild = message.guild;
      const botMember = guild.members.me;
      if (!botMember) return;

      const perms = message.channel.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('❌ I do not have permission to unmute members (Moderate Members).').catch(() => null);
      }

      const target = message.mentions.members.first();
      if (!target) return message.reply('❌ Usage: !unmute @user').catch(() => null);

      // hierarquia bot
      if (target.roles.highest.position >= botMember.roles.highest.position) {
        return message.reply('❌ I cannot unmute this user (role higher/equal to mine).').catch(() => null);
      }

      if (!target.isCommunicationDisabled()) {
        return message.reply(`⚠️ **${target.user.tag}** is not muted.`).catch(() => null);
      }

      await target.timeout(null, `Unmuted by ${message.author.tag}`);

      await message.channel
        .send(`✅ **${target.user.tag}** has been unmuted.`)
        .catch(() => null);

      // opcional: registar infração "MUTE removed" não existe no enum
      // então registramos como WARN ou não registramos. Aqui vou só logar, e guardar infração não é obrigatório.
      // Se quiseres, podemos criar um enum novo "UNMUTE" no model.

      await logger(
        client,
        'Manual Unmute',
        target.user,
        message.author,
        'User unmuted manually',
        guild
      );

    } catch (err) {
      console.error('[unmute] Error:', err);
      message.reply('❌ Failed to unmute the user.').catch(() => null);
    }
  }
};
