// src/events/guildMemberAdd.js

const warningsService = require('../systems/warningsService');

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    try {
      if (!member?.guild || !member.user) return;

      // Garante que o utilizador existe na DB
      // (não recria se já existir)
      await warningsService.getOrCreateUser(
        member.guild.id,
        member.user.id
      );

      console.log(
        `👤 User joined: ${member.user.tag} (${member.user.id}) | Guild: ${member.guild.name}`
      );
    } catch (err) {
      console.error('[guildMemberAdd] Error handling new member:', err);
    }
  });
};

