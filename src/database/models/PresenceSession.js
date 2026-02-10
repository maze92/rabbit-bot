// src/database/models/PresenceSession.js

const { Schema, model } = require('mongoose');

const presenceSessionSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },

    // Denormalized for filtering (avoid Discord fetch just to exclude bots)
    isBot: { type: Boolean, default: false, index: true },

    // Session bounds
    startAt: { type: Date, required: true, index: true },
    // When a session is open, endAt is undefined (not null)
    endAt: { type: Date, index: true },

    // Optional: last known presence status (online/idle/dnd/offline)
    lastStatus: { type: String, default: null }
  },
  { timestamps: true }
);

// Only one open session per (guildId,userId)
presenceSessionSchema.index(
  { guildId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { endAt: { $exists: false } }
  }
);

// Query-friendly indexes
presenceSessionSchema.index({ guildId: 1, startAt: -1 });
presenceSessionSchema.index({ guildId: 1, endAt: -1 });
presenceSessionSchema.index({ guildId: 1, userId: 1, startAt: -1 });

module.exports = model('PresenceSession', presenceSessionSchema);
