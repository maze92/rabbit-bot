// src/dashboard.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// ------------------------------
// Configuração do Express e HTTP
// ------------------------------
const app = express();
const server = http.createServer(app);

// Inicializa Socket.IO para comunicação em tempo real
const io = new Server(server);

// ------------------------------
// Armazena os logs para o dashboard
// ------------------------------
let logs = [];

// ------------------------------
// Servir arquivos estáticos (HTML, CSS, JS do frontend)
// ------------------------------
app.use(express.static(path.join(__dirname, '../public')));

// ------------------------------
// Health check
// Endpoint para verificar se o bot está online
// ------------------------------
app.get('/health', (req, res) => {
  res.send('Bot is running ✅');
});

// ------------------------------
// Socket.IO: comunicação em tempo real
// ------------------------------
io.on('connection', socket => {
  console.log('🔌 Dashboard client connected');

  // Envia todos os logs atuais quando um cliente se conecta
  socket.emit('logs', logs);

  // Permite que o frontend solicite logs a qualquer momento
  socket.on('requestLogs', () => {
    socket.emit('logs', logs);
  });

  socket.on('disconnect', () => {
    console.log('❌ Dashboard client disconnected');
  });
});

// ------------------------------
// Função para enviar logs para todos os clientes conectados
// ------------------------------
function sendToDashboard(event, data) {
  // Apenas eventos do tipo 'log' serão processados
  if (event !== 'log') return;

  // Adiciona timestamp e armazena no array de logs
  logs.push({
    ...data,
    timestamp: new Date().toISOString()
  });

  // Mantém o histórico limitado a 200 logs
  if (logs.length > 200) logs.shift();

  // Emite os logs atualizados para todos os clientes conectados
  io.emit('logs', logs);
}

// ------------------------------
// Exporta app, server e função de envio para dashboard
// ------------------------------
module.exports = {
  app,
  server,
  sendToDashboard
};
