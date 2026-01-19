// src/systems/configManager.js

const fs = require('fs');
const path = require('path');
const config = require('../config/defaultConfig');

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function deepGet(obj, pathStr) {
  const parts = String(pathStr || '').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!isPlainObject(cur) && !Array.isArray(cur)) return undefined;
    cur = cur[p];
    if (cur === undefined) return undefined;
  }
  return cur;
}

function deepSet(obj, pathStr, value) {
  const parts = String(pathStr || '').split('.').filter(Boolean);
  if (!parts.length) return;

  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!isPlainObject(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function cloneJsonSafe(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return null;
  }
}

// ✅ Only allow safe runtime edits here.
// DO NOT include role IDs, channel IDs, feeds, staffRoles, guildId, TOKEN, etc.
const ALLOWED_PATHS = new Set([
  'language',
  'notifications.dmOnWarn',
  'notifications.dmOnMute',
  'maxWarnings',
  'muteDuration',

  'trust.enabled',
  'trust.base',
  'trust.min',
  'trust.max',
  'trust.warnPenalty',
  'trust.mutePenalty',
  'trust.regenPerDay',
  'trust.regenMaxDays',
  'trust.lowThreshold',
  'trust.highThreshold',
  'trust.lowTrustWarningsPenalty',
  'trust.lowTrustMessagesPenalty',
  'trust.lowTrustMuteMultiplier',
  'trust.highTrustMuteMultiplier',

  'antiSpam.enabled',
  'antiSpam.interval',
  'antiSpam.maxMessages',
  'antiSpam.muteDuration',
  'antiSpam.actionCooldown',
  'antiSpam.bypassAdmins',
  'antiSpam.sendMessage',
  'antiSpam.minLength',
  'antiSpam.ignoreAttachments',
  'antiSpam.similarityThreshold',

  'dashboard.maxLogs',
  'dashboard.maxDbLogs',

  'gameNews.enabled',
  'gameNews.interval',
  'gameNews.keepHashes',
  'gameNews.maxAgeDays',
  'gameNews.jitterMs',
  'gameNews.perFeedJitterMs',
  'gameNews.retry.attempts',
  'gameNews.retry.baseDelayMs',
  'gameNews.retry.jitterMs',
  'gameNews.backoff.maxFails',
  'gameNews.backoff.pauseMs',

  'slash.enabled',
  'slash.registerOnStartup'
]);

function validateValue(pathStr, value) {
  // Light validation. We mostly rely on existing code to handle numbers.
  if (pathStr === 'language') {
    return value === 'pt' || value === 'en';
  }

  // booleans
  const boolPaths = new Set([
    'notifications.dmOnWarn',
    'notifications.dmOnMute',
    'trust.enabled',
    'antiSpam.enabled',
    'antiSpam.bypassAdmins',
    'antiSpam.sendMessage',
    'antiSpam.ignoreAttachments',
    'gameNews.enabled',
    'slash.enabled',
    'slash.registerOnStartup'
  ]);
  if (boolPaths.has(pathStr)) return typeof value === 'boolean';

  // numbers
  return typeof value === 'number' && Number.isFinite(value);
}

function flattenPatch(obj, prefix = '', out = {}) {
  if (!isPlainObject(obj)) return out;

  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) {
      flattenPatch(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

const overridesPath = path.join(__dirname, '../config/overrides.json');

function readOverrides() {
  try {
    if (!fs.existsSync(overridesPath)) return {};
    const raw = fs.readFileSync(overridesPath, 'utf8');
    const o = JSON.parse(raw);
    return isPlainObject(o) ? o : {};
  } catch {
    return {};
  }
}

function writeOverrides(obj) {
  fs.writeFileSync(overridesPath, JSON.stringify(obj, null, 2), 'utf8');
}

function getPublicConfig() {
  // Return config but hide potentially sensitive stuff.
  const cloned = cloneJsonSafe(config) || {};

  // Remove sensitive-ish fields even if present.
  delete cloned.staffRoles;
  delete cloned.bannedWords;

  // GameNews feeds contain channel IDs
  if (cloned.gameNews) delete cloned.gameNews.sources;

  // Slash guildId is also sensitive
  if (cloned.slash) delete cloned.slash.guildId;

  // AntiSpam overrides can contain channel IDs / bypassRoles
  if (cloned.antiSpam) {
    delete cloned.antiSpam.channels;
    delete cloned.antiSpam.bypassRoles;
  }

  return cloned;
}

function getEditableSchema() {
  // Simple schema for UI rendering.
  // You can expand this later (min/max, steps, etc.)
  return {
    allowedPaths: Array.from(ALLOWED_PATHS)
  };
}

function applyPatch(patch) {
  if (!isPlainObject(patch)) {
    return { ok: false, error: 'Patch must be an object.' };
  }

  const overrides = readOverrides();
  const applied = [];
  const rejected = [];

  const flat = flattenPatch(patch);

  for (const [pathStr, value] of Object.entries(flat)) {
    if (!ALLOWED_PATHS.has(pathStr) || !validateValue(pathStr, value)) {
      rejected.push({ path: pathStr });
      continue;
    }

    deepSet(overrides, pathStr, value);
    deepSet(config, pathStr, value);
    applied.push(pathStr);
  }

  try {
    writeOverrides(overrides);
  } catch (e) {
    return { ok: false, error: e?.message || 'Failed writing overrides.' };
  }

  return {
    ok: true,
    applied,
    rejected,
    config: getPublicConfig()
  };
}

function getValue(pathStr) {
  if (!ALLOWED_PATHS.has(pathStr)) return undefined;
  return deepGet(config, pathStr);
}

module.exports = {
  getPublicConfig,
  getEditableSchema,
  applyPatch,
  getValue
};
