const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const DAY = 24 * 60 * 60 * 1000;
const userModelPath = path.resolve(__dirname, '../../src/database/models/User.js');

let doc = null;
let upserts = 0;
require.cache[userModelPath] = {
  id: userModelPath,
  filename: userModelPath,
  loaded: true,
  exports: {
    findOne: async () => doc,
    findOneAndUpdate: async (query, update) => {
      upserts += 1;
      doc = { ...query, ...update.$setOnInsert, save: async () => {} };
      return doc;
    }
  }
};

const { getOrCreateUser } = require('../../src/systems/warningsService');
const { getTrustConfig } = require('../../src/utils/trust');

test('trust regen is applied once per elapsed period, not on every lookup', async () => {
  const cfg = getTrustConfig();
  doc = {
    guildId: 'g',
    userId: 'u',
    warnings: 1,
    trust: 20,
    lastInfractionAt: new Date(Date.now() - 3 * DAY - 1000),
    lastTrustUpdateAt: new Date(Date.now() - 3 * DAY - 1000),
    save: async () => {}
  };

  await getOrCreateUser('g', 'u');
  const afterFirst = doc.trust;
  const expected = Math.min(cfg.max, 20 + Math.min(3, cfg.regenMaxDays) * cfg.regenPerDay);
  assert.equal(afterFirst, expected);

  await getOrCreateUser('g', 'u');
  await getOrCreateUser('g', 'u');
  assert.equal(doc.trust, afterFirst);
});

test('missing users are created through an atomic upsert', async () => {
  doc = null;
  upserts = 0;
  const u = await getOrCreateUser('g2', 'u2');
  assert.equal(upserts, 1);
  assert.equal(u.guildId, 'g2');
  assert.equal(u.trust, getTrustConfig().base);
});
