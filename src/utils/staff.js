// src/utils/staff.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');
const { getGuildConfig } = require('../systems/guildConfigService');

/**
 * Returns true if the member is considered "staff".
 * - Administrators are always staff
 * - Otherwise, member must have one of the configured staff role IDs
 *   from GuildConfig or, as a fallback, from global config.staffRoles.
 */
async function isStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  const guildId = member.guild?.id;
  let staffRoles = [];

  if (guildId) {
    try {
      const guildCfg = await getGuildConfig(guildId);
      if (guildCfg && Array.isArray(guildCfg.staffRoleIds) && guildCfg.staffRoleIds.length > 0) {
        staffRoles = guildCfg.staffRoleIds.map((id) => String(id));
      }
    } catch (err) {
      console.error('[Staff] Failed to load GuildConfig for isStaff:', err);
    }
  }

  if (!staffRoles.length) {
    staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  }

  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id)) || false;
}

module.exports = { isStaff };
