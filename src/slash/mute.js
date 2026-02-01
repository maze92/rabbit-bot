// src/slash/mute.js

const { PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const logger = require('../systems/logger');
const infractionsService = require('../systems/infractionsService');
const warningsService = require('../systems/warningsService');
const { t } = require('../systems/i18n');
const { isStaff } = require('./utils');
const { replyEphemeral, safeReply } = require('../utils/discord');
const { ensureMutePermissions } = require('../utils/modPermissions');
const { parseDuration, formatDuration } = require('../utils/time');

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

    const canProceed = await ensureMutePermissions({
      client,
      interaction,
      executor,
      target,
      botMember
    });
    if (!canProceed) return;

    const rawDuration = (interaction.options.getString('duration') || '').trim();
    const parsed = parseDuration(rawDuration);
    const durationMs = parsed || config.muteDuration || 10 * 60 * 1000;

    const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > MAX_TIMEOUT_MS) {
      return replyEphemeral(interaction, t('mute.maxDuration'));
    }

    const reason =
      (interaction.options.getString('reason') || '').trim() ||
      t('common.noReason');

    await target.timeout(
      durationMs,
      `Muted by ${interaction.user.tag}: ${reason}`
    );

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
    return safeReply(
      interaction,
      { content: t('mute.failed') },
      { ephemeral: true }
    );
  }
};
