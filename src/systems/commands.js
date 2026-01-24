// src/systems/commands.js

const fs = require('fs');
const path = require('path');

const config = require('../config/defaultConfig');
const checkCooldown = require('./cooldowns');
const { t } = require('./i18n');
const { isStaff } = require('../utils/staff');
const { incrementCommands } = require('./status');

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

// Staff-only commands (global gate)
const STAFF_ONLY = new Set(['warn', 'mute', 'unmute']);
// NOTE: "clear" is NOT staff-only here, because clear.js already checks ManageMessages permission.
// If you want "clear" staff-only, add it back: STAFF_ONLY.add('clear');

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
      // silent ignore (optional)
      return;
    }

    const remaining = checkCooldown(commandName, message.author.id);
    if (remaining) {
      return message.reply(t('common.slowDown', null, { seconds: remaining })).catch(() => null);
    }

    if (STAFF_ONLY.has(commandName)) {
      if (!(await isStaff(member))) {
        return message.reply(t('common.noPermission')).catch(() => null);
      }
    }

    incrementCommands();
    await command.execute(message, args, client);
  } catch (err) {
    console.error('[commands] Critical error:', err);
    message.reply(t('commands.execError')).catch(() => null);
  }
};
