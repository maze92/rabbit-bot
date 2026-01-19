// src/database/models/GameNewsFeed.js

const { Schema, model } = require('mongoose');

const gameNewsFeedSchema = new Schema(
  {
    name: { type: String, required: true },
    feedUrl: { type: String, required: true },
    channelId: { type: String, required: true },
    enabled: { type: Boolean, default: true }
  },
  { timestamps: true }
);

gameNewsFeedSchema.index({ name: 1, feedUrl: 1 }, { unique: false });

module.exports = model('GameNewsFeed', gameNewsFeedSchema);
