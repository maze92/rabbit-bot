// src/database/connect.js

const mongoose = require('mongoose');
const status = require('../systems/status');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

// Evitar múltiplas ligações / tentativas em paralelo
let isConnecting = false;
let isShuttingDown = false;
let retryTimer = null;
let retryAttempts = 0;
const MAX_RETRY_DELAY_MS = 30_000;

async function connectMongo() {
  if (!uri) {
    console.error('❌ Missing MongoDB URI. Set MONGO_URI (recommended) or MONGODB_URI in environment.');
    status.setMongoConnected(false);
    return;
  }

  if (isShuttingDown) return;

  // 1 = connected, 2 = connecting
  if (mongoose.connection.readyState === 1) {
    status.setMongoConnected(true);
    return;
  }

  if (isConnecting || retryTimer || mongoose.connection.readyState === 2) {
    return;
  }

  isConnecting = true;

  try {
    await mongoose.connect(uri, {
      autoIndex: false,
      maxPoolSize: 10
    });

    retryAttempts = 0;
    status.setMongoConnected(true);
    console.log('🟢 MongoDB connected');
  } catch (err) {
    status.setMongoConnected(false);
    console.error('🔴 MongoDB connection error:', err);

    retryAttempts += 1;
    const delay = Math.min(1000 * 2 ** (retryAttempts - 1), MAX_RETRY_DELAY_MS);
    console.log(`⏳ Retry MongoDB connection in ${Math.round(delay / 1000)}s (attempt ${retryAttempts})`);

    if (!isShuttingDown) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connectMongo().catch(() => null);
      }, delay);
      retryTimer.unref?.();
    }
  } finally {
    isConnecting = false;
  }
}

async function closeMongo() {
  isShuttingDown = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  try {
    if (mongoose.connection.readyState === 0) return;
    await mongoose.connection.close(false);
    status.setMongoConnected(false);
    console.log('🟡 MongoDB connection closed');
  } catch (err) {
    console.error('🔴 Error closing MongoDB connection:', err);
  }
}

mongoose.connection.on('connected', () => {
  console.log('🟢 MongoDB connected (event)');
  status.setMongoConnected(true);
});

// After the initial connection the MongoDB driver reconnects on its own;
// scheduling extra connect() calls here would only race with it.
mongoose.connection.on('disconnected', () => {
  status.setMongoConnected(false);
  if (isShuttingDown) return;
  console.warn('🟡 MongoDB disconnected. The driver will attempt to reconnect...');
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
connectMongo().catch(() => null);

module.exports = mongoose;
// Expor helpers explícitos para shutdown / health
module.exports.connectMongo = connectMongo;
module.exports.closeMongo = closeMongo;
