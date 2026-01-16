// src/database/models/GameNews.js
const { Schema, model } = require('mongoose');

/**
 * Esquema para armazenar estado do sistema GameNews por feed
 *
 * Suporta:
 * - dedupe real (lista de hashes recentes)
 * - backoff (pausa feed após erros seguidos)
 * - lastSentAt (último envio bem-sucedido desse feed)
 */
const gameNewsSchema = new Schema(
  {
    // Nome do feed (ex: "GameSpot/News")
    source: {
      type: String,
      required: true,
      unique: true
    },

    /**
     * Lista dos hashes mais recentes já enviados
     * (dedupe real, evita repetidos mesmo com reordenação do RSS)
     */
    lastHashes: {
      type: [String],
      default: []
    },

    /**
     * Contador de erros consecutivos do feed
     * - quando atinge o limite, ativamos pausa/backoff
     */
    failCount: {
      type: Number,
      default: 0
    },

    /**
     * Feed pausado até esta data/hora
     * - usado para backoff quando o feed falha muitas vezes
     */
    pausedUntil: {
      type: Date,
      default: null
    },

    /**
     * Última vez que enviámos uma notícia com sucesso deste feed
     * - útil para métricas, debugging e regras extra
     */
    lastSentAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = model('GameNews', gameNewsSchema);
