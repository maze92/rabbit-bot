// src/systems/automation.js
// Regras de automação adicionais (auto-mute / auto-kick)

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');
const Infraction = require('../database/models/Infraction');
const infractionsService = require('./infractionsService');
const logger = require('./logger');
const { t } = require('./i18n');

/**
 * @param {Object} opts
 * @param {import('discord.js').Client} opts.client
 * @param {import('discord.js').Guild}  opts.guild
 * @param {import('discord.js').User}   opts.user
 * @param {import('discord.js').User}   opts.moderator
 * @param {string} opts.type            Tipo da infração recém-criada (WARN/MUTE/KICK/BAN)
 */
async function handleInfractionAutomation({ client, guild, user, moderator, type }) {
  try {
    if (!client || !guild?.id || !user?.id) return;

    const autoCfg = config.automation || {};
    if (!autoCfg.enabled) return;

    const autoMute = autoCfg.autoMute || {};
    const autoKick = autoCfg.autoKick || {};

    const member = await guild.members.fetch(user.id).catch(() => null);
    const botMember = guild.members.me;
    if (!member || !botMember) return;

    // ------------------------
    // Auto-mute por nº de WARNs
    // ------------------------
    if (autoMute.enabled && type === 'WARN') {
      const warnsToMute = Number(autoMute.warnsToMute || 0);
      const muteDurationMs = Number(autoMute.muteDurationMs || 0) || 30 * 60 * 1000;

      if (warnsToMute > 0) {
        const warnCount = await Infraction.countDocuments({
          guildId: guild.id,
          userId: user.id,
          type: 'WARN'
        });

        if (
          warnCount >= warnsToMute &&
          member.moderatable &&
          botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)
        ) {
          // Se já está timeout, não repetir
          const now = Date.now();
          if (!member.communicationDisabledUntilTimestamp || member.communicationDisabledUntilTimestamp < now) {
            await member.timeout(muteDurationMs, 'Auto-mute (automation)')
              .catch((err) => console.warn('[automation] failed timeout:', err?.message || err));

            let inf = null;
            try {
              inf = await infractionsService.create({
                guild,
                user,
                moderator: moderator || client.user,
                type: 'MUTE',
                reason: 'Auto-mute (automation)',
                duration: muteDurationMs,
                source: 'automation'
              });
            } catch (err) {
              console.warn('[automation] failed to create MUTE infraction:', err?.message || err);
            }

            const mins = Math.max(1, Math.round(muteDurationMs / 60000));
            const casePrefix = inf?.caseId ? `Case: **#${inf.caseId}**\n` : '';

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
          }
        }
      }
    }

    // ------------------------
    // Auto-kick por nº total de infrações
    // ------------------------
    if (autoKick.enabled) {
      const threshold = Number(autoKick.infractionsToKick || 0);
      if (threshold > 0) {
        const totalInfractions = await Infraction.countDocuments({
          guildId: guild.id,
          userId: user.id
        });

        if (
          totalInfractions >= threshold &&
          member.kickable &&
          botMember.permissions.has(PermissionsBitField.Flags.KickMembers)
        ) {
          await member.kick('Auto-kick (automation)')
            .catch((err) => console.warn('[automation] failed kick:', err?.message || err));

          let infKick = null;
          try {
            infKick = await infractionsService.create({
              guild,
              user,
              moderator: moderator || client.user,
              type: 'KICK',
              reason: 'Auto-kick (automation)',
              duration: null,
              source: 'automation'
            });
          } catch (err) {
            console.warn('[automation] failed to create KICK infraction:', err?.message || err);
          }

          const casePrefix = infKick?.caseId ? `Case: **#${infKick.caseId}**\n` : '';

          await logger(
            client,
            'Automation: Auto-Kick',
            user,
            moderator || client.user,
            casePrefix + t('log.actions.manualKick', null, {
              reason: 'Auto-kick (automation)'
            }),
            guild
          ).catch(() => null);
        }
      }
    }
  } catch (err) {
    console.error('[automation] handleInfractionAutomation error:', err);
  }
}

module.exports = {
  handleInfractionAutomation
};

