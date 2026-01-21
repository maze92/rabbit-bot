/* Simple test runner using Node's assert module.
 *
 * Run with: npm test
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
  const { getTrustConfig, getTrustLabel } = require('../src/utils/trust');
  const cfg = getTrustConfig();

  assert.ok(cfg, 'getTrustConfig should return a config object');
  assert.strictEqual(typeof cfg.base, 'number');
  assert.strictEqual(typeof cfg.min, 'number');
  assert.strictEqual(typeof cfg.max, 'number');

  const label = getTrustLabel(cfg.base, cfg);
  assert.ok(typeof label === 'string', 'getTrustLabel should return a string');

  console.log('✓ getTrustConfig / getTrustLabel basic shape');
}

function testI18n() {
  const { t } = require('../src/systems/i18n');

  const msg = t('common.noPermission');
  assert.ok(typeof msg === 'string', 't(common.noPermission) should return a string');

  const missing = t('this.key.does.not.exist');
  assert.strictEqual(
    missing,
    'this.key.does.not.exist',
    'missing keys should return the path as fallback'
  );

  console.log('✓ i18n.t basic behaviour');
}

function testLoggerModule() {
  const logger = require('../src/systems/logger');
  assert.strictEqual(typeof logger, 'function', 'logger should export a function');
  console.log('✓ logger module shape');
}

function testAntiSpamModule() {
  const antiSpam = require('../src/systems/antiSpam');
  assert.strictEqual(typeof antiSpam, 'function', 'antiSpam should export a function');
  console.log('✓ antiSpam module shape');
}

function run() {
  try {
    testParseDuration();
    testTrustConfig();
    testI18n();
    testLoggerModule();
    testAntiSpamModule();
    console.log('\nAll tests passed. ✅');
  } catch (err) {
    console.error('Test failure:', err);
    process.exitCode = 1;
  }
}

run();
