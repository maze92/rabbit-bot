// src/index.js
require('dotenv').config();            // Carrega variáveis de ambiente do .env
require('./database/connect');         // Conexão ao MongoDB

const path = require('path');
const fs = require('fs');

const client = require('./bot');        // Instância do Discord Client
const dashboard = require('./dashboard'); // Dashboard do bot (HTTP + Socket.io)
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
require('./events/ready')(client);          // Evento ready
require('./events/messageCreate')(client);  // Evento messageCreate
require('./events/guildMemberAdd')(client); // Evento guildMemberAdd

// ------------------------------
// Login do Bot
// ------------------------------
client.login(process.env.TOKEN);

// ------------------------------
// Dashboard do bot
// ------------------------------
const PORT = process.env.PORT || 3000;
dashboard.server.listen(PORT, () => {
  console.log(`🚀 Dashboard running on port ${PORT}`);
});

// Notifica dashboard que o bot está online
dashboard.sendToDashboard('botStatus', { online: true });

// ------------------------------
// Sistema Game News
// ------------------------------
const gameNews = require('./systems/gamenews');
gameNews(client, config).catch(err => {
  console.error('[GameNews] Erro ao iniciar o sistema:', err);
});

// ------------------------------
// Health Check (Rota para verificar se o bot está online)
// ------------------------------
dashboard.app.get('/health', (req, res) => {
  res.send('Bot is running ✅');
});

// ------------------------------
// Auto-Recovery
// ------------------------------
process.on('uncaughtException', err => {
  console.error('[CRASH] Uncaught Exception:', err);
  dashboard.sendToDashboard('botStatus', { online: false });
  process.exit(1); // PM2 irá reiniciar
});

process.on('unhandledRejection', err => {
  console.error('[CRASH] Unhandled Rejection:', err);
  dashboard.sendToDashboard('botStatus', { online: false });
});
