// src/database/models/FreeToKeepPost.js

const mongoose = require('mongoose');

const FreeToKeepPostSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    platform: { type: String, required: true, index: true }, // epic | steam | ubisoft
    giveawayId: { type: Number, required: true },

    title: { type: String, default: '' },
    worth: { type: String, default: '' },
    endDate: { type: String, default: '' },
    url: { type: String, default: '' },
    image: { type: String, default: '' },

    channelId: { type: String, default: '' },
    messageId: { type: String, default: '' },
    postedAt: { type: Date, default: () => new Date() }
  },
  { timestamps: true }
);

// Prevent duplicates per guild.
FreeToKeepPostSchema.index({ guildId: 1, platform: 1, giveawayId: 1 }, { unique: true });

module.exports = mongoose.models.FreeToKeepPost || mongoose.model('FreeToKeepPost', FreeToKeepPostSchema);
module.exports.FreeToKeepPostSchema = FreeToKeepPostSchema;
