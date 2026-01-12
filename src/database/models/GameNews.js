const { Schema, model } = require('mongoose');

// Esquema para armazenar as últimas notícias de cada feed
const gameNewsSchema = new Schema({
  source: {         // Nome do feed (ex: "Polygon_PC", "IGN_PC")
    type: String,
    required: true,
    unique: true,   // Garante que cada feed tenha apenas um registro
  },
  lastLink: {       // URL da última notícia enviada
    type: String,
    default: null   // 'null' indica que ainda não foi enviada nenhuma notícia
  }
}, { timestamps: true }); // Adiciona campos automáticos 'createdAt' e 'updatedAt'

// Índice único em 'source' para garantir unicidade
gameNewsSchema.index({ source: 1 }, { unique: true });

// Exporta o modelo para uso em gamenews.js
module.exports = model('GameNews', gameNewsSchema);
