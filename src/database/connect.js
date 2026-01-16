// src/database/connect.js

const mongoose = require('mongoose');
const status = require('../systems/status');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!uri) {
  console.error(
    '❌ Missing MongoDB URI. Set MONGO_URI (recommended) or MONGODB_URI in Railway/Env.'
  );

  status.setMongoConnected(false);
} else {
  mongoose
    .connect(uri)
    .then(() => {
      console.log('✅ MongoDB connected');
      status.setMongoConnected(true);
    })
    .catch((err) => {
      console.error('❌ MongoDB connection error:', err);
      status.setMongoConnected(false);
    });
}

mongoose.connection.on('connected', () => {
  console.log('🟢 MongoDB connection established');
  status.setMongoConnected(true);
});

mongoose.connection.on('disconnected', () => {
  console.warn('🟠 MongoDB disconnected');
  status.setMongoConnected(false);
});

mongoose.connection.on('error', (err) => {
  console.error('🔴 MongoDB error:', err);
  status.setMongoConnected(false);
});

mongoose.connection.on('reconnected', () => {
  console.log('🟢 MongoDB reconnected');
  status.setMongoConnected(true);
});

module.exports = mongoose;
