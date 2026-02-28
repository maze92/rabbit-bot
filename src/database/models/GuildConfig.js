// src/database/models/GuildConfig.js

const { Schema, model } = require('mongoose');

const guildConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },

    // Idioma principal do servidor (auto|pt|en)
    language: { type: String, default: 'auto' },

    // Timezone principal do servidor (IANA, ex: Europe/Lisbon). Null => usa UTC.
    timezone: { type: String, default: null },

    // Canal de logs preferido (por ID). Se não definido, usa o nome em config.logChannelName.
    logChannelId: { type: String, default: null },

    // Canal de logs específico para ações feitas via Dashboard
    dashboardLogChannelId: { type: String, default: null },

    // Canal onde a mensagem de suporte (tickets) será publicada
    ticketThreadChannelId: { type: String, default: null },


    // Roles de staff específicos por servidor (configurados na dashboard)
    staffRoleIds: {
      type: [String],
      default: []
    },

    // Roles de staff por funcionalidade (se vazio, cai em staffRoleIds)
    staffRolesByFeature: {
      tickets: { type: [String], default: [] },
      moderation: { type: [String], default: [] },
      gamenews: { type: [String], default: [] },
      logs: { type: [String], default: [] },
      config: { type: [String], default: [] }
    },

    // Modo manutenção (quando ativo, o bot limita comandos a admin/owner e, opcionalmente, staff)
    maintenanceMode: {
      enabled: { type: Boolean, default: false },
      message: { type: String, default: null },
      allowStaff: { type: Boolean, default: true }
    },

    // Configuração de voz temporária por guild
    tempVoice: {
      enabled: { type: Boolean, default: false },
      baseChannelIds: { type: [String], default: [] },
      categoryId: { type: String, default: null },
      deleteDelaySeconds: { type: Number, default: 10 },
      maxUsersPerRoom: { type: Number, default: null }
    },

    // FreeToKeep (Epic/Steam/Ubisoft) notifications
    // Stored inside GuildConfig so dashboard config persists.
    freeToKeep: {
      enabled: { type: Boolean, default: false },
      channelId: { type: String, default: null },

      // Poll interval (seconds). Minimum 60.
      pollIntervalSeconds: { type: Number, default: 60 },

      // 0/null => unlimited per cycle.
      maxPerCycle: { type: Number, default: 0 },

      platforms: {
        epic: { type: Boolean, default: true },
        steam: { type: Boolean, default: true },
        ubisoft: { type: Boolean, default: true }
      },
      types: {
        keep: { type: Boolean, default: true },
        weekend: { type: Boolean, default: false }
      },
      embedOptions: {
        showPrice: { type: Boolean, default: true },
        showUntil: { type: Boolean, default: true },
        showThumbnail: { type: Boolean, default: true },
        showImage: { type: Boolean, default: true },
        showButtons: { type: Boolean, default: true },
        showFooter: { type: Boolean, default: true },
        showSteamClientButton: { type: Boolean, default: true }
      }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = model('GuildConfig', guildConfigSchema);
