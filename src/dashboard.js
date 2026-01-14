// src/dashboard.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => {
  res.send('Bot is running ✅');
});

// Socket.io: comunicação em tempo real
io.on('connection', (socket) => {
  console.log('🔌 New client connected to dashboard');

  // Envia status inicial do bot
  socket.emit('botStatus', { online: true });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected from dashboard');
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

module.exports = {
  app,
  server,
  sendToDashboard
};
