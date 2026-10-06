import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('install copy matches YoruBay voice', async () => {
  const source = await readFile(new URL('../js/pwa-install.js', import.meta.url), 'utf8');
  assert.match(source, /把夜灣留在桌面上/);
  assert.match(source, /下次想回到故事時，不必再尋找網址。/);
  assert.match(source, /安裝夜灣/);
  assert.match(source, /稍後再說/);
});
