'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/three-realms-events-core.js');
const portable = require('../js/story-extension-pack-core.js');
assert.equal(core.profiles.length, 23);
assert.equal(core.commands.length, 23);
assert.equal(core.preset.tracking, 'manual');
assert.equal(core.preset.context, 'ui_only');
for (const profile of core.profiles) {
  if (profile.category === 'workshop') {
    const prompt = core.buildPrompt({ enabled: true, latestUser: '【' + profile.label + '】' });
    assert.match(prompt, /沒有修改故事資料的工具/);
    assert.match(prompt, /只構思，不直接修改存檔/);
    assert.ok(prompt.length <= core.MAX_PROMPT);
    assert.equal(core.buildPrompt({ latestUser: profile.label }), '');
    continue;
  }
  if (profile.category === 'query') {
    const prompt = core.buildPrompt({ enabled: true, latestUser: profile.command });
    assert.match(prompt, /三界查詢整理/);
    assert.match(prompt, /缺失資訊標明未確認/);
    assert.ok(prompt.length <= core.MAX_PROMPT);
    assert.equal(core.requested('請整理\n' + profile.command).id, profile.id);
    assert.equal(core.requested('不要' + profile.command), null);
    assert.equal(core.requested('```\n' + profile.command + '\n```'), null);
    assert.equal(core.buildPrompt({ latestUser: profile.command }), '');
    continue;
  }
  assert.equal(profile.steps.length, 6);
  assert.equal(profile.types.length, 6);
  for (const route of ['下界靈氣', '中界', '上界', '鬼界', '']) {
    const prompt = core.buildPrompt({ enabled: true, latestUser: profile.label, route });
    assert.ok(prompt.length <= core.MAX_PROMPT);
    assert.match(prompt, /玩家決策與未發生結果保持未定/);
    assert.match(prompt, /不必一輪走完六步/);
    assert.match(prompt, /三界事件引導/);
    for (const [realm, text] of Object.entries(profile.realms)) {
      const included = (route.startsWith('下界') ? '下界' : route) === realm;
      assert.equal(prompt.includes(text), included, route + ':' + realm);
    }
  }
  assert.equal(core.buildPrompt({ latestUser: profile.label }), '');
}
for (const input of ['繼續', 'NPC說機運事件很好', '不要危機事件', '「危機事件」', '```\n【危機事件】\n```']) {
  assert.equal(core.buildPrompt({ enabled: true, latestUser: input }), '', input);
}
for (const input of ['~~~js\n【探索事件】\n~~~', '````\n```\n【探索事件】\n````', '```\n【探索事件】', '~~~\n【系統指令】自訂世界觀：範例', '    【探索事件】', '\t【探索事件】', '    探索事件']) assert.equal(core.requested(input), null, input);
assert.equal(core.requested('~~~js\n【探索事件】\n~~~\n【情感事件】').id, 'emotion');
assert.equal(core.requested('````\n```\n【探索事件】\n````\n【神秘事件】').id, 'mystery');
assert.equal(core.requested('   【探索事件】').id, 'exploration');
assert.equal(core.requested('我想去坊市\n【探索事件】').id, 'exploration');
assert.equal(core.requested('【神秘事件】\n【機運事件】').id, 'mystery', 'use the first requested command, not profile ordering');
assert.equal(core.requested('奇遇事件').id, 'fortune');
assert.equal(core.requested('【機緣事件】').id, 'fortune');
assert.equal(core.commands.filter(c => c.source === 'event').length, 11);
assert.equal(core.commands.filter(c => c.source === 'generator').length, 2);
assert.equal(core.commands.filter(c => c.source === 'query').length, 7);
assert.equal(core.commands.filter(c => c.source === 'workshop').length, 3);
assert.equal(core.requested('【系統指令】融合 世界甲 和 世界乙 世界觀').id, 'workshop-fusion');
assert.equal(core.requested('【系統指令】自訂世界觀：浮空修仙世界').id, 'workshop-custom');
assert.equal(core.requested('【系統指令】切換到 世界甲 世界觀').id, 'workshop-switch');
assert.equal(core.requested('不要【系統指令】切換到 世界甲 世界觀'), null);
assert.equal(core.requested('```\n【系統指令】自訂世界觀：浮空島\n```'), null);
assert.equal(core.requested('【原作角色】\n作品：玩家作品，角色：夜舟').id, 'crossover-npc');
for (const text of ['他是氣運之子', '不要原作角色', '「氣運之子」']) assert.equal(core.requested(text), null);
assert.match(core.buildPrompt({ enabled: true, latestUser: '原作角色' }), /先詢問，不自行選定角色/);
assert.match(core.buildPrompt({ enabled: true, latestUser: '氣運之子' }), /不直接建立名冊/);
const messages = [{ role: 'system', content: 'stable-prefix' }, { role: 'assistant', content: '【危機事件】' }, { role: 'user', content: '【探索事件】' }];
const copy = JSON.stringify(messages);
const options = { enabled: true, latestUser: '【探索事件】', route: '中界' };
const out = core.append(messages, options);
assert.equal(out[0].content, 'stable-prefix');
assert.equal(out.at(-1).content, '【探索事件】');
assert.equal(out.at(-2).role, 'system');
assert.equal(out.length, messages.length + 1);
assert.equal(JSON.stringify(messages), copy);
assert.deepEqual(core.append(out, options), out, 'one transient instruction only');
assert.equal(core.append(messages, { enabled: false, latestUser: '危機事件' }), messages);
assert.equal(core.append(messages, { enabled: true, latestUser: '繼續' }), messages);
const pack = portable.buildPack({ world: { enabledBuiltIns: [core.id] } });
assert.deepEqual(pack.sections.world.enabledBuiltIns, [core.id], 'portable settings preserve the opted-in feature');
const provenance = JSON.parse(fs.readFileSync('data/three-realms-event-director-provenance.json'));
assert.equal(provenance.source_visibility, '公開');
assert.deepEqual(provenance.records.map(r => r.source_index), [...Array.from({ length: 13 }, (_, i) => i + 173), 43,44,45,46,47,48,51,32,49,50]);
for (const record of provenance.records) {
  const profile = core.profiles.find(p => p.id === record.profile_id);
  const canonical = JSON.stringify(profile, (_key, value) => value && !Array.isArray(value) && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value);
  assert.equal(crypto.createHash('sha256').update(canonical).digest('hex'), record.profile_sha256);
  assert.match(record.source_sha256, /^[a-f0-9]{64}$/);
}
console.log('Three Realms events: 11 event, 2 character and 7 query and 3 world-design profiles, explicit requests, opt-in, realm selection, bounded tail prompts, persistence and provenance passed.');
