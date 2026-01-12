require('dotenv').config();
require('./database/connect'); // Conexão MongoDB

const path = require('path');
const fs = require('fs');
const client = require('./bot');

// ==============================
// Inicializar Commands Map
// ==============================
client.commands = new Map();

// Caminho correto para a pasta de comandos
const commandPath = path.join(__dirname, 'commands');

// Ler todos os ficheiros JS dentro de /commands
const commandFiles = fs
  .readdirSync(commandPath)
  .filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandPath, file));
  client.commands.set(command.name, command);
  console.log(`✅ Loaded command: ${command.name}`);
}

// ==============================
// Eventos
// ==============================
// ready, messageCreate e guildMemberAdd
require('./events/ready')(client);
require('./events/messageCreate')(client);
require('./events/guildMemberAdd')(client);

// ==============================
// Login do bot
// ==============================
client.login(process.env.TOKEN);

// ==============================
// Dashboard (Health check)
// ==============================
const app = require('./dashboard');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Dashboard running on port ${PORT}`);
});

