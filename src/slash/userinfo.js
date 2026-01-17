// src/slash/userinfo.js

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');
const warningsService = require('../systems/warningsService');
const Infraction = require('../database/models/Infraction');
const logger = require('../systems/logger');
const { t } = require('../systems/i18n');

function getTrustConfig() {
  const cfg = config.trust || {};
  return {
    enabled: cfg.enabled !== false,
    base: cfg.base ?? 30,
    min: cfg.min ?? 0,
    max: cfg.max ?? 100,
    lowThreshold: cfg.lowThreshold ?? 10,
    highThreshold: cfg.highThreshold ?? 60
  };
}

function getTrustLabel(trust, trustCfg) {
  if (!trustCfg.enabled) return 'N/A';
  const tt = Number.isFinite(trust) ? trust : trustCfg.base;
  if (tt <= trustCfg.lowThreshold) return 'High risk';
  if (tt >= trustCfg.highThreshold) return 'Low risk';
  return 'Medium risk';
}

function isStaff(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id));
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
    inf?.duration != null && Number.isFinite(Number(inf.duration)) && Number(inf.duration) > 0
      ? ` • ${Math.round(Number(inf.duration) / 60000)}m`
      : '';
  const ts = formatRelativeTime(inf?.createdAt);
  const reason = truncate(inf?.reason || t('common.noReason'), 80);

  return `• **${type}**${duration} — ${ts}\n  └ ${reason}`;
}

function joinFieldSafe(lines, maxLen = 1024) {
  const out = [];
  let total = 0;

  for (const line of lines) {
    const s = String(line);
    const add = (out.length ? 1 : 0) + s.length;
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

module.exports = async (client, interaction) => {
  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) return;

  const requesterIsStaff = isStaff(member);
  const trustCfg = getTrustConfig();

  const userOpt = interaction.options.getUser('user', false);
  const targetUser = userOpt || interaction.user;

  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    return interaction.editReply({ content: '❌ Could not resolve target.' }).catch(() => null);
  }

  const limitArg = interaction.options.getInteger('limit', false);
  const infractionsLimit =
    requesterIsStaff && Number.isFinite(limitArg)
      ? Math.min(Math.max(limitArg, 1), 20)
      : 5;

  const dbUser = await warningsService.getOrCreateUser(guild.id, targetUser.id);

  const warnings = dbUser?.warnings ?? 0;
  const trustValue = Number.isFinite(dbUser?.trust) ? dbUser.trust : trustCfg.base;
  const trustLabel = getTrustLabel(trustValue, trustCfg);

  let infractionsCount = 0;
  try {
    infractionsCount = await Infraction.countDocuments({ guildId: guild.id, userId: targetUser.id });
  } catch {}

  let recentInfractions = [];
  if (requesterIsStaff) {
    try {
      recentInfractions = await Infraction.find({ guildId: guild.id, userId: targetUser.id })
        .sort({ createdAt: -1 })
        .limit(infractionsLimit)
        .lean();
    } catch {
      recentInfractions = [];
    }
  }

  const createdAt = targetUser.createdAt
    ? `<t:${Math.floor(targetUser.createdAt.getTime() / 1000)}:F>`
    : 'Unknown';

  const joinedAt = targetMember.joinedAt
    ? `<t:${Math.floor(targetMember.joinedAt.getTime() / 1000)}:F>`
    : 'Unknown';

  let trustFieldValue = t('userinfo.trustDisabled');
  if (trustCfg.enabled) {
    trustFieldValue = requesterIsStaff
      ? `Trust: **${trustValue}/${trustCfg.max}**\nRisk level: **${trustLabel}**`
      : t('userinfo.trustInternal');
  }

  let recentFieldValue = t('userinfo.recentInfractionsStaffOnly');
  if (requesterIsStaff) {
    const lines = (recentInfractions || []).map(formatInfractionLine);
    recentFieldValue = joinFieldSafe(lines, 1024);
  }

  const embed = new EmbedBuilder()
    .setTitle(t('userinfo.title', null, targetUser.tag))
    .setColor('Blue')
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: t('userinfo.fields.user'), value: `Tag: **${targetUser.tag}**\nID: \`${targetUser.id}\``, inline: false },
      { name: t('userinfo.fields.account'), value: `Created at: ${createdAt}\nJoined this server: ${joinedAt}`, inline: false },
      {
        name: t('userinfo.fields.warnings'),
        value: `**${warnings}** / **${config.maxWarnings ?? 3}** (AutoMod base)\nInfractions registered: **${infractionsCount}**`,
        inline: false
      },
      { name: t('userinfo.fields.trust'), value: trustFieldValue, inline: false },
      { name: t('userinfo.fields.recent', null, infractionsLimit), value: recentFieldValue, inline: false }
    )
    .setTimestamp(new Date());

  await interaction.editReply({ embeds: [embed] }).catch(() => null);

  // log interno
  const descLines = [
    `Requested info for: **${targetUser.tag}** (\`${targetUser.id}\`)`,
    `Warnings: **${warnings}/${config.maxWarnings ?? 3}**`,
    `Infractions registered: **${infractionsCount}**`
  ];

  if (trustCfg.enabled) {
    descLines.push(`Trust: **${trustValue}/${trustCfg.max}**`, `Risk level: **${trustLabel}**`);
  }

  if (requesterIsStaff && recentInfractions.length) {
    descLines.push(
      `Recent infractions (last ${Math.min(infractionsLimit, recentInfractions.length)}):`,
      ...recentInfractions.map((i) => `- ${String(i.type || 'UNKNOWN').toUpperCase()}: ${truncate(i.reason, 80)}`)
    );
  }

  await logger(client, 'Slash User Info', targetUser, interaction.user, descLines.join('\n'), guild);
};
