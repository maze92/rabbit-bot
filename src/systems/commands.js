// src/systems/commands.js

const fs = require('fs');
const path = require('path');
const { PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const checkCooldown = require('./cooldowns');
const { t } = require('./i18n');

const commands = new Map();

const commandsDir = path.join(__dirname, '../commands');

let commandFiles = [];
try {
  commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'));
} catch (err) {
  console.error('[commands] Failed to read commands directory:', err);
}

for (const file of commandFiles) {
  const filePath = path.join(commandsDir, file);

  try {
    const cmd = require(filePath);

    if (!cmd?.name || typeof cmd.execute !== 'function') {
      console.warn(`[commands] Skipped invalid command file: ${file}`);
      continue;
    }

    const key = String(cmd.name).toLowerCase();
    commands.set(key, cmd);
    console.log(`[commands] Loaded command: ${key} (${file})`);
  } catch (err) {
    console.error(`[commands] Error loading command file ${file}:`, err);
  }
}

const STAFF_ONLY = new Set(['clear', 'warn', 'mute', 'unmute']);

function isStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (staffRoles.length === 0) return false;

  return member.roles.cache.some((role) => staffRoles.includes(role.id));
}

module.exports = async function commandsHandler(message, client) {
  try {
    if (!message?.guild) return;
    if (!message.author || message.author.bot) return;

    const content = message.content;
    if (!content || typeof content !== 'string') return;

    const prefix = config.prefix || '!';
    if (!content.startsWith(prefix)) return;

    let member = message.member;

    if (!member) {
      try {
        member = await message.guild.members.fetch(message.author.id);
      } catch {
        return message.reply(t('commands.couldNotVerifyRoles')).catch(() => null);
      }
    }

    const args = content.slice(prefix.length).trim().split(/\s+/);
    const commandName = (args.shift() || '').toLowerCase();
    if (!commandName) return;

    const command = commands.get(commandName);
    if (!command) {
      console.log(`[commands] Unknown command: "${commandName}" from ${message.author.tag}`);
      return;
    }

    console.log(
      `[commands] Command received: "${commandName}" from ${message.author.tag} (${message.author.id})`
    );

    const remaining = checkCooldown(commandName, message.author.id);
    if (remaining) {
      console.log(
        `[commands] Cooldown hit for "${commandName}" by ${message.author.tag}: ${remaining}s left`
      );
      return message.reply(t('common.slowDown', null, { seconds: remaining })).catch(() => null);
    }

    if (STAFF_ONLY.has(commandName)) {
      if (!isStaff(member)) {
        console.log(
          `[commands] Denied (no staff) for "${commandName}" by ${message.author.tag}`
        );
        return message.reply(t('common.noPermission')).catch(() => null);
      }
    }

    await command.execute(message, args, client);
  } catch (err) {
    console.error('[commands] Critical error:', err);
    message.reply(t('commands.execError')).catch(() => null);
  }
};
