// src/slash/unmute.js

const { PermissionsBitField } = require('discord.js');

const logger = require('../systems/logger');
const warningsService = require('../systems/warningsService');
const { t } = require('../systems/i18n');
const { isStaff } = require('./utils');

module.exports = async function unmuteSlash(client, interaction) {
  try {
    if (!interaction?.guild) return;
    const guild = interaction.guild;
    const executor = interaction.member;
    const botMember = guild.members.me;
    if (!executor || !botMember) {
      return interaction.reply({ content: t('common.unexpectedError'), ephemeral: true }).catch(() => null);
    }

    if (!isStaff(executor)) {
      return interaction.reply({ content: t('common.noPermission'), ephemeral: true }).catch(() => null);
    }

    const channelPerms = interaction.channel?.permissionsFor?.(botMember);
    if (!channelPerms?.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({ content: t('common.missingBotPerm', null, 'Moderate Members'), ephemeral: true }).catch(() => null);
    }

    const targetUser = interaction.options.getUser('user', true);
    const target = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) {
      return interaction.reply({ content: t('common.cannotResolveUser'), ephemeral: true }).catch(() => null);
    }

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: t('unmute.cannotUnmuteSelf'), ephemeral: true }).catch(() => null);
    }

    if (target.id === client.user.id) {
      return interaction.reply({ content: t('unmute.cannotUnmuteBot'), ephemeral: true }).catch(() => null);
    }

    const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);

    if (target.roles.highest.position >= botMember.roles.highest.position) {
      return interaction.reply({ content: t('unmute.roleHierarchyBot'), ephemeral: true }).catch(() => null);
    }

    if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
      return interaction.reply({ content: t('unmute.roleHierarchyUser'), ephemeral: true }).catch(() => null);
    }

    if (typeof target.isCommunicationDisabled === 'function' && !target.isCommunicationDisabled()) {
      return interaction.reply({ content: t('unmute.notMuted', null, { tag: target.user.tag }), ephemeral: true }).catch(() => null);
    }

    await target.timeout(null, `Unmuted by ${interaction.user.tag}`);

    await interaction.reply({ content: t('unmute.success', null, { tag: target.user.tag }), ephemeral: false }).catch(() => null);

    let dbUser = null;
    try {
      dbUser = await warningsService.getOrCreateUser(guild.id, target.id);
    } catch {
      // ignore
    }

    await logger(
      client,
      'Slash Unmute',
      target.user,
      interaction.user,
      t('log.actions.manualUnmute', null, {
        warnings: dbUser?.warnings ?? 0,
        trust: dbUser?.trust ?? 'N/A'
      }),
      guild
    );
  } catch (err) {
    console.error('[slash/unmute] Error:', err);
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content: t('unmute.failed'), ephemeral: true }).catch(() => null);
    }
    return interaction.reply({ content: t('unmute.failed'), ephemeral: true }).catch(() => null);
  }
};
