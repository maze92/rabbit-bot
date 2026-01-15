// src/database/models/Infraction.js
const { Schema, model } = require('mongoose');

/**
 * Esquema para armazenar infrações aplicadas a utilizadores.
 *
 * Guarda histórico de:
 * - WARN (avisos)
 * - MUTE (timeout)
 * - KICK
 * - BAN
 *
 * Campos principais:
 * - guildId: servidor onde ocorreu
 * - userId: utilizador afetado
 * - moderatorId: quem aplicou (pode ser o bot)
 * - type: tipo de infração
 * - reason: motivo (texto)
 * - duration: duração em ms (apenas para MUTE)
 */
const infractionSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true
    },

    userId: {
      type: String,
      required: true
    },

    moderatorId: {
      type: String,
      required: true
    },

    type: {
      type: String,
      enum: ['WARN', 'MUTE', 'KICK', 'BAN'],
      required: true
    },

    reason: {
      type: String,
      default: 'No reason provided'
    },

    duration: {
      // Apenas para MUTE/timeout (ms)
      type: Number,
      default: null
    }
  },
  {
    timestamps: true // createdAt e updatedAt
  }
);

/**
 * Indexes recomendados:
 * - Buscar rapidamente histórico de um user num servidor
 * - Filtrar por tipo (WARN/MUTE/etc.)
 * - Ordenar por data (createdAt)
 */
infractionSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
infractionSchema.index({ guildId: 1, type: 1, createdAt: -1 });

module.exports = model('Infraction', infractionSchema);

