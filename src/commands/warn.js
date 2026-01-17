// src/commands/warn.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const logger = require('../systems/logger');
const warningsService = require('../systems/warningsService');
const infractionsService = require('../systems/infractionsService');

function stripTargetFromArgs(args, targetId) {
  if (!Array.isArray(args) || !targetId) return [];

  return args.filter((a) => {
    if (!a) return false;

    const s = String(a);
    const isMention = s.includes(`<@${targetId}>`) || s.includes(`<@!${targetId}>`);
    const isRawId = s === targetId;

    return !isMention && !isRawId;
  });
}

function isStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id));
}

async function trySendDM(user, content) {
  try {
    if (!user) return;
    if (!content) return;
    await user.send({ content }).catch(() => null);
  } catch {
    // ignore
  }
}

module.exports = {
  name: 'warn',
  description: 'Issue a warning to a user',

  async execute(message, args, client) {
    try {
      if (!message?.guild) return;
      if (!message.member) return;

      const guild = message.guild;
      const botMember = guild.members.me;
      if (!botMember) return;

      if (!isStaff(message.member)) {
        return message
          .reply("❌ You don't have permission to use this command.")
          .catch(() => null);
      }

      const target = message.mentions.members.first();
      if (!target) {
        return message
          .reply('❌ Usage: !warn @user [reason...]')
          .catch(() => null);
      }

      if (target.id === message.author.id) {
        return message.reply('❌ You cannot warn yourself.').catch(() => null);
      }

      if (target.id === client.user.id) {
        return message.reply('❌ You cannot warn the bot.').catch(() => null);
      }

      if (target.roles.highest.position >= botMember.roles.highest.position) {
        return message
          .reply('❌ I cannot warn this user due to role hierarchy (my role is not high enough).')
          .catch(() => null);
      }

      const executorIsAdmin = message.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      );
      if (
        !executorIsAdmin &&
        target.roles.highest.position >= message.member.roles.highest.position
      ) {
        return message
          .reply('❌ You cannot warn a user with an equal or higher role than yours.')
          .catch(() => null);
      }

      if (!executorIsAdmin && target.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message
          .reply('❌ You cannot warn an Administrator.')
          .catch(() => null);
      }

      const cleanedArgs = stripTargetFromArgs(args, target.id);
      const reason = cleanedArgs.join(' ').trim() || 'No reason provided';

      const dbUser = await warningsService.addWarning(guild.id, target.id, 1);

      await infractionsService
        .create({
          guild,
          user: target.user,
          moderator: message.author,
          type: 'WARN',
          reason,
          duration: null
        })
        .catch(() => null);

      // Mensagem pública: não mostra trust
      await message.channel
        .send(
          `⚠️ ${target} has been warned.\n` +
            `📌 Total warnings: **${dbUser.warnings}**\n` +
            `📝 Reason: **${reason}**`
        )
        .catch(() => null);

      // DM opcional ao user: também sem trust
      if (config.notifications?.dmOnWarn) {
        const dmText =
          `⚠️ You received a **WARN** in **${guild.name}**.\n` +
          `📝 Reason: **${reason}**\n` +
          `📌 Total warnings: **${dbUser.warnings}**`;

        await trySendDM(target.user, dmText);
      }

      // Logger interno continua a ver o trust (para staff / log-bot)
      await logger(
        client,
        'Manual Warn',
        target.user,
        message.author,
        `Reason: **${reason}**\nTotal warnings: **${dbUser.warnings}**\nTrust: **${
          dbUser.trust ?? 'N/A'
        }**`,
        guild
      );
    } catch (err) {
      console.error('[warn] Error:', err);
      await message.reply('❌ An unexpected error occurred.').catch(() => null);
    }
  }
};
