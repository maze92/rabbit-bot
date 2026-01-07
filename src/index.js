require('dotenv').config();
require('./database/connect'); // MongoDB

const client = require('./bot');

// ==============================
// Eventos (carregar APENAS UMA VEZ)
// ==============================
require('./events/ready')(client);
require('./events/messageCreate')(client);
require('./events/guildMemberAdd')(client);

client.login(process.env.TOKEN);

// ==============================
// Dashboard
// ==============================
const app = require('./dashboard');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT} 🚀`);
});

// ==============================
// Ping automático (opcional)
// ==============================
// No Railway, o projeto não precisa de ping para ficar ativo.
// Se quiser monitorar, você pode usar o próprio URL do dashboard Railway.
// const https = require('https');
// const RAILWAY_URL = 'https://your-project.up.railway.app';
// setInterval(() => {
//   https.get(RAILWAY_URL, () => {
//     console.log(`Pinged ${RAILWAY_URL} ⏱️`);
//   }).on('error', (err) => {
//     console.error('Ping error:', err.message);
//   });
// }, 5 * 60 * 1000); // 5 minutos

