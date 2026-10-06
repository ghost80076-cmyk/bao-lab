import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('main index activates PWA install experience', async () => {
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(source, /manifest\.webmanifest/, 'index.html must link the web app manifest');
  assert.match(source, /pwa-install\.css/, 'index.html must load PWA prompt styles');
  assert.match(source, /pwa-install\.js/, 'index.html must load PWA install controller');
});
