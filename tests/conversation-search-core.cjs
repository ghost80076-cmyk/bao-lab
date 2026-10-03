const assert = require('node:assert/strict');
const core = require('../js/conversation-search-core.js');

const messages = [
  { id: 'u1', role: 'user', content: '我在雨夜走進港口。', createdAt: '2026-09-01T12:00:00.000Z' },
  { id: 'a1', role: 'assistant', content: '林沉風撐著傘，在港口等你。', createdAt: '2026-10-02T12:00:00.000Z' },
  { id: 'u2', role: 'user', content: '我問他，那封信還留著嗎？', createdAt: '2026-10-03T08:00:00.000Z' },
  { id: 'a2', role: 'assistant', content: '「一直都在。」他把信放在桌上。', createdAt: '2026-09-15T12:00:00.000Z' }
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

const chapterRecords = [
  ...core.messageRecords({ messages: messages.slice(0, 2), chapterId: 'chapter-1', chapterLabel: '序章' }),
  ...core.messageRecords({ messages: messages.slice(2), chapterId: 'chapter-2', chapterLabel: '第二章' })
];
const allChapters = core.search({ records: chapterRecords, query: '港口' });
assert.equal(allChapters.total, 2);
assert.deepEqual(allChapters.results.map(item => item.chapterLabel), ['序章', '序章']);
const secondChapter = core.search({ records: chapterRecords, query: '信', chapter: 'chapter-2' });
assert.equal(secondChapter.total, 2);
assert.equal(secondChapter.results.every(item => item.chapterId === 'chapter-2'), true);

const changeRecords = chapterRecords.map(record => record.id === 'a1' ? { ...record, changes: ['memory', 'state'] } : record);
const stateChanges = core.search({ records: changeRecords, query: '', change: 'state' });
assert.equal(stateChanges.total, 1);
assert.equal(stateChanges.results[0].id, 'a1');
const memoryPort = core.search({ records: changeRecords, query: '港口', change: 'memory' });
assert.equal(memoryPort.total, 1);
assert.deepEqual(core.search({ records: changeRecords, query: '' }), { total: 0, results: [], truncated: false });

const recentPort = core.search({ messages, query: '港口', date: '7d', now: '2026-10-03T12:00:00.000Z' });
assert.equal(recentPort.total, 1);
assert.equal(recentPort.results[0].id, 'a1');

const todayLetter = core.search({ messages, query: '信', date: 'today', now: '2026-10-03T12:00:00.000Z' });
assert.equal(todayLetter.total, 1);
assert.equal(todayLetter.results[0].id, 'u2');
assert.equal(core.dateThreshold('30d', '2026-10-03T12:00:00.000Z'), Date.parse('2026-09-03T12:00:00.000Z'));

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
