const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  const original = '<section class="ornate"><p>她交出青銅鑰匙，約定明日見面。</p><style>.ornate{color:red}</style><script>window.bad=true</script><p>地點：鐘樓</p></section>';
  const stored = { role: 'assistant', content: original };
  const calls = [];
  const Chat = { messages: [stored], async context() { return this.messages; } };
  const API = { async send(config, messages) { calls.push({ config, messages }); return { text: 'ok' }; } };
  const sandbox = { window: {}, Chat, API, App: {}, GameState: {} };
  vm.runInNewContext(fs.readFileSync('js/global-bridge.js', 'utf8'), sandbox);
  const story = await Chat.context({ memory: { mode: 'full' } });
  assert.equal(story[0].content.includes('<section'), false);
  assert.match(story[0].content, /青銅鑰匙/);
  assert.match(story[0].content, /鐘樓/);
  assert.equal(stored.content, original, 'original story remains untouched');
  const prompt = `【待整理舊對話】\n角色/系統：${original}`;
  await API.send({ __memoryTask: true }, [{ role: 'system', content: 'Observer' }, { role: 'user', content: prompt }]);
  const cleaned = calls[0].messages[1].content;
  assert.doesNotMatch(cleaned, /<section|<style|<script|ornate|window\.bad/);
  assert.match(cleaned, /青銅鑰匙/);
  assert.match(cleaned, /鐘樓/);
  assert.equal(prompt.includes('<section'), true, 'source prompt remains untouched');
  await API.send({}, [{ role: 'user', content: '<b>玩家輸入</b>' }]);
  assert.equal(calls[1].messages[0].content, '<b>玩家輸入</b>', 'ordinary player requests unchanged');
  console.log('Smart-memory HTML request isolation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
