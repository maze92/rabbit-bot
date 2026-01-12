// src/commands/purgeuser.js
const logger = require('../systems/logger');
const config = require('../config/defaultConfig');

module.exports = {
  name: 'purgeuser',
  permissions: ['ManageMessages'],

  async execute(message, args, client) {
    const user = message.mentions.members.first();
    if (!user) return message.reply(`❌ Usage: ${config.prefix}purgeuser @user`);

    if (!message.guild.members.me.permissions.has('ManageMessages')) {
      return message.reply('❌ I do not have permission to manage messages.');
    }

    try {
      const messages = await message.channel.messages.fetch({ limit: 100 });
      const userMessages = messages.filter(m => m.author.id === user.id);
      await message.channel.bulkDelete(userMessages, true);

      message.reply(`🧹 Deleted ${userMessages.size} messages from ${user.user.tag}.`)
        .then(msg => setTimeout(() => msg.delete(), 3000));

      // Log automático
      await logger(client, 'Purge User', user.user, message.author, `Amount: ${userMessages.size}`);
    } catch (err) {
      console.error(err);
      message.reply('❌ Could not delete some messages (older than 14 days or higher role).');
    }
  }
};
