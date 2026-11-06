const assert = require('node:assert/strict');
const core = require('../js/character-studio-npc-editor-core.js');

const earlier = [{
  name: '林曼', aliases: ['Queen'], role: '管家', location: '廚房',
  notes: '既有作者補充', equipment: { ring: true },
  relationship: '林曼信任玩家，不代表玩家信任林曼。'
}, { name: '霜', role: '鄰居' }];
const notes = '一般作者備忘\n\n' + '【夜灣 NPC 作者備註:' + encodeURIComponent('林曼') + '】\n只供作者參考\n【/夜灣 NPC 作者備註】';
const first = core.inspect(earlier[0], notes);
assert.equal(first.secret, '只供作者參考');
assert.equal(first.notes, '既有作者補充');
const changed = core.upsert(earlier, {
  ...first, name: '林曼', role: '主管', aliases: 'Queen、曼姐',
  goal: '守護妹妹', notes: first.notes, presence: 'present'
}, '林曼');
assert.equal(changed.length, 2);
assert.equal(changed[0].role, '主管');
assert.deepEqual(changed[0].equipment, {ring:true});
assert.equal(changed[1].name, '霜');
assert.ok(changed[0].notes.includes('守護妹妹'));
assert.ok(changed[0].notes.includes('既有作者補充'));
assert.equal(earlier[0].role, '管家');
const readback = core.inspect(changed[0], notes);
assert.equal(readback.goal, '守護妹妹');
assert.equal(readback.notes, '既有作者補充');
assert.equal(readback.secret, '只供作者參考');
assert.ok(!JSON.stringify(changed).includes('只供作者參考'));
assert.deepEqual(core.upsert(changed, {...readback,goal:'',presence:'away'},'林曼')[0].notes, '既有作者補充');
assert.equal(core.withSecret(notes, '林曼', '新秘密').includes('一般作者備忘'), true);
const afterSecret = core.withSecret(notes, '林曼', '新秘密');
assert.equal(core.readSecret(afterSecret, '林曼'), '新秘密');
assert.equal(core.withSecret(afterSecret, '林曼', '').trim(), '一般作者備忘');
assert.equal(core.remove(changed,'林曼')[0].name,'霜');
assert.equal(earlier.length, 2);
assert.throws(() => core.upsert(earlier,{name:'曼姐',aliases:'Queen',presence:'unknown'}), /衝突/);
assert.throws(() => core.upsert(earlier,{name:'霜',presence:'unknown'}), /衝突/);
assert.throws(() => core.upsert(earlier,{name:'改名',presence:'unknown'},'林曼'), /更名/);
assert.throws(() => core.upsert(earlier,{name:'不存在',presence:'unknown',goal:'x'},'不存在'), /找不到/);
assert.throws(() => core.upsert(earlier,{name:'新角',presence:'fake'}), /合法/);
assert.throws(() => core.upsert(earlier,{name:'新角',aliases:Array.from({length:9},(_,i)=>'Alias'+i),presence:'unknown'}), /最多/);
assert.throws(() => core.splitGoal('【夜灣 NPC 目標】未閉合'), /不完整/);
assert.throws(() => core.withSecret('【夜灣 NPC 作者備註:' + encodeURIComponent('甲') + '】', '甲', 'x'), /不完整/);
const sample = core.upsert([], {name:'新角色',aliases:'阿新',role:'研究生',goal:'完成研究',secret:'不要進 NPC',presence:'unknown'});
assert.equal(sample[0].name,'新角色');
assert.equal(sample[0].notes.includes('不要進 NPC'),false);
assert.deepEqual(core.inspect(sample[0]).aliases, '阿新');
console.log('studio NPC editor core: OK');
