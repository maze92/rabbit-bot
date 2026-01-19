// src/database/models/GuildConfig.js

const { Schema, model } = require('mongoose');

const guildConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },

    // Canal de logs preferido (por ID). Se não definido, usa o nome em config.logChannelName.
    logChannelId: { type: String, default: null },

    // Roles de staff específicos por servidor (se vazio, cai no config.staffRoles global)
    staffRoleIds: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

guildConfigSchema.index({ guildId: 1 }, { unique: true });

module.exports = model('GuildConfig', guildConfigSchema);
