const User = require('../database/models/User');
const logger = require('../systems/logger');
const config = require('../config/defaultConfig');

module.exports = {
  name: 'warn',
  description: 'Warn a user manually',
  allowedRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  async execute(message, client, args) {
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply(`❌ Usage: ${config.prefix}warn @user [reason]`);
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    let user = await User.findOne({
      userId: member.id,
      guildId: message.guild.id
    });

    if (!user) {
      user = await User.create({
        userId: member.id,
        guildId: message.guild.id,
        warnings: 0,
        trust: 30
      });
    }

    user.warnings += 1;
    await user.save();

    await message.channel.send(
      `⚠️ **${member.user.tag}** has been warned.\n**Warnings:** ${user.warnings}/${config.maxWarnings}`
    );

    await logger(
      client,
      'Manual Warn',
      member.user,
      message.author,
      `Reason: ${reason}\nWarnings: ${user.warnings}/${config.maxWarnings}`,
      message.guild
    );
  }
};
