// src/slash/warn.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');

const logger = require('../systems/logger');
const warningsService = require('../systems/warningsService');
const infractionsService = require('../systems/infractionsService');

function isStaff(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id));
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
  const member = interaction.member;
  if (!guild || !member) return;

  if (!isStaff(member)) {
    return interaction.editReply({ content: t('common.noPermission') }).catch(() => null);
  }

  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason')?.trim() || t('common.noReason');

  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  const botMember = guild.members.me;

  if (!targetMember || !botMember) {
    return interaction.editReply({ content: '❌ Could not resolve target.' }).catch(() => null);
  }

  if (targetMember.id === interaction.user.id) {
    return interaction.editReply({ content: t('warn.cannotWarnSelf') }).catch(() => null);
  }
  if (targetMember.id === client.user.id) {
    return interaction.editReply({ content: t('warn.cannotWarnBot') }).catch(() => null);
  }

  if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
    return interaction.editReply({ content: t('warn.hierarchyBot') }).catch(() => null);
  }

  const executorIsAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (!executorIsAdmin && targetMember.roles.highest.position >= member.roles.highest.position) {
    return interaction.editReply({ content: t('warn.hierarchyYou') }).catch(() => null);
  }

  if (!executorIsAdmin && targetMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.editReply({ content: t('warn.cannotWarnAdmin') }).catch(() => null);
  }

  const dbUser = await warningsService.addWarning(guild.id, targetMember.id, 1);

  await infractionsService
    .create({
      guild,
      user: targetMember.user,
      moderator: interaction.user,
      type: 'WARN',
      reason,
      duration: null
    })
    .catch(() => null);

  // mensagem pública (canal): sem trust
  await interaction.channel
    ?.send(
      t('warn.warnedPublic', null, {
        mention: `${targetMember}`,
        warnings: dbUser.warnings,
        reason
      })
    )
    .catch(() => null);

  // DM ao user: sem trust
  if (config.notifications?.dmOnWarn) {
    await trySendDM(
      targetMember.user,
      t('warn.warnedDM', null, {
        guildName: guild.name,
        warnings: dbUser.warnings,
        reason
      })
    );
  }

  // log interno: com trust
  await logger(
    client,
    'Slash Warn',
    targetMember.user,
    interaction.user,
    `Reason: **${reason}**\nTotal warnings: **${dbUser.warnings}**\nTrust: **${dbUser.trust ?? 'N/A'}**`,
    guild
  );

  return interaction.editReply({ content: '✅ Done.' }).catch(() => null);
};
