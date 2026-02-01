// src/slash/warn.js

const config = require('../config/defaultConfig');
const logger = require('../systems/logger');
const warningsService = require('../systems/warningsService');
const infractionsService = require('../systems/infractionsService');
const { handleInfractionAutomation } = require('../systems/automation');
const { t } = require('../systems/i18n');
const { isStaff } = require('./utils');
const { replyEphemeral, safeReply } = require('../utils/discord');
const { ensureWarnPermissions } = require('../utils/modPermissions');
const { getTrustConfig, getEffectiveMaxWarnings, getEffectiveMuteDuration } = require('../utils/trust');

module.exports = async function warnSlash(client, interaction) {
  try {
    const guild = interaction.guild;
    if (!guild) return;

    const executor = interaction.member;
    const botMember = guild.members.me;

    if (!executor || !botMember) {
      return replyEphemeral(interaction, t('common.unexpectedError'));
    }

    const staff = await isStaff(executor).catch(() => false);
    if (!staff) {
      return replyEphemeral(interaction, t('common.noPermission'));
    }

    const targetUser = interaction.options.getUser('user', true);
    const target = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) {
      return replyEphemeral(interaction, t('common.cannotResolveUser'));
    }

    const canProceed = await ensureWarnPermissions({
      client,
      interaction,
      executor,
      target,
      botMember
    });
    if (!canProceed) return;

    const rawReason = (interaction.options.getString('reason') || '').trim();
    const reason = rawReason || t('common.noReason');

    // Add warning and update trust/user state
    const dbUser = await warningsService.addWarning(guild.id, target.id, 1);

    const baseMaxWarnings =
      typeof config.maxWarnings === 'number' ? config.maxWarnings : 3;

    const trustCfg = getTrustConfig();
    const trustValue = Number.isFinite(dbUser?.trust)
      ? dbUser.trust
      : (typeof trustCfg.base === 'number' ? trustCfg.base : 0);

    const effectiveMaxWarnings = getEffectiveMaxWarnings(
      baseMaxWarnings,
      trustCfg,
      trustValue
    );

    // Create WARN infraction
    let warnInf = null;
    try {
      warnInf = await infractionsService.create({
        guild,
        user: target.user,
        moderator: interaction.user,
        type: 'WARN',
        reason,
        duration: null,
        source: 'slash'
      });
    } catch {
      // ignore
    }

    // Automação extra (auto-mute/afins) baseada na infração
    try {
      await handleInfractionAutomation({
        client,
        guild,
        user: target.user,
        moderator: interaction.user,
        type: 'WARN'
      });
    } catch {
      // ignore
    }

    const casePrefix = warnInf?.caseId ? `Case: **#${warnInf.caseId}**\n` : '';

    // Resposta pública no canal
    await interaction
      .reply({
        content:
          casePrefix +
          t('warn.channelConfirm', null, {
            userMention: `${target}`,
            warnings: dbUser.warnings,
            maxWarnings: effectiveMaxWarnings,
            reason
          })
      })
      .catch(() => null);

    // Escalonamento automático: mute se atingir o limite efetivo
    if (dbUser.warnings >= effectiveMaxWarnings && target.moderatable) {
      const baseMute =
        typeof config.muteDuration === 'number'
          ? config.muteDuration
          : 10 * 60 * 1000;

      const effectiveMute = getEffectiveMuteDuration(
        baseMute,
        trustCfg,
        trustValue
      );

      await target.timeout(effectiveMute, t('automod.muteReason')).catch(() => null);

      let afterMuteUser = dbUser;
      try {
        afterMuteUser = await warningsService.applyMutePenalty(
          guild.id,
          target.id
        );
      } catch {
        // ignore
      }

      const trustAfterMute = Number.isFinite(afterMuteUser?.trust)
        ? afterMuteUser.trust
        : trustValue;

      let muteInf = null;
      try {
        muteInf = await infractionsService.create({
          guild,
          user: target.user,
          moderator: interaction.user,
          type: 'MUTE',
          reason: t('automod.muteReason'),
          duration: effectiveMute,
          source: 'slash-escalation'
        });
      } catch {
        // ignore
      }

      const mins = Math.max(1, Math.round(effectiveMute / 60000));

      await interaction
        .followUp({
          content: t('automod.mutePublic', null, {
            userMention: `${target}`,
            minutes: mins
          })
        })
        .catch(() => null);

      const muteCasePrefix = muteInf?.caseId
        ? `Case: **#${muteInf.caseId}**\n`
        : '';

      await logger(
        client,
        'Slash Mute (Escalation)',
        target.user,
        interaction.user,
        muteCasePrefix +
          t('log.actions.automodMute', null, {
            minutes: mins,
            trustAfter: trustCfg.enabled
              ? `${trustAfterMute}/${trustCfg.max}`
              : 'N/A'
          }),
        guild
      );
    }

    // Log do WARN manual
    try {
      await logger(
        client,
        'Slash Warn',
        target.user,
        interaction.user,
        t('log.actions.manualWarn', null, {
          reason,
          warnings: dbUser.warnings,
          maxWarnings: effectiveMaxWarnings,
          trust: dbUser.trust ?? 'N/A'
        }),
        guild
      );
    } catch {
      // ignore
    }
  } catch (err) {
    console.error('[slash/warn] Error:', err);
    return safeReply(
      interaction,
      { content: t('common.unexpectedError') },
      { ephemeral: true }
    );
  }
};
