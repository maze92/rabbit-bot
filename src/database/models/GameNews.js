// src/database/models/GameNews.js
const { Schema, model } = require('mongoose');

/**
 * Guarda estado por feed:
 * - source: nome do feed
 * - lastHash: compatibilidade antiga
 * - lastHashes: histórico para dedupe melhor (últimos N)
 */
const gameNewsSchema = new Schema({
  source: {
    type: String,
    required: true,
    unique: true
  },

  // compatibilidade (antigo)
  lastHash: {
    type: String,
    default: null
  },

  // novo: histórico dos últimos hashes (dedupe melhor)
  lastHashes: {
    type: [String],
    default: []
  }

}, { timestamps: true });

module.exports = model('GameNews', gameNewsSchema);
