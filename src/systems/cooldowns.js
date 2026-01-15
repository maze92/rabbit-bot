// src/systems/cooldowns.js
// ============================================================
// Sistema de cooldowns (anti-spam de comandos)
// - Controla quantas vezes um utilizador pode usar um comando
// - Cooldowns configuráveis no defaultConfig.js
// - Retorna:
//    - null -> pode executar
//    - "X.X" -> bloqueado, devolve segundos restantes (string)
// ============================================================

const config = require('../config/defaultConfig');

// Estrutura:
// cooldowns: Map<commandName, Map<userId, timestampMs>>
const cooldowns = new Map();

/**
 * Verifica se o utilizador está em cooldown para um comando.
 * @param {string} commandName - Nome do comando (ex: "mute", "warn", "clear")
 * @param {string} userId - ID do utilizador
 * @returns {string|null} - null se pode executar, ou string com segundos restantes (ex: "2.4")
 */
module.exports = function checkCooldown(commandName, userId) {
  const now = Date.now();

  // Cooldown específico por comando ou fallback para default
  const commandCooldown =
    config.cooldowns?.[commandName] ??
    config.cooldowns?.default ??
    3000; // fallback seguro (3s) caso config não tenha nada

  // Garante Map para esse comando
  if (!cooldowns.has(commandName)) {
    cooldowns.set(commandName, new Map());
  }

  const timestamps = cooldowns.get(commandName);

  // Se já existe timestamp, verifica expiração
  if (timestamps.has(userId)) {
    const lastUsed = timestamps.get(userId);
    const expiration = lastUsed + commandCooldown;

    if (now < expiration) {
      const remainingSeconds = ((expiration - now) / 1000).toFixed(1);
      return remainingSeconds; // bloqueado
    }
  }

  // Marca como usado agora
  timestamps.set(userId, now);

  // Remove automaticamente o registo depois do cooldown
  setTimeout(() => timestamps.delete(userId), commandCooldown);

  return null; // pode executar
};
