// src/commands/mute.js

/**
 * Comando: !mute
 *
 * Faz:
 * - Aplica timeout (mute) a um utilizador
 * - Aceita duração opcional (ex: 10m, 1h, 2d) + motivo opcional
 * - Protegido por cargos (allowedRoles) ou Administrator
 * - Respeita hierarquia (bot e executor)
 * - Regista no log-bot + dashboard (via logger centralizado)
 *
 * Uso:
 * - !mute @user 10m reason...
 * - !mute @user reason...
 * - !mute @user
 */

const { PermissionsBitField } = require('discord.js');
const logger = require('../systems/logger');
const config = require('../config/defaultConfig');

/**
 * Converte texto tipo "10m", "1h", "2d" para milissegundos.
 * Suporta:
 * - s (segundos)
 * - m (minutos)
 * - h (horas)
 * - d (dias)
 *
 * Retorna:
 * - number (ms) ou null se inválido
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
 * Formata milissegundos para texto curto (ex: 600000 -> "10m")
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

      const prefix = config.prefix || '!';
      const executorMember = message.member;
      const botMember = message.guild.members.me;

      if (!executorMember || !botMember) {
        return message.reply('❌ Could not resolve members (executor/bot).');
      }

      // ------------------------------
      // Permissões do executor
      // - allowedRoles OU Administrator
      // ------------------------------
      const hasAllowedRole = executorMember.roles.cache.some(role =>
        this.allowedRoles.includes(role.id)
      );

      const isAdmin = executorMember.permissions.has(
        PermissionsBitField.Flags.Administrator
      );

      if (!hasAllowedRole && !isAdmin) {
        return message.reply("❌ You don't have permission to use this command.");
      }

      // ------------------------------
      // Permissões do bot no canal
      // - Timeout exige ModerateMembers
      // ------------------------------
      const botPerms = message.channel.permissionsFor(botMember);
      if (!botPerms?.has(PermissionsBitField.Flags.ViewChannel)) return;

      if (!botPerms.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('❌ I need **Moderate Members** permission to timeout members.');
      }

      // ------------------------------
      // Utilizador alvo
      // ------------------------------
      const targetMember = message.mentions.members.first();
      if (!targetMember) {
        return message.reply(`❌ Usage: ${prefix}mute @user [10m/1h/2d] [reason...]`);
      }

      // Não moderar bots
      if (targetMember.user.bot) {
        return message.reply('⚠️ You cannot mute a bot.');
      }

      // Não permitir mutar a si próprio
      if (targetMember.id === executorMember.id) {
        return message.reply('❌ You cannot mute yourself.');
      }

      // Não mutar o bot
      if (targetMember.id === client.user.id) {
        return message.reply('❌ You cannot mute the bot.');
      }

      // Se já estiver muted, não reaplica (evita spam)
      if (targetMember.isCommunicationDisabled()) {
        return message.reply(`⚠️ **${targetMember.user.tag}** is already muted.`);
      }

      // ------------------------------
      // Hierarquia Discord
      // - Bot não pode moderar cargos >= bot
      // - Executor não pode moderar cargos >= executor (exceto admin)
      // ------------------------------
      if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
        return message.reply('❌ I cannot mute this user (their role is higher/equal to my highest role).');
      }

      if (!isAdmin && targetMember.roles.highest.position >= executorMember.roles.highest.position) {
        return message.reply('❌ You cannot mute this user (their role is higher/equal to yours).');
      }

      // (Opcional mas recomendado) bloquear admins
      if (targetMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply('❌ You cannot mute an Administrator.');
      }

      // ------------------------------
      // Normalizar args (remover mention do array)
      // - args pode vir assim: ["<@id>", "10m", "reason..."]
      // - removemos o mention e/ou id cru do target
      // ------------------------------
      const cleanedArgs = (args || []).filter(a => {
        const isMention = a.includes(`<@${targetMember.id}>`) || a.includes(`<@!${targetMember.id}>`);
        const isRawId = a === targetMember.id;
        return !isMention && !isRawId;
      });

      // ------------------------------
      // Duração e motivo
      // ------------------------------
      const possibleDuration = cleanedArgs[0];
      const parsedDuration = parseDuration(possibleDuration);

      const durationMs = parsedDuration || config.muteDuration || 10 * 60 * 1000;

      const reasonStartIndex = parsedDuration ? 1 : 0;
      const reason = cleanedArgs.slice(reasonStartIndex).join(' ').trim() || 'No reason provided';

      // Limite Discord para timeout: 28 dias
      const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
      if (durationMs > MAX_TIMEOUT_MS) {
        return message.reply('❌ Timeout duration cannot exceed 28 days.');
      }

      // ------------------------------
      // Aplicar timeout (mute)
      // ------------------------------
      await targetMember.timeout(durationMs, `Muted by ${message.author.tag}: ${reason}`);

      await message.channel
        .send(`🔇 **${targetMember.user.tag}** has been muted for **${formatDuration(durationMs)}**.\n📝 Reason: **${reason}**`)
        .catch(() => null);

      // ------------------------------
      // Log (Discord + dashboard)
      // ------------------------------
      await logger(
        client,
        'Manual Mute',
        targetMember.user,
        message.author,
        `Channel: #${message.channel.name}\nDuration: **${formatDuration(durationMs)}**\nReason: **${reason}**`,
        message.guild
      );
    } catch (err) {
      console.error('[mute] Error:', err);
      return message.reply('❌ Failed to mute the user. Check my permissions and role hierarchy.');
    }
  }
};
