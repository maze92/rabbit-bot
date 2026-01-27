// src/database/models/GameNewsFeed.js

const { Schema, model } = require('mongoose');

const gameNewsFeedSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },

    name: { type: String, required: true },
    feedUrl: { type: String, required: true },

    // Channel where the news posts are sent (optional at DB level;
    // if null, the feed will never post until a channel is configured)
    channelId: { type: String, default: null },

    // Optional channel where GameNews diagnostics (failures/pauses) are logged
    logChannelId: { type: String, default: null },

    enabled: { type: Boolean, default: true },

    // Optional override: custom interval for this feed (ms).
    // If null, uses global config.gameNews.interval.
    intervalMs: { type: Number, default: null },

    // Optional override: maximum number of news items to send per cycle for this feed.
    // If null, falls back to global config.gameNews.maxPerCycle.
    maxPerCycle: { type: Number, default: null }
  },
  { timestamps: true }
);

// Non-unique index (same RSS can be used across multiple guilds).
gameNewsFeedSchema.index({ guildId: 1, feedUrl: 1 });

module.exports = model('GameNewsFeed', gameNewsFeedSchema);
