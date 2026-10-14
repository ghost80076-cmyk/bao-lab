'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const card = require('../data/characters/community/8f/fusion-world-entertainment-empire.json');
const regex = require('../data/characters/community/8f/fusion-world-entertainment-empire.regex.json');
const catalog = require('../data/character-catalog/community/page-0001.json');
const UI = require('../js/gameplay-ui-core.js');
const Regex = require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.author_id,'banzhang');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.id,'fusion-world-entertainment-empire');
assert.equal(card.meta.category,'general');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.meta.avatar,'assets/community/8f/fusion-world-entertainment-empire.avif');
const cover=fs.readFileSync(require('node:path').join(__dirname,'../',card.meta.avatar));
assert.ok(cover.length>12000,'Official fusion cover should exist');
assert.equal(cover.subarray(4,12).toString('ascii'),'ftypavif','Cover should be valid AVIF media');
assert.equal(catalog.find(x => x.id === card.meta.id)?.avatar,card.meta.avatar);

const text = [card.content.greeting,card.content.world,card.content.system_prompt,card.content.lore].join('\n');
for (const token of ['2024','2080','七層','B1','C級後期','Lv.4','Lv.5','純光','1000000','零','歐陽雪','張昊然','小柔','小雪','共鳴']) {
  assert.ok(text.includes(token),'Missing original setting: '+token);
}
for (const age of ['20歲','21歲','22歲','24歲']) assert.ok(text.includes(age),'Missing direct age fact: '+age);
assert.equal(card.gameplay.initial_state.modules.energy.light,1000000);
assert.equal(card.gameplay.initial_state.modules.player.control,'Lv.4');
assert.equal(card.gameplay.initial_state.modules.business.artists,0);
assert.equal(card.gameplay.initial_state.modules.business.ap,4);
assert.equal(card.gameplay.initial_state.modules.home.size,'7F＋B1');
assert.ok(card.gameplay.initial_state.npcs.every(x => Number(x.age)>=18));
const n = card.gameplay.initial_state.npcs.map(x => x.name);
assert.equal(n.length,4);
assert.ok(n.includes('小雪') && n.includes('歐陽雪'));
assert.notEqual(n.indexOf('小雪'),n.indexOf('歐陽雪'));
assert.equal((card.content.lore.match(/【世界書：/g)||[]).length,12);
assert.equal(card.content.dynamic_prompts.length,10);
assert.match(card.content.system_prompt,/戀愛\/個人行動|戀愛|親密/);
assert.match(card.content.system_prompt,/不受經營AP限制/);
assert.match(card.content.system_prompt,/Lv.5才/);
assert.doesNotMatch(card.content.system_prompt,/初始已簽約伊芯|開始即有兩名簽約藝人/);

const sandbox={console};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require.resolve('../js/character.js'),'utf8')+'\nthis.engine=CharacterEngine;',sandbox);
assert.equal(sandbox.engine.validate(card).ok,true);
const normalized=sandbox.engine.normalize(card);
assert.equal(normalized.world_modules.length,12);
const ui=UI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.deepEqual(ui.panels.map(x=>x.id),['now','relation','power','world','business']);
const state=structuredClone(card.gameplay.initial_state);
assert.ok(UI.applyBuilderValues(card.gameplay.ui_schema,
{focus:'既存伴侶與第三者競逐',business:'低干擾，玩家想經營才出現',pressure:'慢熱偏少'},state));
assert.equal(state.modules.setup.focus,'既存伴侶與第三者競逐');
assert.equal(state.modules.setup.business,'低干擾，玩家想經營才出現');
assert.equal(state.modules.setup.pressure,'慢熱偏少');
assert.equal(state.modules.energy.light,1000000);
const paths=[];
const walk=x=>{if(!x||typeof x!=='object')return;for(const [k,v] of Object.entries(x)){if(k==='path'||k==='target_path')paths.push(v);else walk(v)}};
walk(card.gameplay.ui_schema);
for (const p of paths) if(typeof p==='string'&&p.startsWith('modules.'))
  assert.notEqual(UI.getPath(state,p),undefined,'Unknown UI path '+p);
assert.equal(regex.characterId,card.meta.id);
const rules=Regex.normalize(regex);
assert.equal(rules.length,3);
assert.equal(Regex.render(card.content.greeting,rules,false).matched,false);
for(const name of ['NOTICE','RESONANCE','DEAL']){
 const sample='【YB:FUSION:'+name+'】\n事件已記錄。\n【/YB:FUSION:'+name+'】';
 const r=Regex.render(sample,rules,false);
 assert.equal(r.matched,true,name);
 assert.match(r.text||r.html||JSON.stringify(r),/事件已記錄/);
}
assert.equal(Regex.render('小柔把電話掛了。',rules,false).matched,false);
assert.ok(card.presentation.opening.choices.length>=4);
console.log('PASS fusion world relationship-first flow, direct ages, optional business and original mechanics');
