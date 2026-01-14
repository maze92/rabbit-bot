const User = require('../database/models/User');

module.exports = {
  name: 'infractions',
  description: 'Check infractions of a user',
  allowedRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  async execute(message, client, args) {
    const user = message.mentions.members.first() || message.member;
    const dbUser = await User.findOne({ userId: user.id, guildId: message.guild.id });

    const warns = dbUser?.warnings || 0;
    await message.channel.send(`⚠️ ${user.user.tag} has **${warns}** warnings.`);
  }
};
