// src/dashboard.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config/defaultConfig');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Logs mantidos em memória (para o dashboard)
let logs = [];

// Quantos logs guardar (configurável)
const MAX_LOGS = Number(config.dashboard?.maxLogs ?? 200);

// Static files (public)
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('Bot is running ✅');
});

// Socket.io
io.on('connection', (socket) => {
  console.log('🔌 Dashboard client connected');

  // Envia os logs atuais ao conectar
  socket.emit('logs', logs);

  // O frontend pode pedir logs (polling)
  socket.on('requestLogs', () => {
    socket.emit('logs', logs);
  });

  socket.on('disconnect', () => {
    console.log('❌ Dashboard client disconnected');
  });
});

/**
 * Envia logs para o dashboard
 * @param {string} event - deve ser 'log'
 * @param {object} data - payload do log
 */
function sendToDashboard(event, data) {
  if (event !== 'log') return;

  // Garantir timestamp consistente
  const payload = {
    ...data,
    time: data?.time || new Date().toISOString()
  };

  logs.push(payload);

  // Limitar tamanho do array (evita memory leak)
  if (logs.length > MAX_LOGS) logs.shift();

  io.emit('logs', logs);
}

module.exports = {
  app,
  server,
  sendToDashboard
};
