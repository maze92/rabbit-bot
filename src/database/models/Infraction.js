// src/database/models/Infraction.js
const { Schema, model } = require('mongoose');

/**
 * Guarda infrações:
 * WARN / MUTE / KICK / BAN
 */
const infractionSchema = new Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  moderatorId: { type: String, required: true },

  type: {
    type: String,
    enum: ['WARN', 'MUTE', 'KICK', 'BAN'],
    required: true
  },

  reason: { type: String, default: 'No reason provided' },

  // para mutes: duração em ms
  duration: { type: Number, default: null }
}, { timestamps: true });

infractionSchema.index({ guildId: 1, userId: 1, createdAt: -1 });

module.exports = model('Infraction', infractionSchema);

