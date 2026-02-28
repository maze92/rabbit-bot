// src/database/models/FreeToKeepPost.js

const mongoose = require('mongoose');

const FreeToKeepPostSchema = new mongoose.Schema(
  {
    guildId: { type: String, index: true, required: true },
    platform: { type: String, index: true, required: true }, // epic|steam|ubisoft
    type: { type: String, index: true, required: true }, // keep|weekend
    title: { type: String, default: '' },
    url: { type: String, default: '' },
    originalPrice: { type: String, default: '' },
    until: { type: Date, default: null },
    publisher: { type: String, default: '' },
    isTest: { type: Boolean, default: false },
    messageId: { type: String, default: null },
    channelId: { type: String, default: null }
  },
  { timestamps: true }
);

// Avoid reposting the same item in the same guild.
// URL is the most stable identifier across runs.
FreeToKeepPostSchema.index(
  { guildId: 1, platform: 1, type: 1, url: 1, isTest: 1 },
  { unique: true, partialFilterExpression: { url: { $type: 'string' }, guildId: { $type: 'string' } } }
);

module.exports = mongoose.models.FreeToKeepPost || mongoose.model('FreeToKeepPost', FreeToKeepPostSchema);
