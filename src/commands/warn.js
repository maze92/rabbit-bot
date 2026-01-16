// src/commands/warn.js
// ============================================================
// Comando: !warn
//
// Faz:
// - Aplica 1 warning manual a um utilizador
// - Atualiza TRUST (via warningsService)
// - Regista infração no MongoDB (Infraction)
// - Regista log (Discord log-bot + Dashboard)
//
// Regras importantes:
// - Staff-only (config.staffRoles) OU Administrator
// - Respeita hierarquia:
//    - bot não pode agir em cargos >= ao dele
//    - executor não pode avisar cargos >= ao dele (anti-abuso)
// - Reason: extraído corretamente mesmo com mentions
// ============================================================

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const logger = require('../systems/logger');
const warningsService = require('../systems/warningsService');
const infractionsService = require('../systems/infractionsService');

/**
 * Remove do args o mention e/ou id do target, para o reason ficar limpo.
 * args pode vir com:
 * - ["<@123>", "spamming", "links"]
 * - ["<@!123>", "spamming"]
 * - ["123", "spamming"]
 */
function stripTargetFromArgs(args, targetId) {
  if (!Array.isArray(args) || !targetId) return [];

  return args.filter((a) => {
    if (!a) return false;

    const s = String(a);
    const isMention = s.includes(`<@${targetId}>`) || s.includes(`<@!${targetId}>`);
    const isRawId = s === targetId;

    return !isMention && !isRawId;
  });
}

/**
 * Verifica se o executor é staff:
 * - Admin bypass OU
 * - tem um role em config.staffRoles
 */
function isStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id));
}

module.exports = {
  name: 'warn',
  description: 'Issue a warning to a user',

  /**
   * Uso:
   * - !warn @user [reason...]
   */
  async execute(message, args, client) {
    try {
      // ------------------------------
      // Validações básicas
      // ------------------------------
      if (!message?.guild) return;
      if (!message.member) return;

      const guild = message.guild;
      const botMember = guild.members.me;

      if (!botMember) return;

      // ------------------------------
      // Permissão do executor (staff/admin)
      // ------------------------------
      if (!isStaff(message.member)) {
        return message
          .reply("❌ You don't have permission to use this command.")
          .catch(() => null);
      }

      // ------------------------------
      // Alvo
      // ------------------------------
      const target = message.mentions.members.first();
      if (!target) {
        return message
          .reply('❌ Usage: !warn @user [reason...]')
          .catch(() => null);
      }

      // Proteções básicas
      if (target.id === message.author.id) {
        return message.reply('❌ You cannot warn yourself.').catch(() => null);
      }

      if (target.id === client.user.id) {
        return message.reply('❌ You cannot warn the bot.').catch(() => null);
      }

      // ------------------------------
      // Hierarquia do Discord
      // ------------------------------
      // Bot não consegue moderar cargos >= ao dele
      if (target.roles.highest.position >= botMember.roles.highest.position) {
        return message
          .reply('❌ I cannot warn this user due to role hierarchy (my role is not high enough).')
          .catch(() => null);
      }

      // Executor não deve avisar cargos >= ao dele (anti-abuso)
      // (Admins podem ignorar)
      const executorIsAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
      if (!executorIsAdmin && target.roles.highest.position >= message.member.roles.highest.position) {
        return message
          .reply('❌ You cannot warn a user with an equal or higher role than yours.')
          .catch(() => null);
      }

      // (Opcional) evitar avisar administradores (podes remover se quiseres)
      if (!executorIsAdmin && target.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message
          .reply('❌ You cannot warn an Administrator.')
          .catch(() => null);
      }

      // ------------------------------
      // Reason (limpo, sem mention)
      // ------------------------------
      const cleanedArgs = stripTargetFromArgs(args, target.id);
      const reason = cleanedArgs.join(' ').trim() || 'No reason provided';

      // ------------------------------
      // DB: warnings + trust
      // - addWarning já faz:
      //   - regen lazy do trust
      //   - warnings++
      //   - trust -= warnPenalty
      // ------------------------------
      const dbUser = await warningsService.addWarning(guild.id, target.id, 1);

      // ------------------------------
      // Registar infração (Mongo)
      // ------------------------------
      await infractionsService.create({
        guild,
        user: target.user,
        moderator: message.author,
        type: 'WARN',
        reason,
        duration: null
      }).catch(() => null);

      // ------------------------------
      // Feedback no canal
      // ------------------------------
      await message.channel
        .send(
          `⚠️ ${target} has been warned.\n` +
          `**Total warnings:** ${dbUser.warnings}\n` +
          `📝 Reason: **${reason}**`
        )
        .catch(() => null);

      // ------------------------------
      // Log (Discord + Dashboard)
      // ------------------------------
      await logger(
        client,
        'Manual Warn',
        target.user,
        message.author,
        `Reason: **${reason}**\nTotal warnings: **${dbUser.warnings}**\nTrust: **${dbUser.trust ?? 'N/A'}**`,
        guild
      );

    } catch (err) {
      console.error('[warn] Error:', err);
      await message.reply('❌ An unexpected error occurred.').catch(() => null);
    }
  }
};
