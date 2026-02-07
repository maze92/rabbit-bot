// src/utils/staff.js

const { PermissionsBitField } = require('discord.js');
const { getGuildConfig } = require('../systems/guildConfigService');

/**
 * Obtém a lista de roles de staff para uma guild,
 * baseada apenas na configuração gravada na base de dados (GuildConfig).
 *
 * Nota: isto significa que, a partir de agora, STAFF_ROLE_IDS/.env deixam
 * de ser usados como fallback em tempo de execução. Se precisares de
 * definir roles de staff, usa a aba "Acesso e cargos de staff" na dashboard.
 */
async function getStaffRoleIdsForGuild(guildId, feature) {
  if (!guildId) return [];

  try {
    const guildCfg = await getGuildConfig(guildId);

    // Feature-specific roles override the generic staffRoleIds list
    if (guildCfg && feature && guildCfg.staffRolesByFeature && Array.isArray(guildCfg.staffRolesByFeature[feature])) {
      const arr = guildCfg.staffRolesByFeature[feature].map((id) => String(id)).filter(Boolean);
      if (arr.length) return arr;
    }

    if (guildCfg && Array.isArray(guildCfg.staffRoleIds) && guildCfg.staffRoleIds.length) {
      return guildCfg.staffRoleIds.map((id) => String(id));
    }
  } catch (err) {
    console.error('[Staff] Failed to read GuildConfig for staff roles:', err);
  }

  return [];
}

/**
 * Verifica se o membro é considerado STAFF.
 * Regra:
 *  - Administradores são sempre staff
 *  - Roles configuradas na dashboard (GuildConfig.staffRoleIds) contam como staff
 */
async function isStaff(member, feature) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  const guild = member.guild;
  if (!guild) return false;

  const staffRoles = await getStaffRoleIdsForGuild(guild.id, feature);
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
