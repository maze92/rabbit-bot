// src/database/models/Ticket.js

const { Schema, model } = require('mongoose');

const ticketSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },

    // Utilizador que abriu o ticket (normalmente igual a userId)
    createdById: { type: String, required: true },

    // Staff que fechou o ticket (se aplicável)
    closedById: { type: String, default: null },

    status: {
      type: String,
      enum: ['OPEN', 'CLOSED'],
      default: 'OPEN',
      index: true
    },

    topic: {
      type: String,
      default: '',
      maxlength: 200
    },

    closedAt: { type: Date, default: null }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

ticketSchema.index({ guildId: 1, userId: 1, createdAt: -1 });

module.exports = model('Ticket', ticketSchema);
