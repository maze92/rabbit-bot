require('dotenv').config();            // Carrega variáveis de ambiente do .env
require('./database/connect');         // Conexão ao MongoDB

const path = require('path');
const fs = require('fs');
const client = require('./bot');       // Instância do Discord Client
const dashboard = require('./dashboard'); // Dashboard do bot (HTTP + Socket.IO)
const config = require('./config/defaultConfig');

// ------------------------------
// Carregar Comandos
// ------------------------------
client.commands = new Map();
const commandFiles = fs
  .readdirSync(path.join(__dirname, 'commands'))
  .filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(__dirname, 'commands', file));
  client.commands.set(command.name, command);
  console.log(`✅ Loaded command: ${command.name}`);
}

// ------------------------------
// Carregar Eventos
// ------------------------------
require('./events/ready')(client);
require('./events/messageCreate')(client);
require('./events/guildMemberAdd')(client);

// ------------------------------
// Login do Bot
// ------------------------------
client.login(process.env.TOKEN);

// ------------------------------
// Dashboard do Bot
// ------------------------------
const PORT = process.env.PORT || 3000;
dashboard.server.listen(PORT, () => {
  console.log(`🚀 Dashboard running on port ${PORT}`);
});

// Health Check
dashboard.app.get('/health', (req, res) => {
  res.send('Bot is running ✅');
});

// ------------------------------
// Sistema Game News
// ------------------------------
const gameNews = require('./systems/gamenews');
gameNews(client, config).catch(err => {
  console.error('[GameNews] Error starting system:', err);
});
