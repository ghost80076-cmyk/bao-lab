import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

test('manifest icon exists and stays same-origin', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith('/'));
    await access(new URL(`..${icon.src}`, import.meta.url));
  }
});
