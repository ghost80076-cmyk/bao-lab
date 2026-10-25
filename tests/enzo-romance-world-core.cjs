'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const UI = require('../js/gameplay-ui-core.js');
const raw = JSON.parse(fs.readFileSync('data/characters/community/fe/mafia-emperor-enzo.json', 'utf8'));
const ctx = vm.createContext({console, structuredClone});
vm.runInContext(fs.readFileSync('js/character.js', 'utf8') + '\nthis.Engine = CharacterEngine;', ctx);
const prompt = ctx.Engine.composeSystemPrompt(raw, {persona:{name:'測試玩家',gender:'女性'},displayMode:'ui',storyNPCs:[{id:'driver',name:'司機',role:'接送',location:'車庫',notes:'等待今晚已約定的行程'}]});
assert.ok(prompt.includes(raw.content.npc_rules), 'NPC rules must reach the assembled prompt');
assert.match(prompt, /司機/, 'runtime NPC roster must reach the model');
assert.equal(prompt.split(raw.content.npc_rules).length - 1, 1, 'do not inject NPC rules twice');
assert.ok(prompt.includes(raw.content.author_instructions));
const schema = UI.normalize(raw.gameplay.gameplay_ui);
assert.ok(schema);
function check(sections) {
 for(const s of sections) {
  if(s.type === 'tabs') {for(const t of s.tabs) check(t.sections);continue;}
  assert.notEqual(s.title, '公園', 'scene heading must survive leaving the opening');
  for(const item of s.items || []) if(item.path) assert.notEqual(UI.getPath(raw.gameplay.initial_state,item.path),undefined,item.path);
 }
}
for(const panel of schema.panels)check(panel.sections);
assert.equal(raw.gameplay.initial_state.modules.relationship.stage, '陌生人｜初次接觸');
assert.equal(raw.gameplay.initial_state.modules.relationship.dynamic, '尚未形成');
assert.equal(raw.gameplay.initial_state.npcs.length, 1);
assert.ok(fs.existsSync(raw.meta.avatar), 'preserve existing character artwork');
console.log('PASS Enzo: assembled NPC rules/roster, narrative instructions, native UI bindings and initial relationship');
