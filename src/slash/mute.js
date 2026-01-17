// src/slash/mute.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');

const logger = require('../systems/logger');
const infractionsService = require('../systems/infractionsService');
const warningsService = require('../systems/warningsService');

function isStaff(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id));
}

function parseDuration(input) {
  if (!input || typeof input !== 'string') return null;
  const match = input.trim().toLowerCase().match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (!value || value <= 0) return null;

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
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
  } catch {}
}

module.exports = async (client, interaction) => {
  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  const guild = interaction.guild;
  const executor = interaction.member;
  if (!guild || !executor) return;

  if (!isStaff(executor)) {
    return interaction.editReply({ content: t('common.noPermission') }).catch(() => null);
  }

  const botMember = guild.members.me;
  const perms = interaction.channel?.permissionsFor?.(botMember);
  if (!perms?.has(PermissionsBitField.Flags.ModerateMembers)) {
    return interaction.editReply({ content: t('mute.missingPerm') }).catch(() => null);
  }

  const targetUser = interaction.options.getUser('user', true);
  const durationStr = interaction.options.getString('duration')?.trim() || '';
  const reason = interaction.options.getString('reason')?.trim() || t('common.noReason');

  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember || !botMember) {
    return interaction.editReply({ content: '❌ Could not resolve target.' }).catch(() => null);
  }

  if (targetMember.id === interaction.user.id) {
    return interaction.editReply({ content: t('mute.cannotMuteSelf') }).catch(() => null);
  }
  if (targetMember.id === client.user.id) {
    return interaction.editReply({ content: t('mute.cannotMuteBot') }).catch(() => null);
  }
  if (targetMember.user.bot) {
    return interaction.editReply({ content: t('mute.cannotMuteBots') }).catch(() => null);
  }

  if (typeof targetMember.isCommunicationDisabled === 'function' && targetMember.isCommunicationDisabled()) {
    return interaction.editReply({ content: t('mute.alreadyMuted', null, targetMember.user.tag) }).catch(() => null);
  }

  const executorIsAdmin = executor.permissions?.has(PermissionsBitField.Flags.Administrator);

  if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
    return interaction.editReply({ content: t('mute.hierarchyBot') }).catch(() => null);
  }
  if (!executorIsAdmin && targetMember.roles.highest.position >= executor.roles.highest.position) {
    return interaction.editReply({ content: t('mute.hierarchyYou') }).catch(() => null);
  }
  if (!executorIsAdmin && targetMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.editReply({ content: t('mute.cannotMuteAdmin') }).catch(() => null);
  }

  const parsed = parseDuration(durationStr);
  const durationMs = parsed || config.muteDuration || 10 * 60 * 1000;

  const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
  if (durationMs > MAX_TIMEOUT_MS) {
    return interaction.editReply({ content: t('mute.tooLong') }).catch(() => null);
  }

  await targetMember.timeout(durationMs, `Muted by ${interaction.user.tag}: ${reason}`);

  let dbUser = null;
  try {
    dbUser = await warningsService.applyMutePenalty(guild.id, targetMember.id);
  } catch (e) {
    console.error('[slash/mute] warningsService error:', e);
  }

  if (config.notifications?.dmOnMute) {
    await trySendDM(
      targetMember.user,
      t('mute.mutedDM', null, {
        guildName: guild.name,
        duration: formatDuration(durationMs),
        reason
      })
    );
  }

  await infractionsService
    .create({
      guild,
      user: targetMember.user,
      moderator: interaction.user,
      type: 'MUTE',
      reason,
      duration: durationMs
    })
    .catch(() => null);

  await interaction.channel
    ?.send(
      t('mute.mutedPublic', null, {
        tag: targetMember.user.tag,
        duration: formatDuration(durationMs),
        reason
      })
    )
    .catch(() => null);

  const trustTextLog = dbUser?.trust != null ? `\nTrust: **${dbUser.trust}**` : '';

  await logger(
    client,
    'Slash Mute',
    targetMember.user,
    interaction.user,
    `Duration: **${formatDuration(durationMs)}**\nReason: **${reason}**${trustTextLog}`,
    guild
  );

  return interaction.editReply({ content: '✅ Done.' }).catch(() => null);
};
