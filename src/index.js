// ------------------------------
// Carregamento de dependências
// ------------------------------
require('dotenv').config();            // Carrega variáveis de ambiente do .env
require('./database/connect');         // Conexão ao MongoDB

const path = require('path');
const fs = require('fs');
const client = require('./bot');       // Instância do Discord Client
const dashboard = require('./dashboard'); // Dashboard (HTTP + Socket.io)
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

// ------------------------------
// Sistema de Game News
// ------------------------------
const gameNews = require('./systems/gamenews');
gameNews(client, config).catch(err => {
  console.error('[GameNews] Error starting system:', err);
});

// ------------------------------
// Health Check (Rota para monitorar se o bot está online)
// ------------------------------
dashboard.app.get('/health', (req, res) => {
  res.send('Bot is running ✅');
});

// ------------------------------
// Exemplo de integração: enviar logs de eventos para o dashboard
// ------------------------------
// Se quiseres enviar eventos custom para o dashboard, podes fazer algo assim:
// const logger = require('./systems/logger');
// client.on('messageCreate', async (message) => {
//   await logger(client, 'Message Received', message.author, message.author, message.content, message.guild);
// });

