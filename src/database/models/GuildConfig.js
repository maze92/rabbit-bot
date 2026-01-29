// src/database/models/GuildConfig.js

const { Schema, model } = require('mongoose');

const guildConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },

    // Canal de logs preferido (por ID). Se não definido, usa o nome em config.logChannelName.
    logChannelId: { type: String, default: null },

    // Canal de logs específico para ações feitas via Dashboard
    dashboardLogChannelId: { type: String, default: null },

    // Canal onde a mensagem de suporte (tickets) será publicada
    ticketThreadChannelId: { type: String, default: null },


    // Roles de staff específicos por servidor (se vazio, cai no config.staffRoles global)
    staffRoleIds: {
      type: [String],
      default: []
    },

    // Configuração de voz temporária por guild
    tempVoice: {
      enabled: { type: Boolean, default: false },
      baseChannelIds: { type: [String], default: [] },
      categoryId: { type: String, default: null },
      deleteDelaySeconds: { type: Number, default: 10 }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = model('GuildConfig', guildConfigSchema);
