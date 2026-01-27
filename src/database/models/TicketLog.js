// src/database/models/TicketLog.js

const { Schema, model } = require('mongoose');

const ticketLogSchema = new Schema(
  {
    ticketNumber: { type: Number, required: true },

    guildId: { type: String, required: true },

    userId: { type: String, required: true },
    username: { type: String, default: null },

    createdAt: { type: Date, default: Date.now },

    closedAt: { type: Date, default: null },
    closedById: { type: String, default: null },
    closedByUsername: { type: String, default: null }
  },
  {
    timestamps: false
  }
);

ticketLogSchema.index({ guildId: 1, ticketNumber: 1 });
ticketLogSchema.index({ guildId: 1, createdAt: -1 });

module.exports = model('TicketLog', ticketLogSchema);
