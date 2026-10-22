const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function run(data) {
  const messages = [];
  let context;
  const sandbox = {
    self: { postMessage(message) { messages.push(message); } },
    importScripts(...files) {
      for (const file of files) {
        const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
        vm.runInContext(source, context, { filename: file });
      }
    }
  };
  context = vm.createContext(sandbox);
  const worker = fs.readFileSync(path.join(__dirname, '..', 'js/regex-chat-worker.js'), 'utf8');
  vm.runInContext(worker, context, { filename: 'regex-chat-worker.js' });
  context.self.onmessage({ data });
  return JSON.parse(JSON.stringify(messages[0]));
}

test('author regex runs before legacy display regex without mutating original', () => {
  const input = 'NPC: hello';
  const result = run({
    source: input,
    authorRules: [{ pattern: 'NPC', replacement: '同伴' }],
    regexRules: [{ pattern: '同伴', replacement: '角色' }]
  });
  assert.deepEqual(result, { ok: true, text: '角色: hello' });
  assert.equal(input, 'NPC: hello');
});

test('rich author markup is delegated to iframe renderer, never inserted into plain chat', () => {
  assert.deepEqual(run({
    source: 'CARD',
    authorRules: [{ pattern: 'CARD', replacement: '<button onclick="alert(1)">click</button>' }],
    regexRules: []
  }), { ok: true, text: 'CARD' });
});

test('invalid author collection fails closed to the unmodified story', () => {
  assert.deepEqual(run({
    source: 'Original story',
    authorRules: new Array(61).fill({ pattern: 'story', replacement: 'changed' }),
    regexRules: []
  }), { ok: false });
});

test('ordinary regex library remains usable from Node and worker contexts', () => {
  const regex = require('../js/regex-library.js');
  assert.equal(regex.apply('NPC', [{ pattern: 'NPC', replacement: '角色' }]), '角色');
  assert.equal(run({ source: 'NPC', authorRules: [], regexRules: [{ pattern: 'NPC', replacement: '角色' }] }).text, '角色');
});
