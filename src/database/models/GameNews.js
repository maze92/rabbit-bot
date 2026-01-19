// src/database/models/GameNews.js

const { Schema, model } = require('mongoose');

const gameNewsSchema = new Schema(
  {
    source: {
      type: String,
      required: true,
      unique: true
    },

    lastHashes: {
      type: [String],
      default: []
    },


    failCount: {
      type: Number,
      default: 0
    },

    pausedUntil: {
      type: Date,
      default: null
    },

    lastSentAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = model('GameNews', gameNewsSchema);
