// tests/unit/_harness.js
// Runner minimalista de testes unitários (sem dependências externas).

const results = { pass: 0, fail: 0, failures: [] };

function test(name, fn) {
  try {
    fn();
    results.pass += 1;
    console.log('  \u2713 ' + name);
  } catch (err) {
    results.fail += 1;
    results.failures.push({ name, message: err && err.message ? err.message : String(err) });
    console.error('  \u2717 ' + name + '\n      ' + (err && err.message ? err.message : err));
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'Expected truthy value');
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function deepEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error((msg ? msg + ': ' : '') + 'expected ' + b + ', got ' + a);
  }
}

function throws(fn, msg) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) throw new Error(msg || 'Expected function to throw');
}

module.exports = { test, ok, eq, deepEq, throws, results };
