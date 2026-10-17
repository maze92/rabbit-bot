// src/systems/i18n.js

const config = require('../config/defaultConfig');
const messages = require('../config/messages');
const { getGuildConfig } = require('./guildConfigService');

function getLang(langOverride) {
  const cfg = String(langOverride || config.language || 'en').toLowerCase();
  return cfg === 'pt' ? 'pt' : 'en';
}

async function getGuildLang(guildId, langOverride) {
  const explicit = typeof langOverride === 'string' ? langOverride.trim().toLowerCase() : '';
  if (explicit && explicit !== 'auto') return getLang(explicit);
  if (!guildId) return getLang(explicit || null);

  const cfg = await getGuildConfig(guildId).catch(() => null);
  const guildLang = cfg && typeof cfg.language === 'string' ? cfg.language.trim().toLowerCase() : '';
  if (guildLang && guildLang !== 'auto') return getLang(guildLang);
  return getLang(explicit || null);
}

function getFromPath(root, path) {
  const parts = String(path || '').split('.');
  let current = root;
  for (const p of parts) {
    if (!current || typeof current !== 'object') return null;
    if (!(p in current)) return null;
    current = current[p];
  }
  return current;
}

/**
 * Translation helper.
 * Examples:
 *  - t('common.noPermission')
 *  - t('common.usage', null, '!warn @user [reason]')
 *  - t('clear.success', null, { count: 5 })
 */
function t(path, langOverride, value) {
  const lang = getLang(langOverride);
  const root = messages[lang] || messages.en;

  const node = getFromPath(root, path);
  if (node == null) return path;

  if (typeof node === 'function') {
    return node(value);
  }

  return node;
}

async function tGuild(guildId, path, value, langOverride) {
  const lang = await getGuildLang(guildId, langOverride);
  return t(path, lang, value);
}

module.exports = { t, tGuild, getLang, getGuildLang };
