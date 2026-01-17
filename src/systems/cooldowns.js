// src/systems/cooldowns.js

const config = require('../config/defaultConfig');

const cooldowns = new Map(); // Map<commandName, Map<userId, lastUsedMs>>

const MAX_SAFE_COOLDOWN = 10 * 60 * 1000;
const SWEEP_EVERY_MS = 30 * 1000;

function normalizeKey(s) {
  return String(s || '').trim().toLowerCase();
}

function getCommandCooldownMs(commandName) {
  const key = normalizeKey(commandName);

  const raw =
    (config.cooldowns && config.cooldowns[key]) ??
    (config.cooldowns && config.cooldowns.default) ??
    3000;

  let ms = Number(raw);

  if (!Number.isFinite(ms) || ms < 0) ms = 3000;
  if (ms > MAX_SAFE_COOLDOWN) ms = MAX_SAFE_COOLDOWN;

  return ms;
}

function getUserMap(commandName) {
  const key = normalizeKey(commandName);
  if (!cooldowns.has(key)) cooldowns.set(key, new Map());
  return cooldowns.get(key);
}

// Sweep periódico (remove entradas expiradas, sem criar timeouts por comando)
setInterval(() => {
  const now = Date.now();

  for (const [cmd, usersMap] of cooldowns.entries()) {
    const cdMs = getCommandCooldownMs(cmd);
    if (!usersMap || usersMap.size === 0) {
      cooldowns.delete(cmd);
      continue;
    }

    for (const [userId, lastUsed] of usersMap.entries()) {
      if (!Number.isFinite(lastUsed) || now - lastUsed >= cdMs) {
        usersMap.delete(userId);
      }
    }

    if (usersMap.size === 0) cooldowns.delete(cmd);
  }
}, SWEEP_EVERY_MS).unref?.();

module.exports = function checkCooldown(commandName, userId) {
  const cmd = normalizeKey(commandName);
  const uid = String(userId || '').trim();

  if (!cmd || !uid) return null;

  const now = Date.now();
  const cdMs = getCommandCooldownMs(cmd);

  if (cdMs <= 0) return null;

  const usersMap = getUserMap(cmd);

  const lastUsed = usersMap.get(uid);
  if (Number.isFinite(lastUsed)) {
    const expiresAt = lastUsed + cdMs;

    if (now < expiresAt) {
      const remainingSeconds = (expiresAt - now) / 1000;
      // devolve número (commands.js faz ${remaining}s)
      return Number(remainingSeconds.toFixed(1));
    }
  }

  usersMap.set(uid, now);
  return null;
};
