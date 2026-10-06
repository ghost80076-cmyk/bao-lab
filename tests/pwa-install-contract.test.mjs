import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('PWA manifest describes standalone YoruBay app', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.name, '夜灣 YoruBay');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons?.length);
});

test('install controller respects installability and dismissal', async () => {
  const source = await read('js/pwa-install.js');
  assert.match(source, /beforeinstallprompt/);
  assert.match(source, /appinstalled/);
  assert.match(source, /DISMISS_DAYS = 7/);
  assert.match(source, /serviceWorker\.register\('\/sw\.js'\)/);
});

test('service worker keeps a minimal shell only', async () => {
  const source = await read('sw.js');
  assert.match(source, /yorubay-shell-v1/);
  assert.match(source, /fetch\(event\.request\)\.catch/);
});
