const logger = require('../systems/logger');
const config = require('../config/defaultConfig');

module.exports = {
  name: 'purgeuser',
  description: 'Deletes recent messages from a specific user',

  // IDs dos cargos permitidos a usar este comando
  allowedRoles: ['1385619241235120177', '1385619241235120174', '1385619241235120173'],

  async execute(message, client, args) {
    // ==============================
    // Verifica permissão do bot
    // ==============================
    if (!message.guild.members.me.permissions.has('ManageMessages')) {
      return message.reply('❌ I do not have permission to manage messages.');
    }

    // ==============================
    // Obtém o usuário mencionado
    // ==============================
    const user = message.mentions.members.first();
    if (!user) return message.reply(`❌ Usage: ${config.prefix}purgeuser @user`);

    try {
      // ==============================
      // Busca últimas 100 mensagens e filtra pelo usuário
      // ==============================
      const messages = await message.channel.messages.fetch({ limit: 100 });
      const userMessages = messages.filter(m => m.author.id === user.id);

      if (!userMessages.size) return message.reply('⚠️ No messages found for this user.');

      // ==============================
      // Deleta mensagens
      // ==============================
      await message.channel.bulkDelete(userMessages, true);

      const reply = await message.channel.send(
        `🧹 Deleted ${userMessages.size} messages from ${user.user.tag}.`
      );
      setTimeout(() => reply.delete().catch(() => null), 5000);

      // ==============================
      // Log automático no canal de logs
      // ==============================
      await logger(
        client,
        'Purge User',
        user.user,         // usuário afetado
        message.author,    // executor
        `Amount: ${userMessages.size}`
      );
    } catch (err) {
      console.error(err);
      message.reply('❌ Could not delete some messages (older than 14 days or higher role).');
    }
  }
};

