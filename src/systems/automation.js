// src/systems/automation.js
// Regras de automação adicionais (auto-mute baseado em trust / warns)

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');
const infractionsService = require('./infractionsService');
const warningsService = require('./warningsService');
const logger = require('./logger');
const { t } = require('./i18n');

/**
 * Lida com automação após criação de uma infração (por exemplo, WARN).
 * Atualmente só trata de auto-mute escalonado; não faz kicks/bans.
 *
 * @param {Object} opts
 * @param {import('discord.js').Client} opts.client
 * @param {import('discord.js').Guild}  opts.guild
 * @param {import('discord.js').User}   opts.user
 * @param {import('discord.js').User}   opts.moderator
 * @param {'WARN'|'MUTE'}               opts.type
 */
async function handleInfractionAutomation(opts) {
  try {
    const { client, guild, user, moderator, type } = opts || {};
    if (!client || !guild || !user) return;

    const autoMuteCfg = config.automation && config.automation.autoMute;
    if (!autoMuteCfg || autoMuteCfg.enabled === false) return;

    // Só reagimos a WARN/MUTE (normalmente WARN)
    if (type !== 'WARN' && type !== 'MUTE') return;

    const me = guild.members.me;
    if (!me) return;
    if (!me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

    // Ler estado do utilizador (trust + nº de warns) a partir do warningsService
    let warnsCount = 0;
    let trustUser = null;

    try {
      trustUser = await warningsService.getOrCreateUser(guild.id, user.id);
      if (trustUser && typeof trustUser.warnings === 'number') {
        warnsCount = trustUser.warnings;
      }
    } catch (err) {
      console.warn('[automation] failed to load user warnings/trust:', err?.message || err);
      return;
    }

    const threshold = typeof autoMuteCfg.warnsToMute === 'number'
      ? autoMuteCfg.warnsToMute
      : 3;

    if (!threshold || warnsCount < threshold) {
      return;
    }

    // Base de duração configurada
    const baseDurationMs =
      typeof autoMuteCfg.muteDurationMs === 'number'
        ? autoMuteCfg.muteDurationMs
        : 10 * 60 * 1000; // 10 minutos por omissão

    // Pequeno escalonamento simples com base na confiança (trust)
    let multiplier = 1;
    try {
      const trust = trustUser && typeof trustUser.trust === 'number' ? trustUser.trust : 0;

      if (trust < 0 && trust >= -20) {
        multiplier = 2;
      } else if (trust < -20 && trust >= -40) {
        multiplier = 3;
      } else if (trust < -40) {
        multiplier = 4;
      }
    } catch (err) {
      console.warn('[automation] failed to compute trust-based scaling:', err?.message || err);
    }

    const durationMs = Math.max(60_000, Math.floor(baseDurationMs * multiplier));

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    // Se já estiver em timeout, não fazemos nada
    if (member.isCommunicationDisabled && member.isCommunicationDisabled()) {
      return;
    }

    try {
      await member.timeout(durationMs, 'Auto-mute (automation)').catch((err) => {
        console.warn('[automation] failed timeout:', err?.message || err);
      });
    } catch (err) {
      console.warn('[automation] timeout threw:', err?.message || err);
    }

    // Aplicar penalização de trust associada ao mute
    try {
      await warningsService.applyMutePenalty(guild.id, user.id);
    } catch (err) {
      console.warn('[automation] failed to apply mute penalty:', err?.message || err);
    }

    // Criar infração MUTE dedicada (para aparecer em logs / dashboard)
    let inf = null;
    try {
      inf = await infractionsService.create({
        guild,
        user,
        moderator: moderator || client.user,
        type: 'MUTE',
        reason: 'Auto-mute (automation)',
        duration: durationMs,
        source: 'automation'
      });
    } catch (err) {
      console.warn('[automation] failed to create MUTE infraction:', err?.message || err);
    }

    const mins = Math.max(1, Math.round(durationMs / 60000));
    const casePrefix = inf?.caseId ? `Case: **#${inf.caseId}**\n` : '';

    try {
      await logger(
        client,
        'Automation: Auto-Mute',
        user,
        moderator || client.user,
        casePrefix +
          t('log.actions.automodMute', null, {
            minutes: mins,
            trustAfter: 'N/A'
          }),
        guild
      ).catch(() => null);
    } catch {
      // ignore logger errors
    }
  } catch (err) {
    console.error('[automation] handleInfractionAutomation error:', err);
  }
}

module.exports = {
  handleInfractionAutomation
};
