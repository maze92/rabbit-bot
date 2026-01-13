const config = require('../config/defaultConfig');
const checkCooldown = require('./cooldowns');

module.exports = async function commands(message, client) {
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content
    .slice(config.prefix.length)
    .trim()
    .split(/\s+/);

  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);

  if (!command) return;

  // Cooldown
  const cooldown = checkCooldown(commandName, message.author.id);
  if (cooldown) {
    return message.reply(
      `⏳ Please wait **${cooldown}s** before using this command again.`
    );
  }

  // Permissões por cargo
  if (command.allowedRoles?.length) {
    const hasRole = message.member.roles.cache.some(r =>
      command.allowedRoles.includes(r.id)
    );

    if (!hasRole) {
      return message.reply('❌ You do not have permission to use this command.');
    }
  }

  await command.execute(message, client, args);
};
