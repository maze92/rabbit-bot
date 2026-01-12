// src/commands/clear.js
const logger = require('../systems/logger');
const config = require('../config/defaultConfig');

module.exports = {
  name: 'clear',
  permissions: ['ManageMessages'],

  async execute(message, args, client) {
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) {
      return message.reply(`❌ Usage: ${config.prefix}clear 1-100`);
    }

    if (!message.guild.members.me.permissions.has('ManageMessages')) {
      return message.reply('❌ I do not have permission to manage messages.');
    }

    try {
      const deletedMessages = await message.channel.bulkDelete(amount, true);
      message.reply(`🧹 Deleted ${deletedMessages.size} messages.`)
        .then(msg => setTimeout(() => msg.delete(), 3000));

      // Log automático
      await logger(client, 'Clear Messages', message.author, message.author, `Amount: ${deletedMessages.size}`);
    } catch (err) {
      console.error(err);
      message.reply('❌ Could not delete some messages (older than 14 days or higher role).');
    }
  }
};
