import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('dismissal remains device-local and time bounded', async () => {
  const source = await readFile(new URL('../js/pwa-install.js', import.meta.url), 'utf8');
  assert.match(source, /localStorage\.setItem\(DISMISS_KEY/);
  assert.match(source, /DISMISS_DAYS \* 86400000/);
  assert.doesNotMatch(source, /fetch\([^)]*dismiss/i);
});
