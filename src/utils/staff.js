// src/utils/staff.js

const { PermissionsBitField } = require('discord.js');
const { getGuildConfig } = require('../systems/guildConfigService');

// Small TTL cache to avoid hitting Mongo on every permission check.
// Key: `${guildId}:${feature||''}` -> { exp:number, roles:string[] }
const _rolesCache = new Map();
const CACHE_TTL_MS = 30_000;

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

  const cacheKey = `${String(guildId)}:${feature ? String(feature) : ''}`;
  const cached = _rolesCache.get(cacheKey);
  if (cached && cached.exp > Date.now() && Array.isArray(cached.roles)) {
    return cached.roles;
  }

  try {
    const guildCfg = await getGuildConfig(guildId);

    // Feature-specific roles override the generic staffRoleIds list
    if (guildCfg && feature && guildCfg.staffRolesByFeature && Array.isArray(guildCfg.staffRolesByFeature[feature])) {
      const arr = guildCfg.staffRolesByFeature[feature].map((id) => String(id)).filter(Boolean);
      if (arr.length) {
        _rolesCache.set(cacheKey, { exp: Date.now() + CACHE_TTL_MS, roles: arr });
        return arr;
      }
    }

    if (guildCfg && Array.isArray(guildCfg.staffRoleIds) && guildCfg.staffRoleIds.length) {
      const roles = guildCfg.staffRoleIds.map((id) => String(id));
      _rolesCache.set(cacheKey, { exp: Date.now() + CACHE_TTL_MS, roles });
      return roles;
    }
  } catch (err) {
    console.error('[Staff] Failed to read GuildConfig for staff roles:', err);
  }

  // Cache empty results briefly to avoid repeated DB hits when no staff is configured.
  _rolesCache.set(cacheKey, { exp: Date.now() + CACHE_TTL_MS, roles: [] });
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
  // Help/ticket access is governed by the Tickets staff roles.
  return isStaff(member, 'tickets');
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
