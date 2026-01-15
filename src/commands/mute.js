// src/commands/mute.js
const { PermissionsBitField } = require('discord.js');
const logger = require('../systems/logger');
const config = require('../config/defaultConfig');
const infractionsService = require('../systems/infractionsService');

/**
 * Converte "10m", "1h", "2d" para milissegundos.
 */
function parseDuration(input) {
  if (!input || typeof input !== 'string') return null;
  const match = input.trim().toLowerCase().match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (!value || value <= 0) return null;

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (day >= 1 && day * 24 * 60 * 60 * 1000 === ms) return `${day}d`;
  if (hour >= 1 && hour * 60 * 60 * 1000 === ms) return `${hour}h`;
  if (min >= 1 && min * 60 * 1000 === ms) return `${min}m`;
  return `${sec}s`;
}

module.exports = {
  name: 'mute',
  description: 'Timeout (mute) a user with optional duration and reason',
  allowedRoles: config.staffRoles,

  async execute(message, args, client) {
    try {
      if (!message.guild) return;

      const executor = message.member;
      const botMember = message.guild.members.me;
      if (!executor || !botMember) return;

      // Permissão do bot
      const botPerms = message.channel.permissionsFor(botMember);
      if (!botPerms?.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('❌ I do not have permission to timeout members (Moderate Members).');
      }

      // Alvo
      const targetMember = message.mentions.members.first();
      if (!targetMember) {
        return message.reply(`❌ Usage: ${config.prefix}mute @user [10m/1h/2d] [reason...]`);
      }

      if (targetMember.user.bot) return message.reply('⚠️ You cannot mute a bot.');

      // Hierarquia: bot não pode moderar cargos >= ao dele
      if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
        return message.reply('❌ I cannot mute this user (their role is higher or equal to my highest role).');
      }

      // Executor anti-abuso (opcional)
      if (
        targetMember.roles.highest.position >= executor.roles.highest.position &&
        !executor.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return message.reply('❌ You cannot mute this user (their role is higher or equal to yours).');
      }

      // Limpar args removendo mention
      const cleanedArgs = args.filter(a => {
        const isMention = a.includes(`<@${targetMember.id}>`) || a.includes(`<@!${targetMember.id}>`);
        const isRawId = a === targetMember.id;
        return !isMention && !isRawId;
      });

      const possibleDuration = cleanedArgs[0];
      const parsed = parseDuration(possibleDuration);

      const durationMs = parsed ?? config.muteDuration ?? 10 * 60 * 1000;

      const reasonStartIndex = parsed ? 1 : 0;
      const reason = cleanedArgs.slice(reasonStartIndex).join(' ').trim() || 'No reason provided';

      // Limite Discord timeout: 28 dias
      const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
      if (durationMs > MAX_TIMEOUT_MS) return message.reply('❌ Timeout duration cannot exceed 28 days.');

      await targetMember.timeout(durationMs, `Muted by ${message.author.tag}: ${reason}`);

      await message.channel
        .send(`🔇 **${targetMember.user.tag}** has been muted for **${formatDuration(durationMs)}**.\n📝 Reason: **${reason}**`)
        .catch(() => null);

      // Registar infraction MUTE
      await infractionsService.create({
        guild: message.guild,
        user: targetMember.user,
        moderator: message.author,
        type: 'MUTE',
        reason,
        duration: durationMs
      });

      await logger(
        client,
        'Manual Mute',
        targetMember.user,
        message.author,
        `Duration: **${formatDuration(durationMs)}**\nReason: **${reason}**`,
        message.guild
      );
    } catch (err) {
      console.error('[mute] Error:', err);
      message.reply('❌ Failed to mute the user. Check my permissions and role hierarchy.').catch(() => null);
    }
  }
};
