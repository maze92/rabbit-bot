// src/slash/warn.js

const { PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const logger = require('../systems/logger');
const warningsService = require('../systems/warningsService');
const infractionsService = require('../systems/infractionsService');
const { t } = require('../systems/i18n');
const { isStaff } = require('./utils');

async function trySendDM(user, content) {
  try {
    if (!user || !content) return;
    await user.send({ content }).catch(() => null);
  } catch {
    // ignore
  }
}

module.exports = async function warnSlash(client, interaction) {
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

    const targetUser = interaction.options.getUser('user', true);
    const target = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) {
      return interaction.reply({ content: t('common.cannotResolveUser'), ephemeral: true }).catch(() => null);
    }

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: t('warn.cannotWarnSelf'), ephemeral: true }).catch(() => null);
    }

    if (target.id === client.user.id) {
      return interaction.reply({ content: t('warn.cannotWarnBot'), ephemeral: true }).catch(() => null);
    }

    if (target.roles.highest.position >= botMember.roles.highest.position) {
      return interaction.reply({ content: t('warn.roleHierarchyBot'), ephemeral: true }).catch(() => null);
    }

    const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
      return interaction.reply({ content: t('warn.roleHierarchyUser'), ephemeral: true }).catch(() => null);
    }

    if (!executorIsAdmin && target.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: t('warn.cannotWarnAdmin'), ephemeral: true }).catch(() => null);
    }

    const reason = (interaction.options.getString('reason') || '').trim() || t('common.noReason');
    const dbUser = await warningsService.addWarning(guild.id, target.id, 1);
    const baseMaxWarnings = config.maxWarnings ?? 3;

    await infractionsService
      .create({
        guild,
        user: target.user,
        moderator: interaction.user,
        type: 'WARN',
        reason,
        duration: null
      })
      .catch(() => null);

    await interaction.reply({
      content: t('warn.channelConfirm', null, {
        userMention: `${target}`,
        warnings: dbUser.warnings,
        maxWarnings: baseMaxWarnings,
        reason
      }),
      ephemeral: false
    }).catch(() => null);

    if (config.notifications?.dmOnWarn) {
      await trySendDM(
        target.user,
        t('warn.dmText', null, {
          guildName: guild.name,
          warnings: dbUser.warnings,
          maxWarnings: baseMaxWarnings,
          reason
        })
      );
    }

    await logger(
      client,
      'Slash Warn',
      target.user,
      interaction.user,
      t('log.actions.manualWarn', null, {
        reason,
        warnings: dbUser.warnings,
        maxWarnings: baseMaxWarnings,
        trust: dbUser.trust ?? 'N/A'
      }),
      guild
    );
  } catch (err) {
    console.error('[slash/warn] Error:', err);
    const payload = { content: t('common.unexpectedError'), ephemeral: true };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
    return interaction.reply(payload).catch(() => null);
  }
};
