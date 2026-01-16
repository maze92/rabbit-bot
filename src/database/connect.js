// src/database/connect.js

const mongoose = require('mongoose');
const status = require('../systems/status');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

// Evitar múltiplas ligações
let isConnecting = false;

async function connectMongo() {
  if (!uri) {
    console.error(
      '❌ Missing MongoDB URI. Set MONGO_URI (recommended) or MONGODB_URI in environment.'
    );
    status.setMongoConnected(false);
    return;
  }

  if (isConnecting) return;
  isConnecting = true;

  try {
    await mongoose.connect(uri);
    // Não logamos aqui — o evento "connected" trata disso
  } catch (err) {
    console.error('❌ MongoDB initial connection error:', err);
    status.setMongoConnected(false);
  }
}

// Eventos = single source of truth
mongoose.connection.on('connected', () => {
  console.log('🟢 MongoDB connected');
  status.setMongoConnected(true);
});

mongoose.connection.on('disconnected', () => {
  console.warn('🟠 MongoDB disconnected');
  status.setMongoConnected(false);
});

mongoose.connection.on('reconnected', () => {
  console.log('🟢 MongoDB reconnected');
  status.setMongoConnected(true);
});

mongoose.connection.on('error', (err) => {
  console.error('🔴 MongoDB error:', err);
  status.setMongoConnected(false);
});

// Iniciar ligação
connectMongo();

module.exports = mongoose;
