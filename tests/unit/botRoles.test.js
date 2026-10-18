const { test, eq } = require('./_harness');
const { parseBotUserIds, getBotRole, isBotOperator, isBotOwner } = require('../../src/dashboard/botRoles');

test('bot owner role takes precedence over delegated admin role', () => {
  const ownerIds = new Set(['123456789012345678']);
  const adminIds = new Set(['123456789012345678', '234567890123456789']);
  eq(getBotRole('123456789012345678', ownerIds, adminIds), 'BOT_OWNER');
  eq(getBotRole('234567890123456789', ownerIds, adminIds), 'BOT_ADMIN');
  eq(getBotRole('345678901234567890', ownerIds, adminIds), null);
});

test('bot ID configuration accepts comma-separated snowflakes and ignores malformed values', () => {
  const ids = parseBotUserIds('123456789012345678, invalid,234567890123456789', 'TEST_BOT_IDS');
  eq(ids.size, 2);
  eq(ids.has('123456789012345678'), true);
  eq(ids.has('234567890123456789'), true);
});

test('bot owner is an operator but delegated bot admin is not bot owner', () => {
  eq(isBotOperator({ role: 'BOT_OWNER' }), true);
  eq(isBotOperator({ role: 'BOT_ADMIN' }), true);
  eq(isBotOwner({ role: 'BOT_OWNER' }), true);
  eq(isBotOwner({ role: 'BOT_ADMIN' }), false);
});
