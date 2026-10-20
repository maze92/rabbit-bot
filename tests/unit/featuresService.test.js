const { test, eq } = require('./_harness');
const { normalizeFeature } = require('../../src/systems/featuresService');

test('serverStats keeps all metrics enabled for existing guild configs', () => {
  const feature = normalizeFeature('serverStats', { enabled: true });
  eq(feature.showMembers, true);
  eq(feature.showJoins, true);
  eq(feature.showLeaves, true);
});

test('serverStats preserves independently disabled metrics', () => {
  const feature = normalizeFeature('serverStats', {
    showMembers: true,
    showJoins: false,
    showLeaves: false
  });
  eq(feature.showMembers, true);
  eq(feature.showJoins, false);
  eq(feature.showLeaves, false);
});