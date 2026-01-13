// src/dashboard.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// Rota de teste
app.get('/health', (req, res) => {
  res.send('Bot is running ✅');
});

// Socket.io: comunicação em tempo real
io.on('connection', (socket) => {
  console.log('🔌 Novo cliente conectado à dashboard');

  // Exemplo de envio de mensagem de teste
  socket.emit('message', { content: 'Bem-vindo à dashboard!' });

  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado da dashboard');
  });
});

/**
 * Envia dados do bot para todos os clientes conectados
 * @param {string} eventName - Nome do evento
 * @param {any} data - Dados a enviar
 */
function sendToDashboard(eventName, data) {
  io.emit(eventName, data);
}

// Exporta app e função para uso no index.js
module.exports = {
  app,
  server,
  sendToDashboard
};
