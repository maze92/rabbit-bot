// src/utils/staff.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');
const { getGuildConfig } = require('../systems/guildConfigService');

// Regras específicas de permissões:
// - /ticket e /help: cargo 1447090621998305444 e acima disso
// - Outros comandos de staff: apenas cargos 1385619241235120177, 1385619241235120174, 1385619241235120173
const TICKET_HELP_BASE_ROLE_ID = '1447090621998305444';
const HIGH_STAFF_ROLE_IDS = [
  '1385619241235120177',
  '1385619241235120174',
  '1385619241235120173'
];

async function isStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  // Staff "forte"
  if (member.roles?.cache?.some((r) => HIGH_STAFF_ROLE_IDS.includes(r.id))) {
    return true;
  }

  const guild = member.guild;
  if (!guild) return false;

  let staffRoles = [];

  try {
    const guildCfg = await getGuildConfig(guild.id);
    if (guildCfg && Array.isArray(guildCfg.staffRoleIds) && guildCfg.staffRoleIds.length) {
      staffRoles = guildCfg.staffRoleIds.map((id) => String(id));
    }
  } catch (err) {
    console.error('[Staff] Failed to load GuildConfig for isStaff:', err);
  }

  if (!staffRoles.length) {
    staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles.map((id) => String(id)) : [];
  }

  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id)) || false;
}

function canUseTicketOrHelp(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  if (member.roles?.cache?.some((r) => HIGH_STAFF_ROLE_IDS.includes(r.id))) {
    return true;
  }

  const guild = member.guild;
  if (!guild || !guild.roles) return false;

  const baseRole = guild.roles.cache.get(TICKET_HELP_BASE_ROLE_ID);
  if (!baseRole) {
    return member.roles?.cache?.some((r) => r.id === TICKET_HELP_BASE_ROLE_ID) || false;
  }

  const minPosition = baseRole.position;
  return member.roles?.cache?.some((r) => r.position >= minPosition) || false;
}

function isHighStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  return member.roles?.cache?.some((r) => HIGH_STAFF_ROLE_IDS.includes(r.id)) || false;
}

module.exports = {
  isStaff,
  canUseTicketOrHelp,
  isHighStaff,
  TICKET_HELP_BASE_ROLE_ID,
  HIGH_STAFF_ROLE_IDS
};
