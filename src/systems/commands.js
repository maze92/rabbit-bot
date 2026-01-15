// src/systems/commands.js
// ============================================================
// Handler centralizado de comandos prefixados
//
// Faz:
// - Detecta comandos com prefixo (ex: !clear, !mute)
// - Usa APENAS os comandos já carregados no client.commands (index.js)
// - Aplica cooldown por comando e por utilizador (cooldowns.js)
// - Aplica permissões por cargos (allowedRoles) com bypass Admin
// - Faz whitelist: apenas clear/warn/mute/unmute (evita comandos “antigos”)
// - Executa com assinatura padrão: execute(message, args, client)
//
// NOTA IMPORTANTE:
// - Este ficheiro NÃO deve carregar comandos do disco.
// - O carregamento deve acontecer apenas no src/index.js
// ============================================================

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');
const checkCooldown = require('./cooldowns');

// Apenas estes comandos ficam ativos (como combinámos)
const ALLOWED_COMMANDS = new Set(['clear', 'warn', 'mute', 'unmute']);

/**
 * Verifica se o membro pode executar um comando com base em roles/permissões
 * @param {GuildMember} member
 * @param {string[]} allowedRoles
 * @returns {boolean}
 */
function canUseCommand(member, allowedRoles) {
  if (!member) return false;

  // Admin bypass
  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    // Se não existir allowedRoles no comando, então não bloqueia por roles
    return true;
  }

  // Caso exista allowedRoles, tem de ter pelo menos um desses cargos
  return member.roles.cache.some((role) => allowedRoles.includes(role.id));
}

/**
 * Handler principal de comandos
 * @param {Message} message
 * @param {Client} client
 */
module.exports = async function commandsHandler(message, client) {
  try {
    // ------------------------------------------------------------
    // Validações básicas
    // ------------------------------------------------------------
    if (!message?.content) return;
    if (!message.guild) return;          // Ignora DMs
    if (message.author?.bot) return;     // Ignora bots

    // ------------------------------------------------------------
    // Partials: às vezes a mensagem chega incompleta
    // ------------------------------------------------------------
    if (message.partial) {
      try {
        await message.fetch();
      } catch {
        return;
      }
    }

    const prefix = config.prefix || '!';
    if (!message.content.startsWith(prefix)) return;

    // Evita executar com apenas "!"
    if (message.content.trim() === prefix) return;

    // ------------------------------------------------------------
    // Garantir member para checks de roles/perms
    // ------------------------------------------------------------
    if (!message.member) {
      try {
        await message.guild.members.fetch(message.author.id);
      } catch {
        await message
          .reply('❌ I could not verify your roles. Please try again.')
          .catch(() => null);
        return;
      }
    }

    // ------------------------------------------------------------
    // Parse do comando e argumentos
    // Ex: "!mute @user 10m reason..." -> commandName="mute", args=[...]
    // ------------------------------------------------------------
    const args = message.content
      .slice(prefix.length)
      .trim()
      .split(/\s+/);

    const commandName = (args.shift() || '').toLowerCase();
    if (!commandName) return;

    // ------------------------------------------------------------
    // Whitelist: só estes comandos podem executar
    // ------------------------------------------------------------
    if (!ALLOWED_COMMANDS.has(commandName)) {
      return; // silencioso por segurança
    }

    // ------------------------------------------------------------
    // Buscar comando do Map carregado no index.js
    // ------------------------------------------------------------
    const command = client.commands?.get(commandName);
    if (!command) return;

    // ------------------------------------------------------------
    // Cooldown por comando (config.cooldowns)
    // ------------------------------------------------------------
    const remaining = checkCooldown(commandName, message.author.id);
    if (remaining) {
      await message
        .reply(`⏳ Please slow down. Try again in **${remaining}s**.`)
        .catch(() => null);
      return;
    }

    // ------------------------------------------------------------
    // Permissões por roles (allowedRoles) + Admin bypass
    // ------------------------------------------------------------
    if (!canUseCommand(message.member, command.allowedRoles)) {
      await message
        .reply("❌ You don't have permission to use this command.")
        .catch(() => null);
      return;
    }

    // ------------------------------------------------------------
    // Executar comando (assinatura padrão)
    // ------------------------------------------------------------
    await command.execute(message, args, client);
  } catch (err) {
    console.error('[commands] Critical error:', err);
    await message.reply('⚠️ Error executing command.').catch(() => null);
  }
};
