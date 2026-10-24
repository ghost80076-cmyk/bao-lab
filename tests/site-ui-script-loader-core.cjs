const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Test the real loader in isolation without triggering page startup or network I/O.
const source = fs.readFileSync(path.join(__dirname, '../js/site-ui.js'), 'utf8');
const loaderSource = source.split('let baoFeedbackTimer = 0;')[0];
assert.match(loaderSource, /const loadBAOScript = src =>/);

function makeLoader(initialScripts = []) {
  const scripts = [...initialScripts.map(src => ({ src }))];
  const document = {
    querySelector(selector) {
      const match = /^script\[src="([^"]+)"\]$/.exec(selector);
      assert.ok(match, 'loader must look up exact src');
      return scripts.find(script => script.src === match[1]) || null;
    },
    createElement(tag) {
      assert.equal(tag, 'script');
      return { src: '', onload: null, onerror: null };
    },
    head: {
      appendChild(script) {
        scripts.push(script);
      }
    }
  };
  const ctx = { document };
  vm.runInNewContext(loaderSource + '\nthis.loadScript = loadBAOScript;', ctx);
  return { scripts, load: ctx.loadScript };
}

test('same in-flight URL inserts only one script and waits for its load event', async () => {
  const { scripts, load } = makeLoader();
  const first = load('js/module.js?v=5');
  const second = load('js/module.js?v=5');
  assert.strictEqual(first, second, 'share the exact pending promise');
  assert.equal(scripts.length, 1);
  let completed = false;
  first.then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false, 'a present but still pending script is not ready');
  scripts[0].onload();
  await first;
  assert.equal(completed, true);
  assert.strictEqual(load('js/module.js?v=5'), first, 'loaded URL stays deduplicated');
  assert.equal(scripts.length, 1);
});

test('different URLs are independent, including query-string versions', async () => {
  const { scripts, load } = makeLoader();
  const a = load('js/module.js?v=5');
  const b = load('js/module.js?v=6');
  assert.notStrictEqual(a, b);
  assert.equal(scripts.length, 2);
  scripts[1].onload();
  await b;
  scripts[0].onload();
  await a;
});

test('failed in-flight URL rejects all waiters instead of reporting readiness', async () => {
  const { scripts, load } = makeLoader();
  const a = load('js/missing.js');
  const b = load('js/missing.js');
  assert.strictEqual(a, b);
  const error = new Error('network failure');
  scripts[0].onerror(error);
  await assert.rejects(a, err => err === error);
  await assert.rejects(b, err => err === error);
  assert.equal(scripts.length, 1);
});

test('already parser-loaded core script is reused without adding a new element', async () => {
  const { scripts, load } = makeLoader(['js/core.js?v=2']);
  await load('js/core.js?v=2');
  assert.equal(scripts.length, 1);
});
