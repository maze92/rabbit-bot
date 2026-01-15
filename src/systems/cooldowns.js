// src/systems/cooldowns.js
// ============================================================
// Sistema de cooldowns (anti-spam de comandos)
//
// Objetivo:
// - Controlar quantas vezes um utilizador pode usar um comando
// - Cooldowns configuráveis no defaultConfig.js
//
// Retorno:
// - null  -> pode executar
// - "X.X" -> bloqueado, devolve segundos restantes (string)
// ============================================================

const config = require('../config/defaultConfig');

// Estrutura interna:
// cooldowns: Map<commandName, Map<userId, lastUsedTimestampMs>>
const cooldowns = new Map();

/**
 * Verifica se o utilizador está em cooldown para um comando.
 * @param {string} commandName - Nome do comando (ex: "mute", "warn", "clear")
 * @param {string} userId - ID do utilizador
 * @returns {string|null} - null se pode executar, ou string com segundos restantes (ex: "2.4")
 */
module.exports = function checkCooldown(commandName, userId) {
  // ------------------------------
  // Validações mínimas (segurança)
  // ------------------------------
  if (!commandName || !userId) return null;

  const now = Date.now();

  // Normalizar nome do comando (evita casos como "Mute" vs "mute")
  const cmd = String(commandName).toLowerCase();

  // ------------------------------
  // Determinar cooldown do comando
  // - tenta config.cooldowns[cmd]
  // - fallback: config.cooldowns.default
  // - fallback final: 3000ms (3s)
  // ------------------------------
  let commandCooldown =
    config.cooldowns?.[cmd] ??
    config.cooldowns?.default ??
    3000;

  // Garantir que é um número válido
  if (typeof commandCooldown !== 'number' || Number.isNaN(commandCooldown) || commandCooldown < 0) {
    commandCooldown = 3000;
  }

  // ------------------------------
  // Garantir Map para este comando
  // ------------------------------
  if (!cooldowns.has(cmd)) {
    cooldowns.set(cmd, new Map());
  }

  const timestamps = cooldowns.get(cmd);

  // ------------------------------
  // Se já existe timestamp, verificar expiração
  // ------------------------------
  if (timestamps.has(userId)) {
    const lastUsed = timestamps.get(userId);
    const expiration = lastUsed + commandCooldown;

    if (now < expiration) {
      const remainingSeconds = ((expiration - now) / 1000).toFixed(1);
      return remainingSeconds; // bloqueado
    }
  }

  // ------------------------------
  // Registar uso e agendar limpeza
  // ------------------------------
  timestamps.set(userId, now);

  // Remove automaticamente o registo após o cooldown
  setTimeout(() => {
    // Segurança: pode já ter sido limpo manualmente
    timestamps.delete(userId);
  }, commandCooldown);

  return null; // pode executar
};
