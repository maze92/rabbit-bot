const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let logs = [];

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => {
  res.send('Bot is running ✅');
});

// Socket.io
io.on('connection', socket => {
  console.log('🔌 Dashboard client connected');

  socket.emit('logs', logs);

  socket.on('requestLogs', () => {
    socket.emit('logs', logs);
  });

  socket.on('disconnect', () => {
    console.log('❌ Dashboard client disconnected');
  });
});

/**
 * Envia logs para o dashboard
 */
function sendToDashboard(event, data) {
  if (event !== 'log') return;

  logs.push({
    ...data,
    timestamp: new Date().toISOString()
  });

  if (logs.length > 200) logs.shift();

  io.emit('logs', logs);
}

module.exports = {
  app,
  server,
  sendToDashboard
};
