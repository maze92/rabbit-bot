// src/database/models/TicketOpenLock.js
// Short-lived lock to prevent duplicate ticket thread creation

const mongoose = require('mongoose');

const TicketOpenLockSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    messageId: { type: String, required: true },
    // TTL via schema index below (MongoDB TTL). We avoid `expires` here because
    // it can produce duplicate index warnings under some mongoose versions.
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

// Only one lock per (guildId,userId) at a time
TicketOpenLockSchema.index({ guildId: 1, userId: 1 }, { unique: true });
// Auto-expire locks after 45 seconds
TicketOpenLockSchema.index({ createdAt: 1 }, { expireAfterSeconds: 45 });

module.exports = mongoose.models.TicketOpenLock || mongoose.model('TicketOpenLock', TicketOpenLockSchema);
