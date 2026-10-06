import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('integration snippet wires manifest, styles and controller', async () => {
  const source = await read('pwa-head.html');
  assert.match(source, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(source, /css\/pwa-install\.css/);
  assert.match(source, /js\/pwa-install\.js/);
});
