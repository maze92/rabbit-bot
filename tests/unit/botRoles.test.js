const { test, eq } = require('./_harness');
const { PRIMARY_BOT_OWNER_ID, parseBotUserIds, getBotOwnerIds, getBotRole, isBotOperator, isBotOwner } = require('../../src/dashboard/botRoles');

test('bot owner role takes precedence over delegated admin role', () => {
  const ownerIds = new Set(['123456789012345678']);
  const adminIds = new Set(['123456789012345678', '234567890123456789']);
  eq(getBotRole('123456789012345678', ownerIds, adminIds), 'BOT_OWNER');
  eq(getBotRole('234567890123456789', ownerIds, adminIds), 'BOT_ADMIN');
  eq(getBotRole('345678901234567890', ownerIds, adminIds), null);
});

test('bot ID configuration accepts common separators and ignores malformed values', () => {
  const ids = parseBotUserIds('123456789012345678, invalid;\n234567890123456789 345678901234567890', 'TEST_BOT_IDS');
  eq(ids.size, 3);
  eq(ids.has('123456789012345678'), true);
  eq(ids.has('234567890123456789'), true);
  eq(ids.has('345678901234567890'), true);
});

test('BOT_OWNER_IDS grants global access to only its first valid ID', () => {
  const ownerIds = getBotOwnerIds('234567890123456789,345678901234567890');
  eq(ownerIds.size, 1);
  eq(getBotRole('234567890123456789', ownerIds, new Set()), 'BOT_OWNER');
  eq(getBotRole('345678901234567890', ownerIds, new Set()), null);
});

test('primary bot owner is the fallback when BOT_OWNER_IDS is empty', () => {
  const ownerIds = getBotOwnerIds('');
  eq(ownerIds.has(PRIMARY_BOT_OWNER_ID), true);
  eq(getBotRole(PRIMARY_BOT_OWNER_ID, ownerIds, new Set()), 'BOT_OWNER');
});

test('only the bot owner has global operator privileges', () => {
  eq(isBotOperator({ role: 'BOT_OWNER' }), true);
  eq(isBotOperator({ role: 'BOT_ADMIN' }), false);
  eq(isBotOwner({ role: 'BOT_OWNER' }), true);
  eq(isBotOwner({ role: 'BOT_ADMIN' }), false);
});
