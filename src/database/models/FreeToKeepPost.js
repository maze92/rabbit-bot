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

module.exports = mongoose.models.FreeToKeepPost || mongoose.model('FreeToKeepPost', FreeToKeepPostSchema);
