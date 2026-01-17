// src/slash/mute.js

const { PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const logger = require('../systems/logger');
const infractionsService = require('../systems/infractionsService');
const warningsService = require('../systems/warningsService');
const { t } = require('../systems/i18n');
const { isStaff } = require('./utils');

function parseDuration(input) {
  if (!input || typeof input !== 'string') return null;
  const match = input.trim().toLowerCase().match(/^([0-9]+)(s|m|h|d)$/);
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

async function trySendDM(user, content) {
  try {
    if (!user || !content) return;
    await user.send({ content }).catch(() => null);
  } catch {
    // ignore
  }
}

module.exports = async function muteSlash(client, interaction) {
  try {
    if (!interaction?.guild) return;

    const guild = interaction.guild;
    const executor = interaction.member;
    const botMember = guild.members.me;
    if (!executor || !botMember) {
      return interaction.reply({ content: t('common.unexpectedError'), ephemeral: true }).catch(() => null);
    }

    if (!isStaff(executor)) {
      return interaction.reply({ content: t('common.noPermission'), ephemeral: true }).catch(() => null);
    }

    const channelPerms = interaction.channel?.permissionsFor?.(botMember);
    if (!channelPerms?.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({ content: t('common.missingBotPerm', null, 'Moderate Members'), ephemeral: true }).catch(() => null);
    }

    const targetUser = interaction.options.getUser('user', true);
    const target = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) {
      return interaction.reply({ content: t('common.cannotResolveUser'), ephemeral: true }).catch(() => null);
    }

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: t('mute.cannotMuteSelf'), ephemeral: true }).catch(() => null);
    }

    if (target.id === client.user.id) {
      return interaction.reply({ content: t('mute.cannotMuteBot'), ephemeral: true }).catch(() => null);
    }

    if (target.user.bot) {
      return interaction.reply({ content: t('mute.cannotMuteBotUser'), ephemeral: true }).catch(() => null);
    }

    if (typeof target.isCommunicationDisabled === 'function' && target.isCommunicationDisabled()) {
      return interaction.reply({ content: t('mute.alreadyMuted', null, { tag: target.user.tag }), ephemeral: true }).catch(() => null);
    }

    const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);

    if (target.roles.highest.position >= botMember.roles.highest.position) {
      return interaction.reply({ content: t('mute.roleHierarchyBot'), ephemeral: true }).catch(() => null);
    }

    if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
      return interaction.reply({ content: t('mute.roleHierarchyUser'), ephemeral: true }).catch(() => null);
    }

    if (!executorIsAdmin && target.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: t('mute.cannotMuteAdmin'), ephemeral: true }).catch(() => null);
    }

    const rawDuration = (interaction.options.getString('duration') || '').trim();
    const parsed = parseDuration(rawDuration);
    const durationMs = parsed || config.muteDuration || 10 * 60 * 1000;

    const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > MAX_TIMEOUT_MS) {
      return interaction.reply({ content: t('mute.maxDuration'), ephemeral: true }).catch(() => null);
    }

    const reason = (interaction.options.getString('reason') || '').trim() || t('common.noReason');

    await target.timeout(durationMs, `Muted by ${interaction.user.tag}: ${reason}`);

    let dbUser = null;
    try {
      dbUser = await warningsService.applyMutePenalty(guild.id, target.id);
    } catch (e) {
      console.error('[slash/mute] warningsService error:', e);
    }

    if (config.notifications?.dmOnMute) {
      await trySendDM(
        target.user,
        t('mute.dmText', null, {
          guildName: guild.name,
          duration: formatDuration(durationMs),
          reason
        })
      );
    }

    await infractionsService
      .create({
        guild,
        user: target.user,
        moderator: interaction.user,
        type: 'MUTE',
        reason,
        duration: durationMs
      })
      .catch(() => null);

    await interaction.reply({
      content: t('mute.channelConfirm', null, {
        tag: target.user.tag,
        duration: formatDuration(durationMs),
        reason
      }),
      ephemeral: false
    }).catch(() => null);

    await logger(
      client,
      'Slash Mute',
      target.user,
      interaction.user,
      t('log.actions.manualMute', null, {
        duration: formatDuration(durationMs),
        reason,
        trust: dbUser?.trust ?? 'N/A'
      }),
      guild
    );
  } catch (err) {
    console.error('[slash/mute] Error:', err);
    const payload = { content: t('mute.failed'), ephemeral: true };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
    return interaction.reply(payload).catch(() => null);
  }
};
