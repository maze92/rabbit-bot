const { Schema, model } = require('mongoose');

const gameNewsSchema = new Schema({
  source: {         // Nome do feed, ex: "IGN_PC"
    type: String,
    required: true,
    unique: true
  },
  lastLink: {       // URL da última notícia enviada
    type: String,
    default: null
  }
});

module.exports = model('GameNews', gameNewsSchema);
