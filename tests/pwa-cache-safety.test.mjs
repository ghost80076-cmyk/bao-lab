import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('service worker does not name sensitive application data', async () => {
  const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  for (const forbidden of ['/v1/chat', 'api-key', 'localStorage', 'memory', 'story-save']) {
    assert.equal(source.includes(forbidden), false, `service worker should not cache or inspect ${forbidden}`);
  }
});
