const assert = require('node:assert/strict');
const test = require('node:test');
const R = require('../js/regex-library.js');
const storage = { values: {}, setItem(k,v) { this.values[k]=v; }, getItem(k) { return this.values[k] || null; } };
test('display-only replacement runs locally and preserves original', () => {
  const input = 'NPC: hello';
  assert.equal(R.apply(input, [{pattern:'NPC:',replacement:'角色：'}]), '角色： hello');
  assert.equal(input, 'NPC: hello');
});
test('import familiar regex_scripts and block embedded scripts without persisting them', () => {
  const rules = R.importRules({regex_scripts:[
    {scriptName:'美化',findRegex:'【美化】',replaceString:'<script>window.test=1</script>'},
    {scriptName:'純文字',findRegex:'\\[#時間=([^#]+)#\\]',replaceString:'時間：$1'}
  ]});
  assert.equal(rules[0].enabled, false);
  assert.equal(rules[0].replacement, '');
  assert.match(rules[0].reason,/HTML/);
  assert.equal(rules[1].enabled, true);
  assert.equal(R.apply('[#時間=晚上八點#]', rules), '時間：晚上八點');
});
test('invalid and complex patterns cannot crash rendering', () => {
  assert.equal(R.validate({pattern:'(',replacement:'x'}).enabled,false);
  assert.equal(R.validate({pattern:'(a+)+$',replacement:'x'}).enabled,false);
  assert.equal(R.apply('a'.repeat(R.MAX_TEXT + 1), [{pattern:'a',replacement:'b'}]), 'a'.repeat(R.MAX_TEXT + 1));
});
test('settings persist independently of API keys and default off', () => {
  assert.equal(R.load(storage).active, false);
  R.save({active:true,rules:[{pattern:'cat',replacement:'貓'}]},storage);
  const state = R.load(storage);
  assert.equal(state.active,true);
  assert.equal(R.apply('cat',state.rules),'貓');
  assert.doesNotMatch(storage.values[R.KEY],/api[_-]?key/i);
});
test('rules cap and malformed JSON structures are rejected', () => {
  assert.throws(()=>R.importRules({regex_scripts:new Array(41).fill({findRegex:'x'})}),/40/);
  assert.throws(()=>R.importRules({entries:[]}),/找不到/);
});