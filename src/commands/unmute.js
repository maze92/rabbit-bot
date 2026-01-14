const logger = require('../systems/logger');

module.exports = {
  name: 'unmute',
  description: 'Unmute a muted user',
  allowedRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  async execute(message, client, args) {
    const user = message.mentions.members.first();
    if (!user) return message.reply('❌ Please mention a user.');

    if (!user.isCommunicationDisabled()) {
      return message.reply(`⚠️ ${user.user.tag} is not muted.`);
    }

    try {
      await user.timeout(null, 'Unmute by moderator');
      await message.channel.send(`✅ ${user.user.tag} has been unmuted.`);
      await logger(client, 'Unmute', user, message.author, 'User unmuted', message.guild);
    } catch (err) {
      console.error('[Unmute] Error:', err);
      await message.channel.send(`❌ Failed to unmute ${user.user.tag}.`);
    }
  }
};

