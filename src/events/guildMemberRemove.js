// src/events/guildMemberRemove.js
//
// Quando alguém sai do servidor fecha as sessões de presença em aberto.
// Sem isto, uma saída enquanto o membro estava online deixaria uma sessão
// com endAt:null a acumular tempo indefinidamente no "Registo de Utilizadores Online".

module.exports = (client) => {
  client.on('guildMemberRemove', async (member) => {
    try {
      if (!member?.guild || !member.user) return;

      let PresenceSession = null;
      try {
        PresenceSession = require('../database/models/PresenceSession');
      } catch {
        return;
      }

      await PresenceSession.updateMany(
        { guildId: member.guild.id, userId: member.user.id, endAt: null },
        { $set: { endAt: new Date(), lastStatus: 'offline' } }
      ).exec();

      console.log(
        `👋 Member left: ${member.user.tag} (${member.user.id}) | Guild: ${member.guild.name}`
      );
    } catch (err) {
      console.error('[guildMemberRemove] Error handling member leave:', err);
    }
  });
};
