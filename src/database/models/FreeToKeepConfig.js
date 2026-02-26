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

    // Which kinds of offers to post.
    // - freetokeep: keep forever / free-to-keep
    // - freeweekend: limited-time play/free weekend
    offerTypes: {
      freetokeep: { type: Boolean, default: true },
      freeweekend: { type: Boolean, default: false }
    },

    // How often to poll sources for *live* giveaways.
    pollIntervalMs: { type: Number, default: 120000 },

    // Max posts per cycle (across all platforms) to avoid spam.
    maxPerCycle: { type: Number, default: 3 },

    // Embed rendering options
    embedOptions: {
      showPrice: { type: Boolean, default: true },
      showUntil: { type: Boolean, default: true },
      showThumbnail: { type: Boolean, default: true },
      showImage: { type: Boolean, default: true },
      showButtons: { type: Boolean, default: true },
      showFooter: { type: Boolean, default: true },
      showClientButton: { type: Boolean, default: true }
    },

    // Operational metadata
    lastRunAt: { type: Date, default: null },
    lastError: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.models.FreeToKeepConfig || mongoose.model('FreeToKeepConfig', FreeToKeepConfigSchema);
module.exports.FreeToKeepConfigSchema = FreeToKeepConfigSchema;
