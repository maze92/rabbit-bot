// src/utils/staff.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');
const { getGuildConfig } = require('../systems/guildConfigService');

/**
 * Obtém a lista de roles de staff para uma guild:
 * 1) staffRoleIds configurados na GuildConfig (via dashboard)
 * 2) caso não exista, usa config.staffRoles (ex.: STAFF_ROLE_IDS no .env)
 */
async function getStaffRoleIdsForGuild(guildId) {
  if (!guildId) return [];

  // 1) GuildConfig (dashboard)
  try {
    const guildCfg = await getGuildConfig(guildId);
    if (guildCfg && Array.isArray(guildCfg.staffRoleIds) && guildCfg.staffRoleIds.length) {
      return guildCfg.staffRoleIds.map((id) => String(id));
    }
  } catch (err) {
    console.error('[Staff] Failed to load GuildConfig for staff roles:', err);
  }

  // 2) Fallback global (config)
  if (Array.isArray(config.staffRoles) && config.staffRoles.length) {
    return config.staffRoles.map((id) => String(id));
  }

  return [];
}

/**
 * Verifica se o membro é considerado STAFF.
 * Regra:
 *  - Administradores são sempre staff
 *  - Roles configuradas na dashboard (ou config.staffRoles) contam como staff
 */
async function isStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  const guild = member.guild;
  if (!guild) return false;

  const staffRoles = await getStaffRoleIdsForGuild(guild.id);
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id)) || false;
}

/**
 * Permissão para usar /ticket e /help.
 * Para simplificar e evitar mil variantes de permissões, usamos a mesma regra de STAFF:
 *  - Admin OU está na lista de roles de staff.
 */
async function canUseTicketOrHelp(member) {
  return isStaff(member);
}

/**
 * Alias de staff "forte". Neste momento é igual a isStaff,
 * mas mantemos separado para futura expansão se quiseres níveis diferentes.
 */
async function isHighStaff(member) {
  return isStaff(member);
}

module.exports = {
  isStaff,
  canUseTicketOrHelp,
  isHighStaff,
  getStaffRoleIdsForGuild
};
