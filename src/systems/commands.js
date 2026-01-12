const fs = require('fs');
const path = require('path');
const config = require('../config/defaultConfig');

const commands = new Map();

// Carregar todos os comandos
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  commands.set(command.name, command);
}

module.exports = async (message, client) => {
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();

  const command = commands.get(commandName);
  if (!command) return;

  // ==============================
  // Verificação de permissões por cargo
  // ==============================
  if (command.allowedRoles) {
    const hasRole = message.member.roles.cache.some(role =>
      command.allowedRoles.includes(role.id)
    );

    if (!hasRole) {
      return message.reply("❌ You don't have permission to use this command.");
    }
  }

  // Executar o comando
  try {
    await command.execute(message, client, args);
  } catch (err) {
    console.error(`Error executing command ${commandName}:`, err);
    message.reply('⚠️ There was an error executing that command.');
  }
};
