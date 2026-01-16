// src/commands/warn.js

/**
 * v.1.0.0.1
 * ------------------------------------------------------------
 * Resumo:
 * - Implementação do comando manual !warn
 * - Aplica warnings e penalização de trust
 * - Regista infrações e logs (Discord + Dashboard)
 *
 * Notas:
 * - Apenas staff ou administradores
 * - Respeita hierarquia de cargos do Discord
 * ------------------------------------------------------------
 */

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const logger = require('../systems/logger');
const warningsService = require('../systems/warningsService');
const infractionsService = require('../systems/infractionsService');

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

// * verifica se o executor é staff:
function isStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id));
}

// tenta enviar DM ao user (sem crashar se DMs estiverem fechadas)
async function trySendDM(user, content) {
  try {
    if (!user) return;
    if (!content) return;
    await user.send({ content }).catch(() => null);
  } catch {
    // nunca deixar o comando falhar por causa de DM
  }
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
      // validações básicas
      if (!message?.guild) return;
      if (!message.member) return;

      const guild = message.guild;
      const botMember = guild.members.me;

      if (!botMember) return;

      // permissão do executor (staff/admin)
      if (!isStaff(message.member)) {
        return message
          .reply("❌ You don't have permission to use this command.")
          .catch(() => null);
      }

      // alvo
      const target = message.mentions.members.first();
      if (!target) {
        return message
          .reply('❌ Usage: !warn @user [reason...]')
          .catch(() => null);
      }

      // proteções básicas
      if (target.id === message.author.id) {
        return message.reply('❌ You cannot warn yourself.').catch(() => null);
      }

      if (target.id === client.user.id) {
        return message.reply('❌ You cannot warn the bot.').catch(() => null);
      }

      // bot não consegue moderar cargos >= ao dele
      if (target.roles.highest.position >= botMember.roles.highest.position) {
        return message
          .reply('❌ I cannot warn this user due to role hierarchy (my role is not high enough).')
          .catch(() => null);
      }

      // executor não deve avisar cargos >= ao dele (anti-abuso)
      const executorIsAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
      if (!executorIsAdmin && target.roles.highest.position >= message.member.roles.highest.position) {
        return message
          .reply('❌ You cannot warn a user with an equal or higher role than yours.')
          .catch(() => null);
      }

      // (opcional) evitar avisar administradores (podes remover se quiseres)
      if (!executorIsAdmin && target.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message
          .reply('❌ You cannot warn an Administrator.')
          .catch(() => null);
      }

      // reason (limpo, sem mention)
      const cleanedArgs = stripTargetFromArgs(args, target.id);
      const reason = cleanedArgs.join(' ').trim() || 'No reason provided';

      const dbUser = await warningsService.addWarning(guild.id, target.id, 1);

      // registar infração (Mongo)
      await infractionsService.create({
        guild,
        user: target.user,
        moderator: message.author,
        type: 'WARN',
        reason,
        duration: null
      }).catch(() => null);

      // feedback no canal
      await message.channel
        .send(
          `⚠️ ${target} has been warned.\n` +
          `**Total warnings:** ${dbUser.warnings}\n` +
          `📝 Reason: **${reason}**`
        )
        .catch(() => null);

      // DM ao utilizador
      if (config.notifications?.dmOnWarn) {
        const trustText = dbUser?.trust != null ? `\n🔐 Trust: **${dbUser.trust}**` : '';

        const dmText =
          `⚠️ You received a **WARN** on the server. **${guild.name}**.\n` +
          `📝 Reason: **${reason}**\n` +
          `📌 Total warnings: **${dbUser.warnings}**` +
          trustText;

        await trySendDM(target.user, dmText);
      }

      // log (Discord + Dashboard)
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
