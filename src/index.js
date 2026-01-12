require('dotenv').config();
require('./database/connect'); // Conexão MongoDB

const path = require('path');
const fs = require('fs');
const client = require('./bot');

// ==============================
// Inicializar Commands Map
// ==============================
client.commands = new Map();

// Carregar comandos do /src/commands
const commandFiles = fs
  .readdirSync(path.join(__dirname, 'src', 'commands'))
  .filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(__dirname, 'src', 'commands', file));
  client.commands.set(command.name, command);
  console.log(`Loaded command: ${command.name}`);
}

// ==============================
// Eventos
// ==============================
require('./events/ready')(client);
require('./events/messageCreate')(client);
require('./events/guildMemberAdd')(client);

// ==============================
// Login
// ==============================
client.login(process.env.TOKEN);

// ==============================
// Dashboard (Health check)
// ==============================
const app = require('./dashboard');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT} 🚀`);
});

