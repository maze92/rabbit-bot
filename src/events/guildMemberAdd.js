// src/events/guildMemberAdd.js
const User = require('../database/models/User');

/**
 * Ao entrar um membro:
 * - cria registo no DB se não existir
 */
module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    try {
      if (!member?.guild) return;

      const existing = await User.findOne({
        userId: member.id,
        guildId: member.guild.id
      });

      if (existing) return;

      await User.create({
        userId: member.id,
        guildId: member.guild.id,
        trust: 30,
        warnings: 0
      });

      console.log(`✅ Created user entry for ${member.user.tag} (${member.id}) in guild ${member.guild.name}`);
    } catch (err) {
      console.error('[guildMemberAdd] Error creating user entry:', err);
    }
  });
};
