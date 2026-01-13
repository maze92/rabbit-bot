const logger = require('../systems/logger');
const config = require('../config/defaultConfig');

module.exports = {
  name: 'clear',
  description: 'Clears messages in the channel',
  allowedRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  async execute(message, client, args) {
    if (!message.guild) return;

    if (!message.guild.members.me.permissions.has('ManageMessages')) {
      return message.reply('❌ I do not have permission to manage messages.');
    }

    const amount = parseInt(args[0], 10);
    if (!amount || amount < 1 || amount > 100) {
      return message.reply(`❌ Usage: ${config.prefix}clear 1-100`);
    }

    try {
      const deleted = await message.channel.bulkDelete(amount, true);

      const reply = await message.reply(
        `🧹 Deleted ${deleted.size} messages.`
      );
      setTimeout(() => reply.delete().catch(() => {}), 5000);

      await logger(
        client,
        'Clear Messages',
        message.author,
        message.author,
        `Amount: ${deleted.size}`,
        message.guild
      );
    } catch (err) {
      console.error('[clear]', err);
      message.reply(
        '❌ Could not delete some messages (older than 14 days).'
      );
    }
  }
};
