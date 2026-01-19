// src/database/models/Infraction.js

const { Schema, model } = require('mongoose');

const infractionSchema = new Schema(
  {
    // Case ID (per guild) for auditability.
    // Starts at 1 and increments sequentially.
    caseId: {
      type: Number,
      default: null,
      index: true
    },

    guildId: {
      type: String,
      required: true,
      index: true
    },

    userId: {
      type: String,
      required: true,
      index: true
    },

    moderatorId: {
      type: String,
      required: true
    },

    type: {
      type: String,
      enum: ['WARN', 'MUTE', 'KICK', 'BAN'],
      required: true,
      index: true
    },

    reason: {
      type: String,
      default: 'No reason provided',
      maxlength: 500
    },

    duration: {
      type: Number,
      default: null,
      min: 0
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

infractionSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
infractionSchema.index({ guildId: 1, type: 1, createdAt: -1 });
infractionSchema.index({ guildId: 1, caseId: -1 });

module.exports = model('Infraction', infractionSchema);
