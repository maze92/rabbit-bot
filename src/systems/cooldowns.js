// src/systems/cooldowns.js

const config = require('../config/defaultConfig');

const cooldowns = new Map();

function getCommandCooldownMs(commandName) {
  const raw =
    (config.cooldowns && config.cooldowns[commandName]) ??
    (config.cooldowns && config.cooldowns.default) ??
    3000;

  let ms = Number(raw);

  if (!Number.isFinite(ms) || ms < 0) {
    ms = 3000;
  }

  const MAX_SAFE_COOLDOWN = 10 * 60 * 1000;
  if (ms > MAX_SAFE_COOLDOWN) {
    ms = MAX_SAFE_COOLDOWN;
  }

  return ms;
}

module.exports = function checkCooldown(commandName, userId) {
  if (!commandName || !userId) return null;

  const now = Date.now();
  const commandCooldown = getCommandCooldownMs(commandName);

  if (commandCooldown <= 0) {
    return null;
  }

  if (!cooldowns.has(commandName)) {
    cooldowns.set(commandName, new Map());
  }

  const timestamps = cooldowns.get(commandName);

  if (timestamps.has(userId)) {
    const lastUsed = timestamps.get(userId);
    const expiration = lastUsed + commandCooldown;

    if (now < expiration) {
      const remainingSeconds = ((expiration - now) / 1000).toFixed(1);
      return remainingSeconds; // bloqueado
    }
  }

  timestamps.set(userId, now);

  setTimeout(() => {
    const map = cooldowns.get(commandName);
    if (!map) return;
    map.delete(userId);
  }, commandCooldown).unref?.();

  return null;
};
