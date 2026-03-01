// src/systems/i18n.js

const config = require('../config/defaultConfig');
const messages = require('../config/messages');

function getLang(langOverride) {
  const cfg = String(langOverride || config.language || 'en').toLowerCase();
  return cfg === 'pt' ? 'pt' : 'en';
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

module.exports = { t };
