// src/database/models/GameNews.js
const { Schema, model } = require('mongoose');

/**
 * Estado por feed RSS:
 * - lastHash: compatibilidade antiga
 * - lastHashes: histórico (dedupe melhor)
 */
const gameNewsSchema = new Schema({
  source: { type: String, required: true, unique: true },

  lastHash: { type: String, default: null },
  lastHashes: { type: [String], default: [] }
}, { timestamps: true });

module.exports = model('GameNews', gameNewsSchema);
