// src/systems/commands.js
// ============================================================
// Sistema centralizado de comandos (prefixados)
// Faz:
// - Carrega comandos da pasta /src/commands
// - Interpreta mensagens com prefix (ex: !clear, !mute)
// - Aplica cooldown (anti-spam) por utilizador e por comando
// - Aplica permissões por cargos (allowedRoles)
// - Executa o comando com assinatura padrão: execute(message, args, client)
// ============================================================

const fs = require('fs');
const path = require('path');
const config = require('../config/defaultConfig');
const checkCooldown = require('./cooldowns'); // ✅ substitui o rateLimit.js

// Map interno de comandos (carregado uma vez ao iniciar o bot)
const commands = new Map();

// ------------------------------------------------------------
// Carregar comandos do /src/commands
// Nota: __dirname aqui é /src/systems, por isso ../commands aponta para /src/commands
// ------------------------------------------------------------
const commandsDir = path.join(__dirname, '../commands');

const commandFiles = fs
  .readdirSync(commandsDir)
  .filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsDir, file);

  // require() com path absoluto evita problemas de path em Railway
  const command = require(filePath);

  if (!command?.name || typeof command.execute !== 'function') {
    console.warn(`[commands] Skipped invalid command file: ${file}`);
    continue;
  }

  commands.set(command.name, command);
}

/**
 * Handler principal de comandos
 * @param {Message} message - Mensagem do Discord
 * @param {Client} client - Client do Discord.js
 */
module.exports = async function commandsHandler(message, client) {
  try {
    // ------------------------------------------------------------
    // Validações básicas
    // ------------------------------------------------------------
    if (!message?.content) return;
    if (!message.guild) return;           // ignora DMs
    if (message.author?.bot) return;      // ignora bots

    const prefix = config.prefix || '!';
    if (!message.content.startsWith(prefix)) return;

    // ------------------------------------------------------------
    // Garantir member (em casos raros pode vir vazio)
    // ------------------------------------------------------------
    if (!message.member) {
      try {
        await message.guild.members.fetch(message.author.id);
      } catch {
        // Se falhar, continuamos na mesma, mas allowedRoles pode falhar
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

    const command = commands.get(commandName);
    if (!command) return;

    // ------------------------------------------------------------
    // Cooldown / rate limit por comando (configurável no defaultConfig.js)
    // ------------------------------------------------------------
    const remaining = checkCooldown(command.name, message.author.id);
    if (remaining) {
      return message.reply(`⏳ Please slow down. Try again in **${remaining}s**.`);
    }

    // ------------------------------------------------------------
    // Verificação de cargos permitidos (allowedRoles)
    // - Se o comando definir allowedRoles, só esses cargos podem usar
    // - Se não existir member (muito raro), bloqueia por segurança
    // ------------------------------------------------------------
    if (Array.isArray(command.allowedRoles) && command.allowedRoles.length > 0) {
      if (!message.member) {
        return message.reply('❌ I could not verify your roles. Please try again.');
      }

      const hasAllowedRole = message.member.roles.cache.some((role) =>
        command.allowedRoles.includes(role.id)
      );

      if (!hasAllowedRole) {
        return message.reply('❌ You do not have permission to use this command.');
      }
    }

    // ------------------------------------------------------------
    // Executar comando
    // Assinatura padrão: execute(message, args, client)
    // ------------------------------------------------------------
    await command.execute(message, args, client);

  } catch (err) {
    console.error('[commands] Critical error:', err);
    try {
      await message.reply('⚠️ Error executing command.');
    } catch {
      // silêncio
    }
  }
};
