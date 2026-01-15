// src/commands/mute.js

const { PermissionsBitField } = require('discord.js');
const logger = require('../systems/logger');
const config = require('../config/defaultConfig');

/**
 * Converte um texto tipo "10m", "1h", "2d" para milissegundos.
 * Suporta:
 * - s (segundos)
 * - m (minutos)
 * - h (horas)
 * - d (dias)
 */
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

/**
 * Formata ms para texto curto (ex: 600000 -> "10m")
 * (apenas para mensagens/logs)
 */
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

module.exports = {
  name: 'mute',
  description: 'Timeout (mute) a user with optional duration and reason',

  // Cargos autorizados (checado no messageCreate; aqui é redundância segura)
  allowedRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  /**
   * Uso:
   * - !mute @user 10m reason...
   * - !mute @user reason...
   */
  async execute(message, args, client) {
    try {
      // ------------------------------
      // Validações básicas
      // ------------------------------
      if (!message.guild) return;

      const executorMember = message.member;
      const botMember = message.guild.members.me;

      if (!executorMember || !botMember) {
        return message.reply('❌ Could not resolve members (executor/bot).');
      }

      // ------------------------------
      // Permissões do bot
      // - Timeout exige "Moderate Members"
      // ------------------------------
      const botPerms = message.channel.permissionsFor(botMember);
      if (!botPerms?.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('❌ I do not have permission to timeout members (Moderate Members).');
      }

      // ------------------------------
      // Utilizador alvo
      // ------------------------------
      const targetMember = message.mentions.members.first();
      if (!targetMember) {
        return message.reply(`❌ Usage: ${config.prefix}mute @user [10m/1h/2d] [reason...]`);
      }

      // Não mutar bots (boa prática)
      if (targetMember.user.bot) {
        return message.reply('⚠️ You cannot mute a bot.');
      }

      // Opcional: evitar “re-mute” (podes remover se não quiseres)
      if (targetMember.isCommunicationDisabled()) {
        return message.reply(`⚠️ **${targetMember.user.tag}** is already muted.`);
      }

      // ------------------------------
      // Proteções de hierarquia
      // ------------------------------
      // Bot não pode moderar alguém com cargo >= ao dele
      if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
        return message.reply('❌ I cannot mute this user (their role is higher or equal to my highest role).');
      }

      // Executor não pode moderar alguém com cargo >= ao dele (anti-abuso)
      if (targetMember.roles.highest.position >= executorMember.roles.highest.position) {
        return message.reply('❌ You cannot mute this user (their role is higher or equal to yours).');
      }

      // Opcional: se o alvo for admin, bloqueia (evita confusões)
      if (targetMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply('❌ You cannot mute an Administrator.');
      }

      // ------------------------------
      // Normalizar args (remover mention)
      // - args normalmente vem assim: ["<@id>", "10m", "reason..."]
      // - removemos tudo que seja mention/id do target
      // ------------------------------
      const cleanedArgs = args.filter(a => {
        const isMention = a.includes(`<@${targetMember.id}>`) || a.includes(`<@!${targetMember.id}>`);
        const isRawId = a === targetMember.id;
        return !isMention && !isRawId;
      });

      // ------------------------------
      // Duração e motivo
      // ------------------------------
      // Se o primeiro argumento for duração válida, usa-a
      const possibleDuration = cleanedArgs[0];
      const parsed = parseDuration(possibleDuration);

      const durationMs =
        parsed ||
        config.muteDuration ||
        10 * 60 * 1000;

      // Motivo começa depois da duração (se existir), senão começa no primeiro arg
      const reasonStartIndex = parsed ? 1 : 0;
      const reason = cleanedArgs.slice(reasonStartIndex).join(' ').trim() || 'No reason provided';

      // Limite do Discord para timeout: 28 dias
      const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
      if (durationMs > MAX_TIMEOUT_MS) {
        return message.reply('❌ Timeout duration cannot exceed 28 days.');
      }

      // ------------------------------
      // Aplicar timeout
      // ------------------------------
      await targetMember.timeout(durationMs, `Muted by ${message.author.tag}: ${reason}`);

      await message.channel.send(
        `🔇 **${targetMember.user.tag}** has been muted for **${formatDuration(durationMs)}**.\n📝 Reason: **${reason}**`
      ).catch(() => null);

      // ------------------------------
      // Log no Discord + Dashboard (via logger centralizado)
      // ------------------------------
      await logger(
        client,
        'Manual Mute',
        targetMember.user,     // user afetado (User do Discord)
        message.author,        // executor
        `Duration: **${formatDuration(durationMs)}**\nReason: **${reason}**`,
        message.guild          // guild obrigatória para garantir log
      );

    } catch (err) {
      console.error('[mute] Error:', err);
      return message.reply('❌ Failed to mute the user. Check my permissions and role hierarchy.');
    }
  }
};
