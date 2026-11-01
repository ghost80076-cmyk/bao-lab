import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
function worker() {
  const listeners = new Map();
  const entries = new Map([['/index.html', new Response('HOME')]]);
  let offline = false;
  const caches = {
    open: async () => ({ put: async (key, value) => entries.set(key, value) }),
    match: async key => entries.get(key)?.clone()
  };
  const context = {
    self: { location: { origin: 'https://yorubay.test' }, addEventListener: (name, fn) => listeners.set(name, fn) },
    caches, URL, Response,
    fetch: async request => {
      if (offline) throw new Error('offline');
      return new Response(request.url.includes('gameplay-ui-preview') ? 'PREVIEW' : 'PAGE');
    }
  };
  vm.runInNewContext(source, context);
  return {
    entries,
    goOffline() { offline = true; },
    async navigate(path) {
      let result;
      listeners.get('fetch')({
        request: { method: 'GET', mode: 'navigate', url: `https://yorubay.test${path}` },
        respondWith(response) { result = response; }
      });
      return result;
    }
  };
}

test('preview HTML cannot replace the offline home shell, including query strings and clean URLs', async () => {
  for (const path of ['/gameplay-ui-preview.html', '/gameplay-ui-preview.html?v=2', '/gameplay-ui-preview']) {
    const sw = worker();
    assert.equal(await (await sw.navigate(path)).text(), 'PREVIEW');
    assert.equal(await sw.entries.get('/index.html').clone().text(), 'HOME');
    sw.goOffline();
    const unavailable = await sw.navigate(path);
    assert.equal(unavailable.status, 503);
    assert.match(unavailable.headers.get('content-type'), /text\/plain/);
    assert.equal(unavailable.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await unavailable.text(), /HOME|<script/);
    assert.equal(await (await sw.navigate('/')).text(), 'HOME');
  }
});

test('only home navigations refresh the app shell; other pages preserve it', async () => {
  const sw = worker();
  await sw.navigate('/character-studio.html');
  assert.equal(await sw.entries.get('/index.html').clone().text(), 'HOME');
  await sw.navigate('/?source=pwa');
  assert.equal(await sw.entries.get('/index.html').clone().text(), 'PAGE');
});
