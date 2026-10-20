const PRIMARY_BOT_OWNER_ID = '810243963574550558';

function parseBotUserIds(value, envName) {
  const ids = new Set();
  String(value || '').split(/[,\s;]+/).forEach((part) => {
    const id = part.trim();
    if (!id) return;
    if (!/^\d{10,32}$/.test(id)) {
      console.warn(`[Dashboard] Ignoring invalid Discord user ID in ${envName}.`);
      return;
    }
    ids.add(id);
  });
  return ids;
}

function getBotOwnerIds(value) {
  const configuredIds = parseBotUserIds(value, 'BOT_OWNER_IDS');
  if (configuredIds.size > 1) {
    console.warn('[Dashboard] BOT_OWNER_IDS accepts one global owner; using the first valid ID.');
  }
  const ownerId = configuredIds.values().next().value || PRIMARY_BOT_OWNER_ID;
  return new Set([ownerId]);
}

function getBotRole(userId, ownerIds, adminIds) {
  const id = String(userId || '');
  if (ownerIds && ownerIds.has(id)) return 'BOT_OWNER';
  if (adminIds && adminIds.has(id)) return 'BOT_ADMIN';
  return null;
}

function isBotOperator(user) {
  return isBotOwner(user);
}

function isBotOwner(user) {
  return Boolean(user && user.role === 'BOT_OWNER');
}

module.exports = { PRIMARY_BOT_OWNER_ID, parseBotUserIds, getBotOwnerIds, getBotRole, isBotOperator, isBotOwner };
