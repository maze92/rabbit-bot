const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { syncTtlIndexes } = require(path.resolve(__dirname, '../../src/database/syncTtlIndexes'));

function fakeModel({ schemaIndexes, existing }) {
  const commands = [];
  return {
    commands,
    modelName: 'Infraction',
    schema: { indexes: () => schemaIndexes },
    collection: { collectionName: 'infractions', indexes: async () => existing },
    db: { db: { command: async (cmd) => commands.push(cmd) } }
  };
}

const silent = { log() {} };

test('atualiza o TTL existente quando difere do schema (collMod)', async () => {
  const m = fakeModel({
    schemaIndexes: [
      [{ createdAt: 1 }, { expireAfterSeconds: 15552000 }],
      [{ guildId: 1 }, {}]
    ],
    existing: [{ key: { createdAt: 1 }, name: 'createdAt_1', expireAfterSeconds: 7776000 }]
  });
  const changed = await syncTtlIndexes(m, silent);
  assert.deepEqual(changed, [{ name: 'createdAt_1', from: 7776000, to: 15552000 }]);
  assert.deepEqual(m.commands, [
    { collMod: 'infractions', index: { keyPattern: { createdAt: 1 }, expireAfterSeconds: 15552000 } }
  ]);
});

test('não faz nada se o TTL já coincide ou o índice ainda não existe', async () => {
  const same = fakeModel({
    schemaIndexes: [[{ createdAt: 1 }, { expireAfterSeconds: 100 }]],
    existing: [{ key: { createdAt: 1 }, name: 'createdAt_1', expireAfterSeconds: 100 }]
  });
  assert.deepEqual(await syncTtlIndexes(same, silent), []);
  const missing = fakeModel({ schemaIndexes: [[{ createdAt: 1 }, { expireAfterSeconds: 100 }]], existing: [] });
  assert.deepEqual(await syncTtlIndexes(missing, silent), []);
  assert.equal(same.commands.length + missing.commands.length, 0);
});
