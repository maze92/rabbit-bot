// src/utils/staff.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

/**
 * Returns true if the member is considered "staff".
 * - Administrators are always staff
 * - Otherwise, member must have one of the configured staff role IDs
 */
function isStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id)) || false;
}

module.exports = { isStaff };
