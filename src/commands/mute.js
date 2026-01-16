// src/commands/mute.js

/**
 * v.1.0.0.1
 * ------------------------------------------------------------
 * Resumo:
 * - Implementação do comando manual !mute (timeout)
 * - Suporte a duração customizada (s/m/h/d)
 * - Atualiza trust e cria infração MUTE
 *
 * Notas:
 * - Timeout máximo de 28 dias (limite Discord)
 * - Integra com warningsService e logger
 * ------------------------------------------------------------
 */

const { PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const logger = require('../systems/logger');
const infractionsService = require('../systems/infractionsService');
const warningsService = require('../systems/warningsService');

// ------------------------------------------------------------
// Helpers de duração
// ------------------------------------------------------------
function parseDuration(input) {
  if (!input || typeof input !== 'string') return null;

  const match = input.trim().toLowerCase().match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (!value || value <= 0) return null;

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (day >= 1 && day * 24 * 60 * 60 * 1000 === ms) return `${day}d`;
  if (hour >= 1 && hour * 60 * 60 * 1000 === ms) return `${hour}h`;
  if (min >= 1 && min * 60 * 1000 === ms) return `${min}m`;
  return `${sec}s`;
}

// ------------------------------------------------------------
// Helpers de staff / roles / args
// ------------------------------------------------------------

/**
 * Verifica se o membro é staff:
 * - Admin bypass OU
 * - tem algum role em config.staffRoles
 */
function isStaff(member) {
  if (!member) return false;

  const isAdmin = member.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id));
}

/**
 * Remove mention/id do alvo dos args, para o motivo ficar limpo.
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
 * Tenta enviar DM ao utilizador (não deixa o comando falhar se der erro).
 */
async function trySendDM(user, content) {
  try {
    if (!user || !content) return;
    await user.send({ content }).catch(() => null);
  } catch {
    // ignorar falhas de DM (user com DMs fechadas, etc.)
  }
}

module.exports = {
  name: 'mute',
  description: 'Timeout (mute) a user with optional duration and reason',

  /**
   * Uso:
   * - !mute @user 10m motivo...
   * - !mute @user motivo...
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
      // Permissões do BOT (timeout = ModerateMembers)
      // ------------------------------
      const perms = message.channel.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message
          .reply('❌ I do not have permission to timeout members (Moderate Members).')
          .catch(() => null);
      }

      // ------------------------------
      // Alvo
      // ------------------------------
      const target = message.mentions.members.first();
      if (!target) {
        return message
          .reply(`❌ Usage: ${config.prefix}mute @user [10m/1h/2d] [reason...]`)
          .catch(() => null);
      }

      // Proteções básicas
      if (target.id === message.author.id) {
        return message.reply('❌ You cannot mute yourself.').catch(() => null);
      }

      if (target.id === client.user.id) {
        return message.reply('❌ You cannot mute the bot.').catch(() => null);
      }

      if (target.user.bot) {
        return message.reply('⚠️ You cannot mute a bot.').catch(() => null);
      }

      // Já está muted?
      if (typeof target.isCommunicationDisabled === 'function' && target.isCommunicationDisabled()) {
        return message
          .reply(`⚠️ **${target.user.tag}** is already muted.`)
          .catch(() => null);
      }

      // ------------------------------
      // Hierarquia
      // ------------------------------
      const executorIsAdmin = executor.permissions.has(PermissionsBitField.Flags.Administrator);

      // Bot não pode moderar cargos >= ao dele
      if (target.roles.highest.position >= botMember.roles.highest.position) {
        return message
          .reply('❌ I cannot mute this user (their role is higher or equal to my highest role).')
          .catch(() => null);
      }

      // Executor não deve mutar cargos >= ao dele (exceto admin)
      if (!executorIsAdmin && target.roles.highest.position >= executor.roles.highest.position) {
        return message
          .reply('❌ You cannot mute a user with an equal or higher role than yours.')
          .catch(() => null);
      }

      // (Opcional) não mutar administradores, exceto se executor for admin
      if (!executorIsAdmin && target.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message
          .reply('❌ You cannot mute an Administrator.')
          .catch(() => null);
      }

      // ------------------------------
      // Normalizar args (remover mention/id do alvo)
      // ------------------------------
      const cleanedArgs = stripTargetFromArgs(args, target.id);

      // ------------------------------
      // Duração + motivo
      // ------------------------------
      const possibleDuration = cleanedArgs[0];
      const parsed = parseDuration(possibleDuration);

      const durationMs =
        parsed ||
        config.muteDuration ||
        10 * 60 * 1000; // fallback 10m

      // Limite Discord: 28 dias
      const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
      if (durationMs > MAX_TIMEOUT_MS) {
        return message
          .reply('❌ Timeout duration cannot exceed 28 days.')
          .catch(() => null);
      }

      const reasonStartIndex = parsed ? 1 : 0;
      const reason =
        cleanedArgs.slice(reasonStartIndex).join(' ').trim() ||
        'No reason provided';

      // ------------------------------
      // Aplicar timeout (mute)
      // ------------------------------
      await target.timeout(
        durationMs,
        `Muted by ${message.author.tag}: ${reason}`
      );

      // ------------------------------
      // Atualizar TRUST / estado no Mongo
      // ------------------------------
      // Nota: applyMutePenalty faz parte do novo warningsService.
      // Se por algum motivo não existir, não crasha (optional chaining).
      let dbUser = null;
      try {
        if (typeof warningsService.applyMutePenalty === 'function') {
          dbUser = await warningsService.applyMutePenalty(
            guild.id,
            target.id,
            durationMs
          );
        } else {
          // fallback: ao menos garante que o user existe
          dbUser = await warningsService.getOrCreateUser(guild.id, target.id);
        }
      } catch (e) {
        console.error('[mute] warningsService error:', e);
      }

      // ------------------------------
      // ✅ DM ao utilizador (Ponto 3.1)
      // ------------------------------
      if (config.notifications?.dmOnMute) {
        const trustText = dbUser?.trust != null ? `\n🔐 Trust: **${dbUser.trust}**` : '';

        const dmText =
          `🔇 You have been temporarily **muted** on the server. **${guild.name}**.\n` +
          `⏰ Duration: **${formatDuration(durationMs)}**\n` +
          `📝 Reason: **${reason}**` +
          trustText;

        await trySendDM(target.user, dmText);
      }

      // ------------------------------
      // Registar infração MUTE no Mongo
      // ------------------------------
      await infractionsService
        .create({
          guild,
          user: target.user,
          moderator: message.author,
          type: 'MUTE',
          reason,
          duration: durationMs
        })
        .catch(() => null);

      // ------------------------------
      // Feedback no canal
      // ------------------------------
      await message.channel
        .send(
          `🔇 **${target.user.tag}** has been muted for **${formatDuration(
            durationMs
          )}**.\n📝 Reason: **${reason}**`
        )
        .catch(() => null);

      // ------------------------------
      // Log (Discord + Dashboard)
      // ------------------------------
      const trustText = dbUser?.trust != null ? `\nTrust: **${dbUser.trust}**` : '';

      await logger(
        client,
        'Manual Mute',
        target.user,
        message.author,
        `Duration: **${formatDuration(durationMs)}**\nReason: **${reason}**${trustText}`,
        guild
      );
    } catch (err) {
      console.error('[mute] Error:', err);
      message
        .reply(
          '❌ Failed to mute the user. Check my permissions and role hierarchy.'
        )
        .catch(() => null);
    }
  }
};
