// src/database/syncTtlIndexes.js
//
// MongoDB rejects createIndex when an index with the same key already exists
// with a different expireAfterSeconds ("An equivalent index already exists...").
// Align existing TTL indexes with the schema via collMod before ensureIndexes.

function sameKey(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

async function syncTtlIndexes(model, logger = console) {
  const changed = [];
  if (!model || !model.schema || !model.collection) return changed;

  let existing;
  try {
    existing = await model.collection.indexes();
  } catch {
    return changed; // collection does not exist yet
  }

  for (const [keys, opts] of model.schema.indexes()) {
    const desired = opts && opts.expireAfterSeconds;
    if (typeof desired !== 'number') continue;
    const current = (existing || []).find((idx) => idx && sameKey(idx.key, keys));
    if (!current || typeof current.expireAfterSeconds !== 'number' || current.expireAfterSeconds === desired) continue;

    await model.db.db.command({
      collMod: model.collection.collectionName,
      index: { keyPattern: keys, expireAfterSeconds: desired }
    });
    changed.push({ name: current.name, from: current.expireAfterSeconds, to: desired });
    logger.log(
      `[Mongo] Updated TTL index ${model.modelName || model.collection.collectionName}.${current.name}: ` +
        `${current.expireAfterSeconds}s -> ${desired}s`
    );
  }
  return changed;
}

module.exports = { syncTtlIndexes };
