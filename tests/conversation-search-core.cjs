const assert = require('node:assert/strict');
const core = require('../js/conversation-search-core.js');

const messages = [
  { id: 'u1', role: 'user', content: '我在雨夜走進港口。' },
  { id: 'a1', role: 'assistant', content: '林沉風撐著傘，在港口等你。' },
  { id: 'u2', role: 'user', content: '我問他，那封信還留著嗎？' },
  { id: 'a2', role: 'assistant', content: '「一直都在。」他把信放在桌上。' }
];

assert.equal(core.normalize('ＡＢＣ  雨夜'), 'abc 雨夜');

const port = core.search({ messages, greeting: '歡迎回到港口。', query: '港口' });
assert.equal(port.total, 3);
assert.deepEqual(port.results.map(item => item.index), [-1, 0, 1]);
assert.equal(port.results[2].turn, 1);

const player = core.search({ messages, query: '信 留著', role: 'user' });
assert.equal(player.total, 1);
assert.equal(player.results[0].id, 'u2');
assert.equal(player.results[0].turn, 2);

const assistant = core.search({ messages, query: '信', role: 'assistant' });
assert.equal(assistant.total, 1);
assert.equal(assistant.results[0].id, 'a2');

const greetingStored = core.search({
  messages: [{ id: 'g1', role: 'assistant', content: '歡迎回到港口。', greeting: true }, ...messages],
  greeting: '歡迎回到港口。',
  query: '港口'
});
assert.equal(greetingStored.total, 3, 'a stored greeting must not be duplicated by the character-card fallback');

const limited = core.search({ messages, query: '我', limit: 1 });
assert.equal(limited.total, 2);
assert.equal(limited.results.length, 1);
assert.equal(limited.truncated, true);

assert.deepEqual(core.search({ messages, query: '   ' }), { total: 0, results: [], truncated: false });
console.log('conversation search core test passed');
