// src/slash/mute.js

const { PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const logger = require('../systems/logger');
const infractionsService = require('../systems/infractionsService');
const warningsService = require('../systems/warningsService');
const { t } = require('../systems/i18n');
const { isStaff } = require('./utils');
const { parseDuration, formatDuration } = require('../utils/time');



// 64 = Ephemeral flag
function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: 64 }).catch(() => null);
}

module.exports = async function muteSlash(client, interaction) {
  try {
    if (!interaction?.guild) return;

    const guild = interaction.guild;
    const executor = interaction.member;
    const botMember = guild.members.me;

    if (!executor || !botMember) {
      return replyEphemeral(interaction, t('common.unexpectedError'));
    }

    if (!(await isStaff(executor))) {
      return replyEphemeral(interaction, t('common.noPermission'));
    }

    const channelPerms = interaction.channel?.permissionsFor?.(botMember);
    if (!channelPerms?.has(PermissionsBitField.Flags.ModerateMembers)) {
      return replyEphemeral(
        interaction,
        t('common.missingBotPerm', null, 'Moderate Members')
      );
    }

    const targetUser = interaction.options.getUser('user', true);
    const target = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) {
      return replyEphemeral(interaction, t('common.cannotResolveUser'));
    }

    if (target.id === interaction.user.id) {
      return replyEphemeral(interaction, t('mute.cannotMuteSelf'));
    }

    if (target.id === client.user.id) {
      return replyEphemeral(interaction, t('mute.cannotMuteBot'));
    }

    if (target.user.bot) {
      return replyEphemeral(interaction, t('mute.cannotMuteBotUser'));
    }

    if (typeof target.isCommunicationDisabled === 'function' && target.isCommunicationDisabled()) {
      return replyEphemeral(
        interaction,
        t('mute.alreadyMuted', null, { tag: target.user.tag })
      );
    }

    const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);

    if (target.roles.highest.position >= botMember.roles.highest.position) {
      return replyEphemeral(interaction, t('mute.roleHierarchyBot'));
    }

    if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
      return replyEphemeral(interaction, t('mute.roleHierarchyUser'));
    }

    if (!executorIsAdmin && target.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return replyEphemeral(interaction, t('mute.cannotMuteAdmin'));
    }

    const rawDuration = (interaction.options.getString('duration') || '').trim();
    const parsed = parseDuration(rawDuration);
    const durationMs = parsed || config.muteDuration || 10 * 60 * 1000;

    const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > MAX_TIMEOUT_MS) {
      return replyEphemeral(interaction, t('mute.maxDuration'));
    }

    const reason = (interaction.options.getString('reason') || '').trim() || t('common.noReason');

    await target.timeout(durationMs, `Muted by ${interaction.user.tag}: ${reason}`);

    let dbUser = null;
    try {
      dbUser = await warningsService.applyMutePenalty(guild.id, target.id);
    } catch (e) {
      console.error('[slash/mute] warningsService error:', e);
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

    // resposta pública
    await interaction
      .reply({
        content: t('mute.channelConfirm', null, {
          tag: target.user.tag,
          duration: formatDuration(durationMs),
          reason
        })
      })
      .catch(() => null);

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

    const payload = { content: t('mute.failed'), flags: 64 }; // ephemeral via flags

    if (interaction.deferred || interaction.replied) {
      return interaction.followUp(payload).catch(() => null);
    }
    return interaction.reply(payload).catch(() => null);
  }
};
