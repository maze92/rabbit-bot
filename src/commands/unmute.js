// src/commands/unmute.js

const { PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const logger = require('../systems/logger');
const warningsService = require('../systems/warningsService');

function isStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id));
}

module.exports = {
  name: 'unmute',
  description: 'Remove timeout (unmute) from a user',

  async execute(message, args, client) {
    try {

      if (!message?.guild) return;
      if (!message.member) return;

      const guild = message.guild;
      const executor = message.member;
      const botMember = guild.members.me;
      if (!botMember) return;

      if (!isStaff(executor)) {
        return message
          .reply("❌ You don't have permission to use this command.")
          .catch(() => null);
      }

      const perms = message.channel.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message
          .reply('❌ I do not have permission to unmute members (Moderate Members).')
          .catch(() => null);
      }

      const target = message.mentions.members.first();
      if (!target) {
        return message.reply(`❌ Usage: ${config.prefix}unmute @user`).catch(() => null);
      }

      if (target.id === message.author.id) {
        return message.reply('❌ You cannot unmute yourself.').catch(() => null);
      }

      if (target.id === client.user.id) {
        return message.reply('❌ You cannot unmute the bot.').catch(() => null);
      }

      const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);

      if (target.roles.highest.position >= botMember.roles.highest.position) {
        return message
          .reply('❌ I cannot unmute this user (their role is higher or equal to my highest role).')
          .catch(() => null);
      }

      if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
        return message
          .reply('❌ You cannot unmute a user with an equal or higher role than yours.')
          .catch(() => null);
      }

      if (typeof target.isCommunicationDisabled === 'function' && !target.isCommunicationDisabled()) {
        return message
          .reply(`⚠️ **${target.user.tag}** is not muted.`)
          .catch(() => null);
      }

      await target.timeout(null, `Unmuted by ${message.author.tag}`);

      await message.channel
        .send(`✅ **${target.user.tag}** has been unmuted.`)
        .catch(() => null);

      let dbUser = null;
      try {
        dbUser = await warningsService.getOrCreateUser(guild.id, target.id);
      } catch {
      }

      const trustText = dbUser?.trust != null ? `\nTrust: **${dbUser.trust}**` : '';
      const warnsText = dbUser?.warnings != null ? `\nWarnings: **${dbUser.warnings}**` : '';

      await logger(
        client,
        'Manual Unmute',
        target.user,
        message.author,
        `User unmuted manually.${warnsText}${trustText}`,
        guild
      );
    } catch (err) {
      console.error('[unmute] Error:', err);
      message.reply('❌ Failed to unmute the user.').catch(() => null);
    }
  }
};
