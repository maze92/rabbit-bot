/* Simple test runner using Node's assert module.

   Run with: npm test
*/

const assert = require('assert');

function testParseDuration() {
  const { parseDuration } = require('../src/utils/time');

  assert.strictEqual(parseDuration('10m'), 10 * 60 * 1000);
  assert.strictEqual(parseDuration('2h'), 2 * 60 * 60 * 1000);
  assert.strictEqual(parseDuration('1d'), 24 * 60 * 60 * 1000);
  assert.strictEqual(parseDuration('90'), 90 * 1000); // seconds fallback

  console.log('✓ parseDuration basic cases');
}

function testTrustConfig() {
  const { getTrustConfig } = require('../src/utils/trust');
  const cfg = getTrustConfig();
  assert.ok(cfg);
  assert.ok(typeof cfg.base === 'number');
  assert.ok(typeof cfg.min === 'number');
  assert.ok(typeof cfg.max === 'number');
  console.log('✓ getTrustConfig basic shape');
}

function run() {
  try {
    testParseDuration();
    testTrustConfig();
    console.log('\nAll tests passed. ✅');
  } catch (err) {
    console.error('Test failure:', err);
    process.exitCode = 1;
  }
}

run();
