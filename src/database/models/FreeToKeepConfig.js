// src/database/models/FreeToKeepConfig.js

const mongoose = require('mongoose');

const FreeToKeepConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true, unique: true },

    enabled: { type: Boolean, default: false },
    channelId: { type: String, default: '' },

    platforms: {
      epic: { type: Boolean, default: true },
      steam: { type: Boolean, default: true },
      ubisoft: { type: Boolean, default: true }
    },

    // How often to poll sources for *live* giveaways.
    pollIntervalMs: { type: Number, default: 120000 },

    // Max posts per cycle (across all platforms) to avoid spam.
    maxPerCycle: { type: Number, default: 3 },

    // Operational metadata
    lastRunAt: { type: Date, default: null },
    lastError: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.models.FreeToKeepConfig || mongoose.model('FreeToKeepConfig', FreeToKeepConfigSchema);
module.exports.FreeToKeepConfigSchema = FreeToKeepConfigSchema;
