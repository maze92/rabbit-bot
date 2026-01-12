const User = require('../database/models/User');

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    try {
      // Verifica se o usuário já existe
      const existing = await User.findOne({ userId: member.id, guildId: member.guild.id });
      if (existing) return;

      await User.create({
        userId: member.id,
        guildId: member.guild.id,
        trust: 30,
        warnings: 0
      });

      console.log(`✅ Created user entry for ${member.user.tag} (${member.id}) in guild ${member.guild.name}`);
    } catch (err) {
      console.error('Error creating user on guildMemberAdd:', err);
    }
  });
};
