// src/database/models/Infraction.js

const { Schema, model } = require('mongoose');

const infractionSchema = new Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  moderatorId: { type: String, required: true },

  type: {
    type: String,
    enum: ['WARN', 'MUTE'],
    required: true
  },

  reason: { type: String, default: 'No reason provided' },

  duration: { type: Number, default: null }
}, { timestamps: true });

// índice TTL: tudo o que tiver createdAt > 90 dias é removido automaticamente pelo Mongo
infractionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 dias
);

module.exports = model('Infraction', infractionSchema);
