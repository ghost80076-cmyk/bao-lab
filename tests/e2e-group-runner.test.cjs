const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readSpecs, main } = require('../scripts/run-e2e-group.cjs');

function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-group-'));
  try {
    const files = ['first.spec.cjs', 'second spec.cjs'].map(name => path.join(root, name));
    files.forEach(file => fs.writeFileSync(file, ''));
    return fn({ root, files, missing: path.join(root, 'missing.spec.cjs') });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('real files retain order and spaces, ignoring only blank lines and CRLF', () => fixture(({ files }) => {
  assert.deepEqual(readSpecs(`\r\n ${files[0]} \r\n\r\n${files[1]}\r\n`), files);
}));
for (const raw of [undefined, '', ' \r\n \n']) test(`empty group is an error: ${JSON.stringify(raw)}`, () => {
  assert.throws(() => readSpecs(raw), /no declared test files/);
});
test('a directory is not an executable test file', () => fixture(({ root }) => {
  assert.throws(() => readSpecs(root), /missing test files/);
}));
test('one missing file rejects the whole group before npm; valid files are not silently retained', () => fixture(({ files, missing }) => {
  let invoked = false; const messages = [];
  const code = main({ SPEC_LIST: [files[0], missing, files[1]].join('\n') },
    () => { invoked = true; }, message => messages.push(message));
  assert.equal(code, 1); assert.equal(invoked, false);
  assert.ok(messages[0].includes(missing));
}));
test('all missing files are reported, never skipped as a passing group', () => fixture(({ missing }) => {
  const second = missing + '-also';
  assert.throws(() => readSpecs(missing + '\n' + second), error =>
    error.message.includes(missing) && error.message.includes(second));
}));
test('complete group forwards every declared file as its own argument', () => fixture(({ files }) => {
  const env = { SPEC_LIST: files.join('\n'), CI: 'true' }; let calls = 0;
  const code = main(env, (command, args, options) => {
    calls++; assert.equal(command, 'npm');
    assert.deepEqual(args, ['run', 'test:e2e', '--', ...files, '--project=chromium']);
    assert.equal(options.env, env); assert.equal(options.stdio, 'inherit');
    assert.notEqual(options.shell, true);
    return { status: 0 };
  });
  assert.equal(code, 0); assert.equal(calls, 1);
}));
test('Playwright failure exit status is preserved', () => fixture(({ files }) => {
  assert.equal(main({ SPEC_LIST: files[0] }, () => ({ status: 7 })), 7);
}));
test('failed startup or terminated child cannot be reported as success', () => fixture(({ files }) => {
  const messages = [];
  assert.equal(main({ SPEC_LIST: files[0] }, () => ({ status: null, error: new Error('not found') }), m => messages.push(m)), 1);
  assert.match(messages[0], /Cannot start Playwright: not found/);
  assert.equal(main({ SPEC_LIST: files[0] }, () => ({ status: null, signal: 'SIGTERM' })), 1);
}));
