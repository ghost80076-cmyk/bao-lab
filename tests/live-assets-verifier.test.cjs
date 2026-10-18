const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const verifier = path.resolve(__dirname, '../scripts/verify-live-assets.sh');

function run(plan, overrides = {}, assets = ['a.js', 'b.js']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live-assets-test-'));
  try {
    fs.mkdirSync(path.join(root, 'bin')); fs.mkdirSync(path.join(root, 'tmp'));
    for (const file of ['a.js', 'b.js']) fs.writeFileSync(path.join(root, file), `${file}\ncurrent bytes\n`);
    fs.writeFileSync(path.join(root, 'portrait.webp'), Buffer.concat([Buffer.from('RIFF....WEBPVP8X'), Buffer.from([0, 255, 13, 10]), Buffer.alloc(1024, 0x81)]));
    fs.writeFileSync(path.join(root, 'bin/curl'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const url = args.find(a => a.startsWith('https://'));
const key = new URL(url).pathname.split('/').pop();
const output = args[args.indexOf('--output') + 1];
const state = fs.existsSync('calls.json') ? JSON.parse(fs.readFileSync('calls.json')) : {};
const i = state[key] || 0; state[key] = i + 1;
fs.writeFileSync('calls.json', JSON.stringify(state));
fs.appendFileSync(process.env.TRACE_FILE, JSON.stringify(args) + '\\n');
const choices = JSON.parse(process.env.MOCK_PLAN)[key] || ['match'];
const mode = choices[Math.min(i, choices.length - 1)];
const bytes = mode === 'stale' ? Buffer.from('old bytes') : fs.readFileSync(key);
if (mode === 'corrupt') bytes[bytes.length - 1] ^= 1;
fs.writeFileSync(output, bytes);
process.exit(mode === 'http-error' ? 22 : 0);
`, { mode: 0o755 });
    fs.writeFileSync(path.join(root, 'bin/sleep'), '#!/bin/sh\nprintf "sleep\\n" >> "$TRACE_FILE"\n', { mode: 0o755 });
    const result = spawnSync('bash', [verifier, ...assets], {
      cwd: root, encoding: 'utf8', timeout: 5000,
      env: { ...process.env, PATH: path.join(root, 'bin') + path.delimiter + process.env.PATH,
        TMPDIR: path.join(root, 'tmp'), SITE_URL: 'https://example.test/bao-lab/',
        GITHUB_SHA: 'test-commit', LIVE_VERIFY_ATTEMPTS: '2', LIVE_VERIFY_TIMEOUT: '12',
        LIVE_VERIFY_DELAY: '0', LIVE_VERIFY_QUERY: 'sha', MOCK_PLAN: JSON.stringify(plan),
        TRACE_FILE: path.join(root, 'trace'), ...overrides }
    });
    assert.ifError(result.error);
    const trace = fs.existsSync(path.join(root, 'trace')) ? fs.readFileSync(path.join(root, 'trace'), 'utf8').trim().split('\n') : [];
    assert.deepEqual(fs.readdirSync(path.join(root, 'tmp')), [], 'all temporary downloads must be cleaned up');
    return { ...result, trace, calls: fs.existsSync(path.join(root, 'calls.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'calls.json'))) : {} };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('all matching assets pass, using commit query, timeout and no-cache header', () => {
  const r = run({}); assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls, { 'a.js': 1, 'b.js': 1 });
  const args = JSON.parse(r.trace[0]);
  assert.ok(args.includes('https://example.test/bao-lab/a.js?sha=test-commit'));
  assert.ok(args.includes('Cache-Control: no-cache'));
  assert.equal(args[args.indexOf('--max-time') + 1], '12');
  assert.equal(r.trace.includes('sleep'), false);
});
for (const asset of ['a.js', 'b.js']) {
  test(`stale ${asset} fails despite the other asset matching`, () => {
    const r = run({ [asset]: ['stale'] }); assert.equal(r.status, 1);
    assert.match(r.stderr, new RegExp('Content differs: ' + asset.replace('.', '\\.')));
    assert.deepEqual(r.calls, { 'a.js': 2, 'b.js': 2 });
    assert.equal(r.trace.filter(s => s === 'sleep').length, 1, 'never sleep after final attempt');
  });
}
test('HTTP failure cannot pass even if curl wrote matching bytes', () => {
  const r = run({ 'a.js': ['http-error'] }); assert.equal(r.status, 1);
  assert.match(r.stderr, /Download failed: a.js/);
});
test('a later fully matching attempt succeeds', () => {
  const r = run({ 'a.js': ['stale', 'match'] }); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /attempt 2\/2/);
});
test('matches from separate attempts cannot be combined into false success', () => {
  const r = run({ 'a.js': ['match', 'stale'], 'b.js': ['stale', 'match'] });
  assert.equal(r.status, 1); assert.deepEqual(r.calls, { 'a.js': 2, 'b.js': 2 });
});
test('one-asset workflow and default commit query are supported', () => {
  const r = run({}, { LIVE_VERIFY_QUERY: '' }, ['a.js']); assert.equal(r.status, 0);
  assert.ok(JSON.parse(r.trace[0]).includes('https://example.test/bao-lab/a.js?commit=test-commit'));
});
for (const [label, env, assets] of [
  ['missing checkout', {}, ['missing.js']], ['no assets', {}, []],
  ['zero attempts', { LIVE_VERIFY_ATTEMPTS: '0' }, ['a.js']],
  ['negative delay', { LIVE_VERIFY_DELAY: '-1' }, ['a.js']],
  ['bad timeout', { LIVE_VERIFY_TIMEOUT: 'abc' }, ['a.js']],
  ['bad query key', { LIVE_VERIFY_QUERY: 'a&b' }, ['a.js']],
]) test(`invalid input fails before any request: ${label}`, () => {
  const r = run({}, env, assets); assert.equal(r.status, 2); assert.deepEqual(r.trace, []);
});

test('binary portrait bytes including NUL, high bytes and newlines match exactly', () => {
  const r = run({}, {}, ['portrait.webp']); assert.equal(r.status, 0, r.stderr);
});
test('portrait with intact WebP marker and size but different trailing byte fails', () => {
  const r = run({ 'portrait.webp': ['corrupt'] }, {}, ['portrait.webp']);
  assert.equal(r.status, 1); assert.match(r.stderr, /Content differs: portrait.webp/);
});
