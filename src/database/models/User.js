const { Schema, model } = require('mongoose');

// Estrutura do usuário no MongoDB
const userSchema = new Schema({
  userId: { type: String, required: true },   // ID do usuário no Discord
  guildId: { type: String, required: true },  // ID da guild
  trust: { type: Number, default: 30 },       // Pontos de confiança (para anti-raid)
  warnings: { type: Number, default: 0 }     // Contagem de avisos (warns)
});

// Exporta o modelo para uso no restante do bot
module.exports = model('User', userSchema);
