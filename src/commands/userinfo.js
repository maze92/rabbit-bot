// src/commands/userinfo.js

const { EmbedBuilder, PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const warningsService = require('../systems/warningsService');
const infractionsService = require('../systems/infractionsService');
const logger = require('../systems/logger');
const { t } = require('../systems/i18n');
const { isStaff } = require('../utils/staff');
const { getTrustConfig, getTrustLabel } = require('../utils/trust');

async function resolveTarget(message, args) {
  const guild = message.guild;

  const byMention = message.mentions.members.first();
  if (byMention) return byMention;

  const raw = (args?.[0] || '').trim();
  if (raw) {
    const id = raw.replace(/[<@!>]/g, ''); // permite <@id>, <@!id> e id direto
    if (/^\d{15,25}$/.test(id)) {
      const byId = await guild.members.fetch(id).catch(() => null);
      if (byId) return byId;
    }
  }

  return message.member || null;
}

function truncate(str, max = 90) {
  const s = String(str || '').trim();
  if (!s) return t('common.noReason');
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}

function formatRelativeTime(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}

function formatInfractionLine(inf) {
  const type = String(inf?.type || 'UNKNOWN').toUpperCase();

  const duration =
    inf?.duration != null &&
    Number.isFinite(Number(inf.duration)) &&
    Number(inf.duration) > 0
      ? ` • ${Math.round(Number(inf.duration) / 60000)}m`
      : '';

  const ts = formatRelativeTime(inf?.createdAt);
  const reason = truncate(inf?.reason || t('common.noReason'), 80);

  const casePart =
    inf?.caseId != null && Number.isFinite(Number(inf.caseId))
      ? `Case #${inf.caseId} • `
      : '';

  return `• **${casePart}${type}**${duration} — ${ts}\n  └ ${reason}`;
}

function joinFieldSafe(lines, maxLen = 1024) {
  const out = [];
  let total = 0;

  for (const line of lines) {
    const s = String(line);
    const add = (out.length ? 1 : 0) + s.length; // +1 para \n
    if (total + add > maxLen) break;
    out.push(s);
    total += add;
  }

  if (lines.length > out.length) {
    const ell = '…';
    if (total + (out.length ? 1 : 0) + ell.length <= maxLen) out.push(ell);
  }

  return out.join('\n') || t('userinfo.noRecentInfractions');
}

module.exports = {
  name: 'userinfo',
  description:
    'Shows information about a user, including warnings and trust score (trust visible to staff only)',

  async execute(message, args, client) {
    try {
      if (!message?.guild) return;

      const guild = message.guild;
      const trustCfg = getTrustConfig();
      const requesterIsStaff = isStaff(message.member);

      const member = await resolveTarget(message, args);
      if (!member?.user) {
        return message.reply(t('common.cannotResolveUser')).catch(() => null);
      }

      const user = member.user;

      const dbUser = await warningsService.getOrCreateUser(guild.id, user.id);

      const warnings = dbUser?.warnings ?? 0;
      const trustValue = Number.isFinite(dbUser?.trust) ? dbUser.trust : trustCfg.base;
      const trustLabel = getTrustLabel(trustValue, trustCfg);

      // Total de infrações (todos os tipos) via infractionsService
      let infractionsCount = 0;
      try {
        const result = await infractionsService.searchCases({
          guildId: guild.id,
          userId: user.id,
          page: 1,
          limit: 1
        });
        infractionsCount = result?.total ?? 0;
      } catch {
        // ignore
      }

      // Últimas infrações (com caseId) apenas para staff
      let recentInfractions = [];
      if (requesterIsStaff) {
        try {
          recentInfractions = await infractionsService.getRecentInfractions(
            guild.id,
            user.id,
            5
          );
        } catch {
          recentInfractions = [];
        }
      }

      const createdAt = user.createdAt
        ? `<t:${Math.floor(user.createdAt.getTime() / 1000)}:F>`
        : 'Unknown';

      const joinedAt = member.joinedAt
        ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>`
        : 'Unknown';

      let trustFieldValue = t('userinfo.trustDisabled');
      if (trustCfg.enabled) {
        if (requesterIsStaff) {
          trustFieldValue = t('userinfo.trustStaff', null, {
            trustValue,
            trustMax: trustCfg.max,
            trustLabel
          });
        } else {
          trustFieldValue = t('userinfo.trustPublic');
        }
      }

      let recentFieldValue = t('userinfo.recentStaffOnly');
      if (requesterIsStaff) {
        const lines = (recentInfractions || []).map(formatInfractionLine);
        recentFieldValue = joinFieldSafe(lines, 1024);
      }

      const embed = new EmbedBuilder()
        .setTitle(t('userinfo.title', null, { tag: user.tag }))
        .setColor('Blue')
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          {
            name: t('userinfo.fieldUser'),
            value: t('userinfo.tagAndId', null, { tag: user.tag, id: user.id }),
            inline: false
          },
          {
            name: t('userinfo.fieldAccount'),
            value: t('userinfo.accountDates', null, { createdAt, joinedAt }),
            inline: false
          },
          {
            name: t('userinfo.fieldWarnings'),
            value: t('userinfo.warningsBlock', null, {
              warnings,
              maxWarnings: config.maxWarnings ?? 3,
              infractionsCount
            }),
            inline: false
          },
          {
            name: t('userinfo.fieldTrust'),
            value: trustFieldValue,
            inline: false
          },
          {
            name: t('userinfo.fieldRecent'),
            value: recentFieldValue,
            inline: false
          }
        )
        .setFooter({ text: t('userinfo.requestedBy', null, { tag: message.author.tag }) })
        .setTimestamp(new Date());

      await message.channel.send({ embeds: [embed] }).catch(() => null);

      const descLines = [
        t('log.actions.userinfo', null, {
          tag: user.tag,
          id: user.id,
          warnings,
          maxWarnings: config.maxWarnings ?? 3,
          infractionsCount,
          trust: trustCfg.enabled ? `${trustValue}/${trustCfg.max}` : 'N/A',
          riskLabel: trustCfg.enabled ? trustLabel : 'N/A'
        })
      ];

      await logger(client, 'User Info', user, message.author, descLines.join('\n'), guild);
    } catch (err) {
      console.error('[userinfo] Error:', err);
      await message.reply(t('common.unexpectedError')).catch(() => null);
    }
  }
};

