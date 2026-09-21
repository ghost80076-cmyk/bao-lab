'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/google-drive-sync.js', 'utf8');

async function run() {
  const memory = new Map();
  const localStorage = {
    getItem: key => memory.has(key) ? memory.get(key) : null,
    setItem: (key, value) => memory.set(key, String(value))
  };
  const id = 'story-12345678';
  const local = { storyId: id, title: '測試故事', updatedAt: '2026-09-20T01:00:00Z' };
  const remote = [];
  const calls = [];
  const bundle = () => ({
    schema: 'bao-lab-story-bundle', version: 1, exportedAt: local.updatedAt,
    story: { storyId: id, title: local.title, createdAt: local.updatedAt, updatedAt: local.updatedAt },
    activeChapterId: 'chapter-12345678', chapters: [{ chapterId: 'chapter-12345678', payload: {}, checkpoints: [] }]
  });
  const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
  const fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).includes('/about?')) return response({ user: { permissionId: 'test-account' } });
    // Upload URLs also end in /files?, so match the specific upload endpoint first.
    if (String(url).includes('/upload/drive/v3/files?')) {
      const item = { id: 'drive-file-1', name: 'bao-lab-story-v1-' + id + '.json', version: '1' };
      remote.push(item);
      return response(item);
    }
    if (String(url).includes('/files?')) return response({ files: remote, incompleteSearch: false });
    throw new Error('Unexpected request: ' + url);
  };
  const lib = { open: async () => true, install() {}, flush: async () => true,
    listStories: async () => [local], refs: () => ({ storyId: '', chapterId: '' }) };
  const Storage = { saveStory: () => true };
  const google = { accounts: { oauth2: { initTokenClient: () => {
    const client = { callback: null, requestAccessToken() {
      queueMicrotask(() => client.callback({ access_token: 'test-token', expires_in: 3600 }));
    } };
    return client;
  } } } };
  const window = { BAOGoogleDriveConfig: { clientId: 'test-client.apps.googleusercontent.com' },
    BAOStoryLibrary: lib, BAOStoryBackup: { buildBundle: async () => bundle() }, Storage, google };
  const document = { querySelector: () => null, getElementById: () => null };
  vm.runInNewContext(source, { window, Storage, google, fetch, localStorage, document,
    URLSearchParams, Date, setTimeout, clearTimeout, console, Blob,
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789012' } }, { filename: 'google-drive-sync.js' });
  const sync = window.BAOGoogleDriveSync;
  assert.ok(sync, 'Sync module should initialize');
  assert.equal(sync.connected(), false, 'Must never connect without user consent');
  await sync.connect();
  assert.equal(sync.connected(), true);
  const first = await sync.sync();
  assert.equal(first.uploaded, 1, 'First sync uploads a single story');
  assert.equal(first.errors.length, 0);
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  const second = await sync.sync();
  assert.equal(second.skipped, 1, 'Unmodified story should not upload again');
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  local.updatedAt = '2026-09-20T02:00:00Z';
  remote[0].version = '2'; // Another device has modified this story.
  const conflict = await sync.sync();
  assert.equal(conflict.conflicts, 1, 'Concurrent edits must not overwrite the cloud');
  assert.equal(calls.filter(call => call.method === 'PATCH').length, 0);
  sync.disconnect();
  assert.equal(sync.connected(), false);
  console.log('Google Drive sync core: upload, unchanged skip, conflict preservation and disconnect passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
