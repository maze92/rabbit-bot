const logger = require('../systems/logger');
const config = require('../config/defaultConfig');

module.exports = {
  name: 'unmute',
  description: 'Remove timeout from a user',
  allowedRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  async execute(message) {
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply(`❌ Usage: ${config.prefix}unmute @user`);
    }

    if (!member.isCommunicationDisabled()) {
      return message.reply('ℹ️ This user is not muted.');
    }

    await member.timeout(null);

    await message.channel.send(
      `🔊 **${member.user.tag}** has been unmuted.`
    );

    await logger(
      message.client,
      'Unmute',
      member.user,
      message.author,
      'Timeout removed',
      message.guild
    );
  }
};
