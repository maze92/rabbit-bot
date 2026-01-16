// src/commands/unmute.js
// ============================================================
// Comando: !unmute
//
// Faz:
// - Remove timeout (unmute) de um utilizador
// - Staff-only (config.staffRoles) OU Administrator
// - Respeita hierarquia (executor vs alvo + bot vs alvo)
// - Regista log no canal log-bot + Dashboard (via logger)
// - Mostra TRUST atual no log (não altera trust)
//
// Nota sobre infractions:
// - O teu Infraction enum tem: WARN/MUTE/KICK/BAN
// - UNMUTE não existe, por isso aqui NÃO criamos infração.
//   (Se quiseres, depois adicionamos "UNMUTE" ao enum.)
// ============================================================

const { PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const logger = require('../systems/logger');
const warningsService = require('../systems/warningsService'); // para buscar trust/warnings (estado atual)

function isStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id));
}

module.exports = {
  name: 'unmute',
  description: 'Remove timeout (unmute) from a user',

  /**
   * Uso:
   * - !unmute @user
   */
  async execute(message, args, client) {
    try {
      // ------------------------------
      // Validações básicas
      // ------------------------------
      if (!message?.guild) return;
      if (!message.member) return;

      const guild = message.guild;
      const executor = message.member;
      const botMember = guild.members.me;
      if (!botMember) return;

      // ------------------------------
      // Staff / Admin check
      // ------------------------------
      if (!isStaff(executor)) {
        return message
          .reply("❌ You don't have permission to use this command.")
          .catch(() => null);
      }

      // ------------------------------
      // Permissões do BOT (timeout/unmute = ModerateMembers)
      // ------------------------------
      const perms = message.channel.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message
          .reply('❌ I do not have permission to unmute members (Moderate Members).')
          .catch(() => null);
      }

      // ------------------------------
      // Alvo
      // ------------------------------
      const target = message.mentions.members.first();
      if (!target) {
        return message.reply(`❌ Usage: ${config.prefix}unmute @user`).catch(() => null);
      }

      // Proteções básicas
      if (target.id === message.author.id) {
        return message.reply('❌ You cannot unmute yourself.').catch(() => null);
      }

      if (target.id === client.user.id) {
        return message.reply('❌ You cannot unmute the bot.').catch(() => null);
      }

      // ------------------------------
      // Hierarquia
      // ------------------------------
      const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);

      // Bot não pode moderar cargos >= ao dele
      if (target.roles.highest.position >= botMember.roles.highest.position) {
        return message
          .reply('❌ I cannot unmute this user (their role is higher or equal to my highest role).')
          .catch(() => null);
      }

      // Executor não deve moderar cargos >= ao dele (exceto admin)
      if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
        return message
          .reply('❌ You cannot unmute a user with an equal or higher role than yours.')
          .catch(() => null);
      }

      // ------------------------------
      // Verificar se está muted
      // ------------------------------
      if (typeof target.isCommunicationDisabled === 'function' && !target.isCommunicationDisabled()) {
        return message
          .reply(`⚠️ **${target.user.tag}** is not muted.`)
          .catch(() => null);
      }

      // ------------------------------
      // Remover timeout (unmute)
      // ------------------------------
      await target.timeout(null, `Unmuted by ${message.author.tag}`);

      await message.channel
        .send(`✅ **${target.user.tag}** has been unmuted.`)
        .catch(() => null);

      // ------------------------------
      // Buscar estado atual (warnings/trust) para mostrar no log
      // (não altera trust no unmute)
      // ------------------------------
      let dbUser = null;
      try {
        dbUser = await warningsService.getOrCreateUser(guild.id, target.id);
      } catch {
        // não bloqueia o unmute por falha no Mongo
      }

      const trustText = dbUser?.trust != null ? `\nTrust: **${dbUser.trust}**` : '';
      const warnsText = dbUser?.warnings != null ? `\nWarnings: **${dbUser.warnings}**` : '';

      // ------------------------------
      // Log (Discord + Dashboard)
      // ------------------------------
      await logger(
        client,
        'Manual Unmute',
        target.user,
        message.author,
        `User unmuted manually.${warnsText}${trustText}`,
        guild
      );
    } catch (err) {
      console.error('[unmute] Error:', err);
      message.reply('❌ Failed to unmute the user.').catch(() => null);
    }
  }
};
