const warningsService = require('../systems/warningsService');
const infractionsService = require('../systems/infractionsService');
const logger = require('../systems/logger');
const { handleInfractionAutomation } = require('../systems/automation');
const { getTrustConfig } = require('../utils/trust');

class ModError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/**
 * Resolve guild + member from client cache.
 * @param {impor'discord.js'.Client} client
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<{ guild: impor'discord.js'.Guild|null, member: impor'discord.js'.GuildMember|null }>}
 */
async function resolveGuildMember(client, guildId, userId) {
  if (!client) return { guild: null, member: null };
  const guild = client.guilds.cache.get(guildId) || null;
  if (!guild) return { guild: null, member: null };
  const member = await guild.members.fetch(userId).catch(() => null);
  return { guild, member };
}

/**
 * Dashboard-triggered warn.
 * Implementa a mesma lógica da rota /api/mod/warn, mas agnóstica de HTTP.
 *
 * @param {object} params
 * @param {impor'discord.js'.Client} params.client
 * @param {string} params.guildId
 * @param {string} params.userId
 * @param {string} [params.reason]
 * @param {string|null} [params.actor] - nome de quem executa via dashboard (para logs)
 * @returns {Promise<{ guild, member, dbUser }>}
 */
async function dashboardWarn({ client, guildId, userId, reason, actor }) {
  if (!client) {
    throw new ModError('CLIENT_NOT_READY', 'Client not ready');
  }

  const r = (reason || '').toString().trim() || 'Dashboard warning';

  const { guild, member } = await resolveGuildMember(client, guildId, userId);
  if (!guild || !member) {
    throw new ModError('USER_NOT_FOUND_IN_GUILD', 'User not found in guild');
  }

  const me = guild.members.me;
  if (!me) {
    throw new ModError('BOT_MEMBER_NOT_AVAILABLE', 'Bot member not available');
  }

  // Regras semelhantes ao comando !warn
  if (member.id === me.id) {
    throw new ModError('CANNOT_WARN_BOT', 'Cannot warn the bot');
  }

  if (member.roles.highest.position >= me.roles.highest.position) {
    throw new ModError('TARGET_ROLE_HIGHER_OR_EQUAL', 'Target role is higher or equal to bot');
  }

  const { PermissionsBitField } = require('discord.js');
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    throw new ModError('CANNOT_WARN_ADMINS', 'Cannot warn administrators via dashboard');
  }

  const dbUser = await warningsService.addWarning(guild.id, member.id, 1).catch(() => null);

  await infractionsService.create({
    guild,
    user: member.user,
    moderator: client.user,
    type: 'WARN',
    reason: actor ? `${r} (dashboard: ${actor})` : r,
    duration: null,
    source: 'dashboard'
  }).catch(() => null);

  // Automação (auto-mute / auto-kick) baseada nas infrações acumuladas, tal como nos comandos slash
  try {
    await handleInfractionAutomation({
      client,
      guild,
      user: member.user,
      moderator: client.user,
      type: 'WARN'
    });
  } catch {
    // ignore automation errors to not quebrar o fluxo principal de warn
  }

  const trustCfg = getTrustConfig();
  const trust = dbUser?.trust;
  const warnings = dbUser?.warnings ?? null;

  const trustText = (trustCfg.enabled && trust != null)
    ? `Trust: **${trust}/${trustCfg.max}**`
    : (trust != null ? `Trust: **${trust}**` : '');
  const warnsText = warnings != null ? `Warnings: **${warnings}**` : '';

  const trustTextLog = trustText ? `\n${trustText}` : '';
  const warnsTextLog = warnsText ? `\n${warnsText}` : '';

  await logger(
    client,
    'Dashboard Warn',
    member.user,
    client.user,
    `Reason: **${r}**${warnsTextLog}${trustTextLog}` + (actor ? `\nExecutor (dashboard): **${actor}**` : ''),
    guild
  );

  return { guild, member, dbUser };
}

module.exports = {
  ModError,
  dashboardWarn,
  resolveGuildMember
};
