// src/database/models/User.js
const { Schema, model } = require('mongoose');

/**
 * Modelo de utilizador por guilda
 *
 * O que guarda:
 * - userId        → ID do utilizador (Discord)
 * - guildId       → ID da guilda/servidor
 * - warnings      → nº de avisos (AutoMod + comandos)
 * - trust         → "trust score" do utilizador (0–100)
 * - lastInfractionAt   → última vez que levou WARN/MUTE/KICK/BAN
 * - lastTrustUpdateAt  → última vez que o trust foi recalculado / regenerado
 *
 * Ideia de uso (a implementar no AutoMod + comandos):
 * - WARN manual/automático  → trust -= 5
 * - MUTE (timeout)          → trust -= 15
 * - Passam X dias sem infração → trust vai regenerando (trust += 1 até um máximo)
 *
 * Regras sugeridas (para lógica futura):
 * - trust < 10  → castigos mais pesados (mute maior / menos avisos)
 * - trust > 60  → ignorar infrações leves / borderline
 */
const userSchema = new Schema(
  {
    userId: {
      type: String,
      required: true
    },

    guildId: {
      type: String,
      required: true
    },

    /**
     * Nº de avisos que o utilizador tem neste servidor.
     * Usado pelo AutoMod e pelos comandos de staff (!warn, etc.).
     */
    warnings: {
      type: Number,
      default: 0,
      min: 0
    },

    /**
     * Trust score do utilizador neste servidor.
     *
     * Escala sugerida: 0–100
     * - 0   → utilizador extremamente problemático
     * - 30  → ponto de partida / default
     * - 60+ → utilizador confiável
     *
     * A lógica de aumentar/reduzir trust fica nos sistemas (AutoMod, comandos, etc.),
     * aqui só garantimos limites mínimos/máximos.
     */
    trust: {
      type: Number,
      default: 30,   // mantém o valor que já estavas a usar
      min: 0,
      max: 100
    },

    /**
     * Última vez que o utilizador cometeu uma infração "real":
     * - WARN
     * - MUTE
     * - KICK
     * - BAN
     * - AutoMod (palavra proibida) também pode atualizar isto
     */
    lastInfractionAt: {
      type: Date,
      default: null
    },

    /**
     * Última vez que o trust foi recalculado/regenerado.
     * Útil para lógica do tipo:
     * - "a cada X horas/dias sem infrações, +1 trust"
     */
    lastTrustUpdateAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true // createdAt / updatedAt
  }
);

/**
 * Índice composto:
 * - garante um único registo por (userId + guildId)
 * - evita duplicados no mesmo servidor
 */
userSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = model('User', userSchema);
