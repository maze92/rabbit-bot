// src/commands/userinfo.js

const { EmbedBuilder, PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const warningsService = require('../systems/warningsService');
const Infraction = require('../database/models/Infraction');
const logger = require('../systems/logger');

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

  const t = Number.isFinite(trust) ? trust : trustCfg.base;

  if (t <= trustCfg.lowThreshold) return 'High risk';
  if (t >= trustCfg.highThreshold) return 'Low risk';
  return 'Medium risk';
}

function isStaff(member) {
  if (!member) return false;

  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id));
}

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
  if (!s) return 'No reason provided';
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
  const reason = truncate(inf?.reason || 'No reason provided', 80);

  return `• **${type}**${duration} — ${ts}\n  └ ${reason}`;
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
    // tenta adicionar reticências se couber
    const ell = '…';
    if (total + (out.length ? 1 : 0) + ell.length <= maxLen) out.push(ell);
  }

  return out.join('\n') || 'No recent infractions found.';
}

module.exports = {
  name: 'userinfo',
  description: 'Shows information about a user, including warnings and trust score (trust visible to staff only)',

  async execute(message, args, client) {
    try {
      if (!message?.guild) return;

      const guild = message.guild;
      const trustCfg = getTrustConfig();
      const requesterIsStaff = isStaff(message.member);

      const member = await resolveTarget(message, args);
      if (!member?.user) {
        return message.reply('❌ I could not resolve that user.').catch(() => null);
      }

      const user = member.user;

      const dbUser = await warningsService.getOrCreateUser(guild.id, user.id);

      const warnings = dbUser?.warnings ?? 0;
      const trustValue = Number.isFinite(dbUser?.trust) ? dbUser.trust : trustCfg.base;
      const trustLabel = getTrustLabel(trustValue, trustCfg);

      let infractionsCount = 0;
      try {
        infractionsCount = await Infraction.countDocuments({
          guildId: guild.id,
          userId: user.id
        });
      } catch {
        // ignore
      }

      let recentInfractions = [];
      if (requesterIsStaff) {
        try {
          recentInfractions = await Infraction.find({
            guildId: guild.id,
            userId: user.id
          })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();
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

      let trustFieldValue = 'Trust system is currently **disabled**.';
      if (trustCfg.enabled) {
        if (requesterIsStaff) {
          trustFieldValue =
            `Trust: **${trustValue}/${trustCfg.max}**\n` +
            `Risk level: **${trustLabel}**`;
        } else {
          trustFieldValue =
            'Trust Score is **internal** and only visible to staff.\n' +
            'Moderation decisions may be stricter for repeat offenders.';
        }
      }

      let recentFieldValue = 'Recent infraction details are **visible to staff only**.';
      if (requesterIsStaff) {
        const lines = (recentInfractions || []).map(formatInfractionLine);
        recentFieldValue = joinFieldSafe(lines, 1024);
      }

      const embed = new EmbedBuilder()
        .setTitle(`User Info - ${user.tag}`)
        .setColor('Blue')
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          {
            name: '👤 User',
            value: `Tag: **${user.tag}**\nID: \`${user.id}\``,
            inline: false
          },
          {
            name: '📅 Account',
            value: `Created at: ${createdAt}\nJoined this server: ${joinedAt}`,
            inline: false
          },
          {
            name: '⚠️ Warnings',
            value:
              `**${warnings}** / **${config.maxWarnings ?? 3}** (AutoMod base)\n` +
              `Infractions registered: **${infractionsCount}**`,
            inline: false
          },
          {
            name: '🔐 Trust Score',
            value: trustFieldValue,
            inline: false
          },
          {
            name: '🧾 Recent infractions (last 5)',
            value: recentFieldValue,
            inline: false
          }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp(new Date());

      await message.channel.send({ embeds: [embed] }).catch(() => null);

      const descLines = [
        `Requested info for: **${user.tag}** (\`${user.id}\`)`,
        `Warnings: **${warnings}/${config.maxWarnings ?? 3}**`,
        `Infractions registered: **${infractionsCount}**`
      ];

      if (trustCfg.enabled) {
        descLines.push(
          `Trust: **${trustValue}/${trustCfg.max}**`,
          `Risk level: **${trustLabel}**`
        );
      }

      if (requesterIsStaff && recentInfractions.length) {
        descLines.push(
          `Recent infractions (last ${Math.min(5, recentInfractions.length)}):`,
          ...recentInfractions.map(
            (i) => `- ${String(i.type || 'UNKNOWN').toUpperCase()}: ${truncate(i.reason, 80)}`
          )
        );
      }

      await logger(
        client,
        'User Info',
        user,
        message.author,
        descLines.join('\n'),
        guild
      );
    } catch (err) {
      console.error('[userinfo] Error:', err);
      await message
        .reply('❌ An unexpected error occurred while fetching user info.')
        .catch(() => null);
    }
  }
};
