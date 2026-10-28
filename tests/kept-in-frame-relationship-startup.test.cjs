'use strict';

const assert = require('node:assert/strict');
const card = require('../data/characters/community/c4/kept-in-frame-lin-youzhen.json');
const startup = require('../js/story-startup-core.js');

const spec = card.gameplay.story_startup;
const builder = card.gameplay.ui_schema.builder;
assert.equal(builder.kind, 'story');
assert.equal(builder.fields.find(field => field.key === 'relationship').presentation, 'cards');
const relations = ['初識', '朋友', '曖昧對象', '戀人', '舊識'];
assert.equal(spec.version, 1);
assert.equal(spec.selector_path, 'modules.session_setup.relationship');
assert.deepEqual(spec.cases.map(c => c.value), relations);
assert.equal(startup.normalize(spec).cases.length, 5);
assert.equal(card.content.greeting, card.presentation.opening.posts[0].transition + '\n\n' + card.presentation.opening.posts[0].content);
assert.match(card.content.system_prompt, /【關係開局與情感回饋】/);
assert.match(card.content.system_prompt, /【事件延續】/);

const initial = card.gameplay.initial_state;
const greetings = new Set();
const initialVectors = new Map();
const allModules = new Set(card.gameplay.world_modules.map(mod => mod.id));
for (const [index, relation] of relations.entries()) {
  const scene = structuredClone(initial);
  scene.modules.session_setup.relationship = relation;
  for (const patch of spec.cases[index].patches) {
    const part = patch.path.split('.')[1];
    assert.ok(allModules.has(part), 'patch only declares known modules: ' + patch.path);
  }
  const result = startup.apply(spec, scene, card.gameplay.world_modules);
  assert.ok(result, 'startup must apply for ' + relation);
  assert.equal(result.selected, relation);
  assert.equal(scene.modules.session_setup.relationship, relation);
  assert.equal(result.greeting, spec.cases[index].greeting);
  assert.equal(result.opening.posts[0].content, result.greeting);
  assert.equal(result.opening.posts[0].kind, 'character');
  assert.equal(result.opening.choices.length, 4, relation + ' has four optional draft choices');
  assert.ok(result.greeting.length > 200);
  assert.doesNotMatch(result.greeting, /你心裡|你不由自主|你忍不住|你被吸引|你答應了|你感到嫉妒/, relation);
  assert.match(scene.modules.scene.focus, /委託|拍攝/, 'scene tracks the actual opening event');
  assert.match(scene.modules.focus_person.visible_action, /委託|電話|來電/, 'visible action tracks opening');
  assert.match(scene.modules.public_bond.last_interaction, /雨夜|工作室/);
  assert.match(scene.modules.recent_events[0].summary, /第三方替玩家預約付費/);
  assert.match(scene.modules.recent_events[0].summary, /尚未為玩家拍攝/);
  assert.equal(scene.modules.evidence.length, 2, 'no evidence is invented by switching relationship');
  assert.equal(scene.modules.photo_log.length, 0, 'no photo invented');
  assert.equal(scene.modules.appointments.length, 0, 'no appointment invented');
  assert.equal(scene.modules.private_facts.length, 0, 'no hidden fact exposed in public startup');
  assert.equal(scene.modules.relationship_vectors.length, 1);
  assert.equal(scene.modules.relationship_vectors[0].to, 'player');
  assert.match(scene.modules.relationship_vectors[0].last_basis, new RegExp(relation));
  greetings.add(result.greeting);
  initialVectors.set(relation, scene.modules.relationship_vectors[0]);
}

assert.equal(greetings.size, 5, 'all five relationships have distinct opening copy');
assert.equal(initialVectors.get('初識').love, '尚未確定');
assert.match(initialVectors.get('戀人').love, /已有戀愛關係/);
assert.match(initialVectors.get('舊識').love, /未自動推定前任/);
assert.match(initialVectors.get('朋友').trust, /相處基礎/);
assert.match(initialVectors.get('曖昧對象').attraction, /未說破/);
assert.equal(initial.modules.session_setup.relationship, '初識', 'template remains immutable');
assert.equal(initial.modules.relationship_vectors[0].love, '尚未確定', 'base module remains unchanged');
assert.equal(spec.cases[0].choices[0], '我拿起委託單：「誰幫我付的錢？」');
assert.match(spec.cases[0].choices[3], /離開/);

const unknown = structuredClone(initial);
unknown.modules.session_setup.relationship = '未指定';
const fallback = startup.apply(spec, unknown, card.gameplay.world_modules);
assert.equal(fallback.greeting, card.content.greeting);
assert.equal(fallback.opening.choices.length, 4);
console.log('PASS: 留影五種關係開場、Builder 條件、初始狀態、玩家自主與回退一致');
