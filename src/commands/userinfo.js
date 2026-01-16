// src/commands/userinfo.js
// ============================================================
// Comando: !userinfo
// ------------------------------------------------------------
// Mostra info básica do utilizador na guild, incluindo:
// - Tag + ID
// - Data de criação da conta
// - Data de entrada no servidor
// - Número de warnings (User model)
// - Trust Score + nível de risco (APENAS para staff)
// ------------------------------------------------------------
// Uso:
// - !userinfo              → mostra info do autor da mensagem
// - !userinfo @user        → mostra info do user mencionado
// - !userinfo 1234567890   → tenta buscar pelo ID
// ============================================================

const { EmbedBuilder, PermissionsBitField } = require('discord.js');

const config = require('../config/defaultConfig');
const warningsService = require('../systems/warningsService');
const Infraction = require('../database/models/Infraction'); // opcional: estatísticas

// ------------------------------------------------------------
// Helpers de Trust (mesma filosofia que no AutoMod / warningsService)
// ------------------------------------------------------------
function getTrustConfig() {
  const cfg = config.trust || {};

  return {
    enabled: cfg.enabled !== false,
    base: cfg.base ?? 30,
    min: cfg.min ?? 0,
    max: cfg.max ?? 100,
    lowThreshold: cfg.lowThreshold ?? 10,
    highThreshold: cfg.highThreshold ?? 60
  };
}

/**
 * Converte valor de trust para um "nível de risco" legível.
 */
function getTrustLabel(trust, trustCfg) {
  if (!trustCfg.enabled) return 'N/A';

  const t = Number.isFinite(trust) ? trust : trustCfg.base;

  if (t <= trustCfg.lowThreshold) return 'High risk';
  if (t >= trustCfg.highThreshold) return 'Low risk';
  return 'Medium risk';
}

/**
 * Verifica se o membro é staff (Admin ou role em config.staffRoles)
 */
function isStaff(member) {
  if (!member) return false;

  // Admin bypass
  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  if (!staffRoles.length) return false;

  return member.roles?.cache?.some((r) => staffRoles.includes(r.id));
}

/**
 * Tenta resolver o target:
 * - @mention
 * - ID
 * - fallback: autor
 */
async function resolveTarget(message, args) {
  const guild = message.guild;

  // 1) mention
  const byMention = message.mentions.members.first();
  if (byMention) return byMention;

  // 2) ID
  const raw = args[0];
  if (raw) {
    try {
      const byId = await guild.members.fetch(raw).catch(() => null);
      if (byId) return byId;
    } catch {
      // ignorar
    }
  }

  // 3) fallback → próprio autor
  return message.member;
}

module.exports = {
  name: 'userinfo',
  description: 'Shows information about a user, including warnings and trust score (trust visible to staff only)',

  /**
   * Execução do comando
   * @param {Message} message
   * @param {string[]} args
   * @param {Client} client
   */
  async execute(message, args, client) {
    try {
      if (!message.guild) return;

      const guild = message.guild;
      const trustCfg = getTrustConfig();
      const requesterIsStaff = isStaff(message.member);

      // --------------------------------------------------------
      // Resolver alvo (user)
      // --------------------------------------------------------
      const member = await resolveTarget(message, args);
      if (!member) {
        return message.reply('❌ I could not resolve that user.').catch(() => null);
      }

      const user = member.user;

      // --------------------------------------------------------
      // Carregar dados do User model (warnings + trust)
// --------------------------------------------------------
      const dbUser = await warningsService.getOrCreateUser(guild.id, user.id);

      const warnings = dbUser.warnings ?? 0;
      const trustValue = Number.isFinite(dbUser.trust) ? dbUser.trust : trustCfg.base;
      const trustLabel = getTrustLabel(trustValue, trustCfg);

      // --------------------------------------------------------
      // (Opcional) Estatísticas rápidas de infrações
      // --------------------------------------------------------
      let infractionsCount = 0;
      try {
        infractionsCount = await Infraction.countDocuments({
          guildId: guild.id,
          userId: user.id
        });
      } catch {
        // se falhar, não é crítico
      }

      // --------------------------------------------------------
      // Datas / formato
      // --------------------------------------------------------
      const createdAt = user.createdAt
        ? `<t:${Math.floor(user.createdAt.getTime() / 1000)}:F>`
        : 'Unknown';

      const joinedAt = member.joinedAt
        ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>`
        : 'Unknown';

      // --------------------------------------------------------
      // Campo de Trust: staff vê tudo, resto vê texto neutro
      // --------------------------------------------------------
      let trustFieldValue = 'Trust system is currently **disabled**.';
      if (trustCfg.enabled) {
        if (requesterIsStaff) {
          // Staff → vê trust real + label
          trustFieldValue =
            `Trust: **${trustValue}/${trustCfg.max}**\n` +
            `Risk level: **${trustLabel}**`;
        } else {
          // Utilizador normal → não expomos trust numérico
          trustFieldValue =
            'Trust Score is **internal** and only visible to staff.\n' +
            'Moderation decisions may be stricter for repeat offenders.';
        }
      }

      // --------------------------------------------------------
      // Montar embed
      // --------------------------------------------------------
      const embed = new EmbedBuilder()
        .setTitle(`User Info - ${user.tag}`)
        .setColor('Blue')
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          {
            name: '👤 User',
            value: `Tag: **${user.tag}**\nID: \`${user.id}\``,
            inline: false
          },
          {
            name: '📅 Account',
            value: `Created at: ${createdAt}\nJoined this server: ${joinedAt}`,
            inline: false
          },
          {
            name: '⚠️ Warnings',
            value:
              `**${warnings}** / **${config.maxWarnings ?? 3}** (AutoMod base)\n` +
              `Infractions registered: **${infractionsCount}**`,
            inline: false
          },
          {
            name: '🔐 Trust Score',
            value: trustFieldValue,
            inline: false
          }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp(new Date());

      await message.channel.send({ embeds: [embed] }).catch(() => null);

    } catch (err) {
      console.error('[userinfo] Error:', err);
      await message
        .reply('❌ An unexpected error occurred while fetching user info.')
        .catch(() => null);
    }
  }
};
