
// src/utils/modPermissions.js
//
// Central helpers for repeated moderation permission / hierarchy checks
// used by slash commands (warn, mute, unmute).

const { PermissionsBitField } = require('discord.js');
const { t } = require('../systems/i18n');
const { replyEphemeral } = require('./discord');

/**
 * Shared checks for /warn:
 * - cannot warn self
 * - cannot warn the bot
 * - target role must be below bot
 * - target role must be below executor (unless executor is admin)
 * - cannot warn admins if executor is not admin
 *
 * Returns:
 *   true  -> checks passed, caller may continue
 *   false -> reply was already sent to the interaction, caller must abort
 */
async function ensureWarnPermissions({ client, interaction, executor, target, botMember }) {
  if (!interaction || !executor || !target || !botMember) return false;

  // Self
  if (target.id === interaction.user.id) {
    await replyEphemeral(interaction, t('warn.cannotWarnSelf'));
    return false;
  }

  // Bot (self-bot)
  if (target.id === client.user.id) {
    await replyEphemeral(interaction, t('warn.cannotWarnBot'));
    return false;
  }

  // Target role vs bot role
  if (target.roles.highest.position >= botMember.roles.highest.position) {
    await replyEphemeral(interaction, t('warn.roleHierarchyBot'));
    return false;
  }

  const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);

  // Target role vs executor role
  if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
    await replyEphemeral(interaction, t('warn.roleHierarchyUser'));
    return false;
  }

  // Target is admin but executor is not
  if (!executorIsAdmin && target.permissions.has(PermissionsBitField.Flags.Administrator)) {
    await replyEphemeral(interaction, t('warn.cannotWarnAdmin'));
    return false;
  }

  return true;
}

/**
 * Shared checks for /mute:
 * - cannot mute self
 * - cannot mute the bot
 * - cannot mute generic bot users
 * - prevent duplicate mute if already timed out
 * - target role must be below bot
 * - target role must be below executor (unless executor is admin)
 * - cannot mute admins if executor is not admin
 *
 * Returns boolean as in ensureWarnPermissions.
 */
async function ensureMutePermissions({ client, interaction, executor, target, botMember }) {
  if (!interaction || !executor || !target || !botMember) return false;

  // Self
  if (target.id === interaction.user.id) {
    await replyEphemeral(interaction, t('mute.cannotMuteSelf'));
    return false;
  }

  // Bot (self-bot)
  if (target.id === client.user.id) {
    await replyEphemeral(interaction, t('mute.cannotMuteBot'));
    return false;
  }

  // Any bot user (bots não são para ser "mutados" via timeout)
  if (target.user.bot) {
    await replyEphemeral(interaction, t('mute.cannotMuteBotUser'));
    return false;
  }

  // Já está em timeout
    await replyEphemeral(interaction, t('mute.alreadyMuted', null, { tag: target.user.tag }));
    await replyEphemeral(interaction, t('mute.alreadyMuted'));
    return false;
  }

  const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);

  // Target role vs bot role
  if (target.roles.highest.position >= botMember.roles.highest.position) {
    await replyEphemeral(interaction, t('mute.roleHierarchyBot'));
    return false;
  }

  // Target role vs executor role
  if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
    await replyEphemeral(interaction, t('mute.roleHierarchyUser'));
    return false;
  }

  // Target is admin but executor is not
  if (!executorIsAdmin && target.permissions.has(PermissionsBitField.Flags.Administrator)) {
    await replyEphemeral(interaction, t('mute.cannotMuteAdmin'));
    return false;
  }

  return true;
}

/**
 * Shared checks for /unmute:
 * - cannot unmute self
 * - cannot unmute the bot
 * - target role must be below bot
 * - target role must be below executor (unless executor is admin)
 *
 * (Checks about "is or is not muted" continuam a viver no próprio comando.)
 */
async function ensureUnmutePermissions({ client, interaction, executor, target, botMember }) {
  if (!interaction || !executor || !target || !botMember) return false;

  // Self
  if (target.id === interaction.user.id) {
    await replyEphemeral(interaction, t('unmute.cannotUnmuteSelf'));
    return false;
  }

  // Bot (self-bot)
  if (target.id === client.user.id) {
    await replyEphemeral(interaction, t('unmute.cannotUnmuteBot'));
    return false;
  }

  const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);

  // Target role vs bot role
  if (target.roles.highest.position >= botMember.roles.highest.position) {
    await replyEphemeral(interaction, t('unmute.roleHierarchyBot'));
    return false;
  }

  // Target role vs executor role
  if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
    await replyEphemeral(interaction, t('unmute.roleHierarchyUser'));
    return false;
  }

  return true;
}

module.exports = {
  ensureWarnPermissions,
  ensureMutePermissions,
  ensureUnmutePermissions
};