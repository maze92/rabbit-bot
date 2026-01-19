// src/slash/unmute.js

const { PermissionsBitField } = require('discord.js');

const logger = require('../systems/logger');
const warningsService = require('../systems/warningsService');
const { t } = require('../systems/i18n');
const { isStaff } = require('./utils');

// 64 = Ephemeral flag
function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: 64 }).catch(() => null);
}

module.exports = async function unmuteSlash(client, interaction) {
  try {
    if (!interaction?.guild) return;

    const guild = interaction.guild;
    const executor = interaction.member;
    const botMember = guild.members.me;

    if (!executor || !botMember) {
      return replyEphemeral(interaction, t('common.unexpectedError'));
    }

    if (!(await isStaff(executor)) {
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

    if (target.id === interaction.user.id) {
      return replyEphemeral(interaction, t('unmute.cannotUnmuteSelf'));
    }

    if (target.id === client.user.id) {
      return replyEphemeral(interaction, t('unmute.cannotUnmuteBot'));
    }

    const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);

    if (target.roles.highest.position >= botMember.roles.highest.position) {
      return replyEphemeral(interaction, t('unmute.roleHierarchyBot'));
    }

    if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
      return replyEphemeral(interaction, t('unmute.roleHierarchyUser'));
    }

    if (typeof target.isCommunicationDisabled === 'function' && !target.isCommunicationDisabled()) {
      return replyEphemeral(
        interaction,
        t('unmute.notMuted', null, { tag: target.user.tag })
      );
    }

    await target.timeout(null, `Unmuted by ${interaction.user.tag}`);

    // Resposta pública (default)
    await interaction
      .reply({ content: t('unmute.success', null, { tag: target.user.tag }) })
      .catch(() => null);

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

    const payload = { content: t('unmute.failed'), flags: 64 };

    if (interaction.deferred || interaction.replied) {
      return interaction.followUp(payload).catch(() => null);
    }
    return interaction.reply(payload).catch(() => null);
  }
};
