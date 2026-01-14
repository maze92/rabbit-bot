// src/dashboard.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Initialize Express
const app = express();

// Create HTTP server from Express
const server = http.createServer(app);

// Initialize Socket.io for real-time communication
const io = new Server(server);

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '../public')));

// Health check route
app.get('/health', (req, res) => {
  res.send('Bot is running ✅');
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('🔌 New client connected to the dashboard');

  // Send a welcome message
  socket.emit('message', { content: 'Welcome to the dashboard!' });

  // Disconnect event
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected from the dashboard');
  });
});

// Function to send events to all connected clients
// @param {string} eventName - Name of the event
// @param {any} data - Data to send
function sendToDashboard(eventName, data) {
  io.emit(eventName, data);
}

// Export app, server, and send function
module.exports = {
  app,
  server,
  sendToDashboard
};
