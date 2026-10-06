import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('PWA preview is fully wired', async () => {
  const source = await readFile(new URL('../pwa-preview.html', import.meta.url), 'utf8');
  assert.match(source, /manifest\.webmanifest/);
  assert.match(source, /pwa-install\.css/);
  assert.match(source, /pwa-install\.js/);
});
