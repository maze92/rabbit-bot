// src/database/models/GameNews.js

const { Schema, model } = require('mongoose');

const gameNewsSchema = new Schema(
  {
    // Unique source key used to track per-feed state.
    // In older versions this was the feed "name" (collision-prone). We now store a stable key.
    source: {
      type: String,
      required: true,
      unique: true
    },

    // Optional metadata (helps debugging / future migrations)
    guildId: { type: String, default: null },
    feedUrl: { type: String, default: null },
    channelId: { type: String, default: null },
    name: { type: String, default: null },

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
