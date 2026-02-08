'use strict';

/*
  i18n audit for .rabbit Dashboard

  - Extracts keys used in public/index.html (data-i18n, data-i18n-placeholder, data-i18n-title)
  - Extracts keys used in public/js/*.js via t('...')
  - Ensures both public/locales/pt.js and en.js contain every key

  Run:
    node scripts/i18n-audit.js
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HTML_FILE = path.join(PUBLIC_DIR, 'index.html');
const JS_DIR = path.join(PUBLIC_DIR, 'js');
const LOCALES_DIR = path.join(PUBLIC_DIR, 'locales');

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

function extractHtmlKeys(html) {
  const keys = new Set();
  const attrs = ['data-i18n', 'data-i18n-placeholder', 'data-i18n-title'];
  for (const attr of attrs) {
    const re = new RegExp(`${attr}\\s*=\\s*\"([^\"]+)\"`, 'g');
    let m;
    while ((m = re.exec(html))) {
      const k = String(m[1] || '').trim();
      if (k) keys.add(k);
    }
  }
  return keys;
}

function extractJsKeys(jsText) {
  const keys = new Set();
  const re = /\bt\(\s*['\"]([^'\"]+)['\"]/g;
  let m;
  while ((m = re.exec(jsText))) {
    const k = String(m[1] || '').trim();
    if (k) keys.add(k);
  }
  return keys;
}

function extractLocaleKeys(localeText) {
  // Assumes flat map: 'key': 'value'
  const keys = new Set();
  const re = /['\"]([^'\"]+)['\"]\s*:/g;
  let m;
  while ((m = re.exec(localeText))) {
    const k = String(m[1] || '').trim();
    if (k) keys.add(k);
  }
  return keys;
}

function main() {
  const used = new Set();

  // HTML keys
  const html = readFile(HTML_FILE);
  for (const k of extractHtmlKeys(html)) used.add(k);

  // JS keys
  const jsFiles = fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js'));
  for (const f of jsFiles) {
    const txt = readFile(path.join(JS_DIR, f));
    for (const k of extractJsKeys(txt)) used.add(k);
  }

  // Locales
  const ptTxt = readFile(path.join(LOCALES_DIR, 'pt.js'));
  const enTxt = readFile(path.join(LOCALES_DIR, 'en.js'));
  const ptKeys = extractLocaleKeys(ptTxt);
  const enKeys = extractLocaleKeys(enTxt);

  const missingPt = [...used].filter((k) => !ptKeys.has(k)).sort();
  const missingEn = [...used].filter((k) => !enKeys.has(k)).sort();

  const extraPt = [...ptKeys].filter((k) => !used.has(k)).sort();
  const extraEn = [...enKeys].filter((k) => !used.has(k)).sort();

  console.log(`Used keys: ${used.size}`);
  console.log(`pt keys:   ${ptKeys.size} (missing ${missingPt.length}, extra ${extraPt.length})`);
  console.log(`en keys:   ${enKeys.size} (missing ${missingEn.length}, extra ${extraEn.length})`);

  if (missingPt.length) {
    console.error('\nMissing in pt.js:');
    for (const k of missingPt) console.error('  - ' + k);
  }
  if (missingEn.length) {
    console.error('\nMissing in en.js:');
    for (const k of missingEn) console.error('  - ' + k);
  }

  if (extraPt.length) {
    console.warn('\nUnused keys in pt.js:');
    for (const k of extraPt) console.warn('  - ' + k);
  }
  if (extraEn.length) {
    console.warn('\nUnused keys in en.js:');
    for (const k of extraEn) console.warn('  - ' + k);
  }

  // Strict mode: fail on missing OR unused keys to prevent i18n drift.
  if (missingPt.length || missingEn.length || extraPt.length || extraEn.length) {
    process.exit(1);
  }

  console.log('\n✅ i18n audit passed.');
}

main();
