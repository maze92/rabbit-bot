const User = require('../database/models/User');

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    try {
      await User.create({
        userId: member.id,
        guildId: member.guild.id,
        trust: 30,
        warnings: 0
      });
    } catch (err) {
      console.error('Error creating user on guildMemberAdd:', err);
    }
  });
};
