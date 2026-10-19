const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { pickReminder, runOnce } = require(path.resolve(__dirname, '../../src/systems/premiumReminders'));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 10);

test('pickReminder escolhe 7d, 1d, expired (tolerância) ou nada', () => {
  const at = (ms) => ({ enabled: true, until: new Date(NOW + ms) });
  assert.equal(pickReminder(at(10 * DAY), NOW), null);
  assert.equal(pickReminder(at(5 * DAY), NOW), '7d');
  assert.equal(pickReminder(at(12 * 60 * 60 * 1000), NOW), '1d');
  assert.equal(pickReminder(at(-1 * DAY), NOW), 'expired');
  assert.equal(pickReminder(at(-30 * DAY), NOW), null);
  assert.equal(pickReminder({ enabled: true, until: null }, NOW), null);
  assert.equal(pickReminder({ enabled: false, until: new Date(NOW + DAY / 2) }, NOW), null);
});

test('runOnce envia DM ao dono uma única vez por aviso', async () => {
  const doc = { guildId: 'g1', premium: { enabled: true, until: new Date(NOW + 3 * DAY), lastReminder: null } };
  const GuildConfig = {
    find: () => ({ select: () => ({ lean: async () => [doc] }) }),
    updateOne: async (_q, update) => {
      doc.premium.lastReminder = update.$set['premium.lastReminder'];
    }
  };
  const dms = [];
  const client = {
    guilds: {
      cache: new Map([['g1', { name: 'Srv', fetchOwner: async () => ({ send: async (m) => dms.push(m) }) }]])
    }
  };
  assert.equal(await runOnce(client, { GuildConfig, now: NOW, baseUrl: 'https://x.test' }), 1);
  assert.equal(await runOnce(client, { GuildConfig, now: NOW }), 0);
  assert.equal(dms.length, 1);
  assert.match(dms[0], /Srv/);
});

test('normalizePremium mantém a licença ativa durante a tolerância', () => {
  const { normalizePremium } = require(path.resolve(__dirname, '../../src/systems/premium'));
  const grace = normalizePremium({ enabled: true, until: new Date(Date.now() - DAY) });
  assert.equal(grace.active, true);
  assert.equal(grace.inGrace, true);
  const over = normalizePremium({ enabled: true, until: new Date(Date.now() - 4 * DAY) });
  assert.equal(over.active, false);
  assert.equal(over.inGrace, false);
});
