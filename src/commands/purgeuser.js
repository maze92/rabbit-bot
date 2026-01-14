const logger = require('../systems/logger');

module.exports = {
  name: 'purgeuser',
  description: 'Deletes recent messages from a specific user',
  allowedRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  async execute(message, client, args) {
    if (!message.guild.members.me.permissions.has('ManageMessages'))
      return message.reply('❌ I do not have permission to manage messages.');

    const user = message.mentions.members.first();
    if (!user) return message.reply('❌ Usage: !purgeuser @user');

    const messages = await message.channel.messages.fetch({ limit: 100 });
    const userMessages = messages.filter(m => m.author.id === user.id);
    if (!userMessages.size) return message.reply('⚠️ No messages found for this user.');

    await message.channel.bulkDelete(userMessages, true);

    const reply = await message.channel.send(`🧹 Deleted **${userMessages.size}** messages from **${user.user.tag}**.`);
    setTimeout(() => reply.delete().catch(() => null), 5000);

    await logger(client, 'Purge User', user, message.author, `Deleted ${userMessages.size} messages`, message.guild);
  }
};
