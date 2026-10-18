function parseBotUserIds(value, envName) {
  const ids = new Set();
  String(value || '').split(',').forEach((part) => {
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

function getBotRole(userId, ownerIds, adminIds) {
  const id = String(userId || '');
  if (ownerIds && ownerIds.has(id)) return 'BOT_OWNER';
  if (adminIds && adminIds.has(id)) return 'BOT_ADMIN';
  return null;
}

function isBotOperator(user) {
  return Boolean(user && (user.role === 'BOT_ADMIN' || user.role === 'BOT_OWNER'));
}

function isBotOwner(user) {
  return Boolean(user && user.role === 'BOT_OWNER');
}

module.exports = { parseBotUserIds, getBotRole, isBotOperator, isBotOwner };
