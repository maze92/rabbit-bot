// src/commands/clear.js

/**
 * Comando: !clear
 * - Apaga mensagens em massa num canal (1 a 100)
 * - Protegido por cargos (allowedRoles) ou Administrator
 * - Requer permissões do bot: ViewChannel, ReadMessageHistory, ManageMessages
 * - Regista a ação no log-bot + dashboard (via logger centralizado)
 *
 * Notas:
 * - bulkDelete não apaga mensagens com mais de 14 dias (limitação do Discord)
 * - Se existirem mensagens antigas, o Discord simplesmente ignora essas
 */

const { PermissionsBitField } = require('discord.js');
const logger = require('../systems/logger');
const config = require('../config/defaultConfig');

module.exports = {
  name: 'clear',
  description: 'Bulk delete messages in a channel',

  // IDs dos cargos autorizados (staff)
  allowedRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  async execute(message, args, client) {
    try {
      // ------------------------------
      // Validações básicas
      // ------------------------------
      if (!message?.guild) return;

      const executorMember = message.member;
      const botMember = message.guild.members.me;

      if (!executorMember || !botMember) {
        return message.reply('❌ Could not resolve members (executor/bot).');
      }

      const prefix = config.prefix || '!';

      // ------------------------------
      // Permissões do BOT no canal
      // - Precisa gerir mensagens e conseguir ler histórico
      // ------------------------------
      const botPerms = message.channel.permissionsFor(botMember);
      if (!botPerms?.has(PermissionsBitField.Flags.ViewChannel)) return;

      if (!botPerms.has(PermissionsBitField.Flags.ReadMessageHistory)) {
        return message.reply('❌ I need **Read Message History** permission in this channel.');
      }

      if (!botPerms.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply('❌ I do not have permission to **Manage Messages** in this channel.');
      }

      // ------------------------------
      // Permissões do executor (roles/admin)
      // ------------------------------
      const hasAllowedRole = executorMember.roles.cache.some(role =>
        this.allowedRoles.includes(role.id)
      );

      if (
        !hasAllowedRole &&
        !executorMember.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return message.reply('❌ You do not have permission to use this command.');
      }

      // ------------------------------
      // Quantidade (1-100)
      // ------------------------------
      const amount = parseInt(args?.[0], 10);
      if (!amount || amount < 1 || amount > 100) {
        return message.reply(`❌ Usage: ${prefix}clear <1-100>`);
      }

      // ------------------------------
      // Apagar mensagens
      // - bulkDelete ignora mensagens com +14 dias (true)
      // ------------------------------
      const deleted = await message.channel.bulkDelete(amount, true);

      // ------------------------------
      // Feedback no canal
      // ------------------------------
      let feedback = `🧹 Deleted **${deleted.size}** message(s).`;

      // Se pediu X e apagou menos, é quase sempre por mensagens antigas
      if (deleted.size < amount) {
        feedback += `\nℹ️ Some messages were not deleted (likely older than 14 days).`;
      }

      const reply = await message.channel.send(feedback).catch(() => null);
      if (reply) {
        setTimeout(() => reply.delete().catch(() => null), 5000);
      }

      // ------------------------------
      // Log (Discord + Dashboard)
      // ------------------------------
      await logger(
        client,
        'Clear Messages',
        null, // sem "user afetado" neste comando
        message.author,
        `Channel: #${message.channel.name}\nRequested: **${amount}**\nDeleted: **${deleted.size}**`,
        message.guild
      );
    } catch (err) {
      console.error('[clear] Error:', err);
      message.reply('❌ Failed to delete messages. Check permissions and message age.').catch(() => null);
    }
  }
};
