// src/commands/warn.js
const { PermissionsBitField } = require('discord.js');
const logger = require('../systems/logger');
const User = require('../database/models/User');
const config = require('../config/defaultConfig');
const infractionsService = require('../systems/infractionsService');

/**
 * Comando: !warn
 * - Dá um aviso manual
 * - Atualiza warnings no User (MongoDB)
 * - Regista Infraction (WARN)
 * - Faz log no Discord + Dashboard
 */
module.exports = {
  name: 'warn',
  description: 'Issue a warning to a user',

  // (Opcional) podes remover daqui se quiseres usar só config.staffRoles no handler
  allowedRoles: config.staffRoles,

  async execute(message, args, client) {
    try {
      if (!message.guild) return;

      const executor = message.member;
      const botMember = message.guild.members.me;
      if (!executor || !botMember) return;

      // Alvo
      const targetMember = message.mentions.members.first();
      if (!targetMember) return message.reply('❌ Please mention a user to warn.');

      // Proteções
      if (targetMember.id === message.author.id) return message.reply('❌ You cannot warn yourself.');
      if (targetMember.id === client.user.id) return message.reply('❌ You cannot warn the bot.');

      // (Opcional) Hierarquia: impede warn em cargos >= executor (anti-abuso)
      if (
        targetMember.roles.highest.position >= executor.roles.highest.position &&
        !executor.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return message.reply('❌ You cannot warn a user with an equal or higher role.');
      }

      // DB User
      let dbUser = await User.findOne({ userId: targetMember.id, guildId: message.guild.id });
      if (!dbUser) {
        dbUser = await User.create({
          userId: targetMember.id,
          guildId: message.guild.id,
          warnings: 0,
          trust: 30
        });
      }

      dbUser.warnings += 1;
      await dbUser.save();

      // Registar infraction WARN
      await infractionsService.create({
        guild: message.guild,
        user: targetMember.user,
        moderator: message.author,
        type: 'WARN',
        reason: args.slice(1).join(' ').trim() || 'Manual warn',
        duration: null
      });

      await message.channel.send(`⚠️ ${targetMember} has been warned.\n**Total warnings:** ${dbUser.warnings}`);

      await logger(
        client,
        'Manual Warn',
        targetMember.user,
        message.author,
        `Total warnings: **${dbUser.warnings}**`,
        message.guild
      );
    } catch (err) {
      console.error('[warn] Error:', err);
      message.reply('❌ An unexpected error occurred.').catch(() => null);
    }
  }
};
