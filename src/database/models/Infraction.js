const { Schema, model } = require('mongoose');

const infractionSchema = new Schema({
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
    type: Number, // em ms (apenas para mute)
    default: null
  }
}, {
  timestamps: true
});

module.exports = model('Infraction', infractionSchema);
