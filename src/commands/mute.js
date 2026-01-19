// src/commands/mute.js

const { PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const logger = require('../systems/logger');
const infractionsService = require('../systems/infractionsService');
const warningsService = require('../systems/warningsService');
const { t } = require('../systems/i18n');
const { parseDuration, formatDuration } = require('../utils/time');
const { isStaff } = require('../utils/staff');
const { safeDM } = require('../utils/dm');

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


module.exports = {
  name: 'mute',
  description: 'Timeout (mute) a user with optional duration and reason',

  async execute(message, args, client) {
    try {
      if (!message?.guild) return;
      if (!message.member) return;

      const guild = message.guild;
      const executor = message.member;
      const botMember = guild.members.me;
      if (!botMember) return;

      if (!(await isStaff(executor)) {
        return message.reply(t('common.noPermission')).catch(() => null);
      }

      const perms = message.channel.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message
          .reply(t('common.missingBotPerm', null, 'Moderate Members'))
          .catch(() => null);
      }

      const target = message.mentions.members.first();
      if (!target) {
        return message
          .reply(t('common.usage', null, `${config.prefix}mute @user [10m/1h/2d] [reason...]`))
          .catch(() => null);
      }

      if (target.id === message.author.id) {
        return message.reply(t('mute.cannotMuteSelf')).catch(() => null);
      }

      if (target.id === client.user.id) {
        return message.reply(t('mute.cannotMuteBot')).catch(() => null);
      }

      if (target.user.bot) {
        return message.reply(t('mute.cannotMuteBotUser')).catch(() => null);
      }

      if (typeof target.isCommunicationDisabled === 'function' && target.isCommunicationDisabled()) {
        return message
          .reply(t('mute.alreadyMuted', null, { tag: target.user.tag }))
          .catch(() => null);
      }

      const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);

      if (target.roles.highest.position >= botMember.roles.highest.position) {
        return message.reply(t('mute.roleHierarchyBot')).catch(() => null);
      }

      if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
        return message.reply(t('mute.roleHierarchyUser')).catch(() => null);
      }

      if (!executorIsAdmin && target.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(t('mute.cannotMuteAdmin')).catch(() => null);
      }

      const cleanedArgs = stripTargetFromArgs(args, target.id);
      const possibleDuration = cleanedArgs[0];
      const parsed = parseDuration(possibleDuration);

      const durationMs = parsed || config.muteDuration || 10 * 60 * 1000;

      const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
      if (durationMs > MAX_TIMEOUT_MS) {
        return message.reply(t('mute.maxDuration')).catch(() => null);
      }

      const reasonStartIndex = parsed ? 1 : 0;
      const reason = cleanedArgs.slice(reasonStartIndex).join(' ').trim() || t('common.noReason');

      await target.timeout(durationMs, `Muted by ${message.author.tag}: ${reason}`);

      let dbUser = null;
      try {
        dbUser = await warningsService.applyMutePenalty(guild.id, target.id);
      } catch (e) {
        console.error('[mute] warningsService error:', e);
      }

      if (config.notifications?.dmOnMute) {
        await safeDM(
          target.user,
          t('mute.dmText', null, {
            guildName: guild.name,
            duration: formatDuration(durationMs),
            reason
          })
        );
      }

      // Cria a infração com Case ID (se o sistema estiver ativo)
      const inf = await infractionsService
        .create({
          guild,
          user: target.user,
          moderator: message.author,
          type: 'MUTE',
          reason,
          duration: durationMs
        })
        .catch(() => null);

      await message.channel
        .send(
          t('mute.channelConfirm', null, {
            tag: target.user.tag,
            duration: formatDuration(durationMs),
            reason
          })
        )
        .catch(() => null);

      // Trust fica interno (apenas em logs) + Case ID
      const casePrefix = inf?.caseId ? `Case: **#${inf.caseId}**\n` : '';
      const description =
        casePrefix +
        t('log.actions.manualMute', null, {
          duration: formatDuration(durationMs),
          reason,
          trust: dbUser?.trust ?? 'N/A'
        });

      await logger(
        client,
        'Manual Mute',
        target.user,
        message.author,
        description,
        guild
      );
    } catch (err) {
      console.error('[mute] Error:', err);
      message.reply(t('mute.failed')).catch(() => null);
    }
  }
};
