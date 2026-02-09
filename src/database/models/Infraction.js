// src/database/models/Infraction.js

const { Schema, model } = require('mongoose');

const infractionSchema = new Schema({
  // Sequential case ID per guild (allocated via CaseCounter). Optional for legacy docs.
  caseId: { type: Number, default: null, index: true },

  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  moderatorId: { type: String, required: true },

  type: {
    type: String,
    enum: ['WARN', 'MUTE'],
    required: true
  },

  reason: { type: String, default: 'No reason provided' },

  duration: { type: Number, default: null },

  // Who/what originated the infraction (slash, prefix, dashboard, automod, antispam, etc.)
  source: { type: String, default: 'unknown', index: true },

  // Stored tags/usernames at time of action for better dashboard search and historical accuracy.
  userTag: { type: String, default: null },
  executorTag: { type: String, default: null }
}, { timestamps: true });

// índice TTL: tudo o que tiver createdAt > 90 dias é removido automaticamente pelo Mongo
infractionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 dias
);

// Helpful query indexes
infractionSchema.index({ guildId: 1, createdAt: -1 });
infractionSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
infractionSchema.index({ guildId: 1, type: 1, createdAt: -1 });
// Case IDs should be unique per guild when present.
infractionSchema.index({ guildId: 1, caseId: 1 }, { unique: true, sparse: true });

// Text search for dashboard (reason + stored tags). Keep weights small; this is an operator tool.
infractionSchema.index(
  { reason: 'text', userTag: 'text', executorTag: 'text', userId: 'text', moderatorId: 'text' },
  { weights: { reason: 5, userTag: 3, executorTag: 3, userId: 2, moderatorId: 2 } }
);

module.exports = model('Infraction', infractionSchema);
