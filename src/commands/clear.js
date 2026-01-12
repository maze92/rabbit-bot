const logger = require('../systems/logger');
const config = require('../config/defaultConfig');

module.exports = {
  name: 'clear',
  description: 'Clears messages in the channel',
  allowedRoles: ['1385619241235120177', '1385619241235120174', '1385619241235120173'], // IDs dos cargos autorizados

  async execute(message, client, args) {
    // Verifica se o bot tem permissão
    if (!message.guild.members.me.permissions.has('ManageMessages')) {
      return message.reply('❌ I do not have permission to manage messages.');
    }

    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) {
      return message.reply(`❌ Usage: ${config.prefix}clear 1-100`);
    }

    try {
      const deletedMessages = await message.channel.bulkDelete(amount, true);
      const reply = await message.reply(`🧹 Deleted ${deletedMessages.size} messages.`);
      setTimeout(() => reply.delete().catch(() => null), 5000);

      // Log centralizado
      await logger(client, 'Clear Messages', message.author, message.author, `Amount: ${deletedMessages.size}`);
    } catch (err) {
      console.error(err);
      message.reply('❌ Could not delete some messages (older than 14 days or higher role).');
    }
  }
};

