// src/systems/commands.js
const config = require('../config/defaultConfig');

module.exports = async (message, client) => {
  // Ignorar mensagens de bots ou DMs
  if (!message.guild || message.author.bot) return;

  const prefix = config.prefix || '!';

  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName);
  if (!command) return;

  // Verifica permissões do utilizador
  if (command.permissions && !message.member.permissions.has(command.permissions)) {
    return message.reply('❌ You do not have permission to use this command.');
  }

  try {
    await command.execute(message, args, client);
  } catch (err) {
    console.error(err);
    message.reply('❌ There was an error executing this command.');
  }
};
