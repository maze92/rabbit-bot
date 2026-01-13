require('dotenv').config();
require('./database/connect');

const path = require('path');
const fs = require('fs');
const client = require('./bot');

// Comandos
client.commands = new Map();
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(__dirname, 'commands', file));
  client.commands.set(command.name, command);
  console.log(`✅ Loaded command: ${command.name}`);
}

// Eventos
require('./events/ready')(client);
require('./events/messageCreate')(client);
require('./events/guildMemberAdd')(client);

// Dashboard
const { server } = require('./dashboard');

// Porta da dashboard
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Dashboard rodando na porta ${PORT}`);

// Login Discord
client.login(process.env.TOKEN);

