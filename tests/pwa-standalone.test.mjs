import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('installed sessions are detected', async () => {
  const source = await readFile(new URL('../js/pwa-install.js', import.meta.url), 'utf8');
  assert.match(source, /display-mode: standalone/);
  assert.match(source, /navigator\.standalone/);
  assert.match(source, /isStandalone\(\)/);
});
