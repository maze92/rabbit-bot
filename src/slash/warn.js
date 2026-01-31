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

    const targetUser = interaction.options.getUser('user', true);
    const target = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) {
      return replyEphemeral(interaction, t('common.cannotResolveUser'));
    }

    const canProceed = await ensureWarnPermissions({ client, interaction, executor, target, botMember });
    if (!canProceed) return;

    const reason = (interaction.options.getString('reason') || '').trim() || t('common.noReason');

    const dbUser = await warningsService.addWarning(guild.id, target.id, 1);
    const baseMaxWarnings = config.maxWarnings ?? 3;

    const trustCfg = getTrustConfig();
    const trustValue = Number.isFinite(dbUser?.trust) ? dbUser.trust : trustCfg.base;
    const effectiveMaxWarnings = getEffectiveMaxWarnings(baseMaxWarnings, trustCfg, trustValue);

    const inf = await infractionsService
      .create({
        guild,
        user: target.user,
        moderator: interaction.user,
        type: 'WARN',
        reason,
        duration: null,
        source: 'slash'
      })
      .catch(() => null);

    // Automação (auto-mute / auto-kick) baseada nas infrações acumuladas
    handleInfractionAutomation({
      client,
      guild,
      user: target.user,
      moderator: interaction.user,
      type: 'WARN'
    }).catch(() => null);

    // Resposta pública
    await interaction
      .reply({
        content: t('warn.channelConfirm', null, {
          userMention: `${target}`,
          warnings: dbUser.warnings,
          maxWarnings: effectiveMaxWarnings,
          reason
        })
      })
      .catch(() => null);

    // Escalonamento automático (mute) ao atingir o limite efetivo
    if (
      dbUser.warnings >= effectiveMaxWarnings &&
      target.moderatable &&
    ) {
      const baseMute = config.muteDuration ?? 10 * 60 * 1000;
      const effectiveMute = getEffectiveMuteDuration(baseMute, trustCfg, trustValue);

      await target.timeout(effectiveMute, t('automod.muteReason')).catch(() => null);

      let afterMuteUser = dbUser;
      try {
        afterMuteUser = await warningsService.applyMutePenalty(guild.id, target.id);
      } catch {
        // ignore
      }

      const trustAfterMute = Number.isFinite(afterMuteUser.trust)
        ? afterMuteUser.trust
        : trustValue;

      const muteInf = await infractionsService
        .create({
          guild,
          user: target.user,
          moderator: interaction.user,
          type: 'MUTE',
          reason: t('automod.muteReason'),
          duration: effectiveMute,
          source: 'slash-escalation'
        })
        .catch(() => null);

      const mins = Math.max(1, Math.round(effectiveMute / 60000));

      await interaction.followUp({
        content: t('automod.mutePublic', null, {
          userMention: `${target}`,
          minutes: mins
        })
      }).catch(() => null);

      const muteCasePrefix = muteInf?.caseId ? `Case: **#${muteInf.caseId}**\n` : '';

      await logger(
        client,
        'Slash Mute (Escalation)',
        target.user,
        interaction.user,
        muteCasePrefix +
          t('log.actions.automodMute', null, {
            minutes: mins,
            trustAfter: trustCfg.enabled ? `${trustAfterMute}/${trustCfg.max}` : 'N/A'
          }),
        guild
      );

      await warningsService.resetWarnings(guild.id, target.id).catch(() => null);
    }

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
  } catch (err) {
    console.error('[slash/warn] Error:', err);
    return safeReply(interaction, { content: t('common.unexpectedError') }, { ephemeral: true });
  }
};