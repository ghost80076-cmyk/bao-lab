'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = {activeCharacter:{},renderChatShell(){},showView(){}};
const scene = {prefs:{mode:'efficient'},sceneTemplates:{communication:{}}};
const window = {BAOSceneHTML:scene,BAOSceneStoryPreferences:{},BAOCharacterStatus:{}};
const document = {getElementById(){return null;},querySelector(){return null;},
  createElement(){return {addEventListener(){}};},head:{appendChild(){}}};
vm.runInNewContext(fs.readFileSync('js/chat-markup.js','utf8'),{App:app,Chat:{messages:[]},window,document});
const rich = window.BAOChatMarkup.isRichMessage;
for (const mode of ['native','efficient','free']) {
  scene.prefs.mode=mode;
  assert.equal(rich('【週五｜酒吧】\n他遞來菜單。'),false,mode+' plain text must use themed ink');
  assert.equal(rich('正文[STATUS]<div>狀態</div>[/STATUS]'),false);
  assert.equal(rich('<div style="color:#fff">作者排版</div>'),mode!=='native');
  assert.equal(rich('[SCENE:communication][NARRATION]甲：你好[/NARRATION]'),mode==='efficient');
  app.activeCharacter={opening:{posts:[{content:'結構化開場'}]}};
  assert.equal(rich('開場',true),mode!=='native');
  app.activeCharacter={};
}
const context = {window:{App:app},GameState:{current:{modules:{}},create(){},applyUpdate(){}},WorldStateEngine:{},App:app,structuredClone};
vm.runInNewContext(fs.readFileSync('js/world-modules.js','utf8'),context);
const modules = context.window.BAOWorldModules;
for (const [path,ids] of [
  ['data/characters/community/9c/unread-afterglow-seoul.json',['relationship_edges','offscreen_facts']],
  ['data/characters/community/c4/kept-in-frame-lin-youzhen.json',['relationship_vectors','private_facts']],
  ['data/characters/community/da/desire-academy-city.json',['relations']]
]) {
  const card=JSON.parse(fs.readFileSync(path,'utf8'));
  for(const id of ids) assert.equal(card.gameplay.world_modules.find(d=>d.id===id).visibility,'internal');
  // Restore an old embedded character snapshot with no visibility metadata.
  const legacy={id:card.meta.id,world_modules:card.gameplay.world_modules.map(d=>{const c={...d};delete c.visibility;return c;})};
  const before=JSON.stringify(legacy);
  for(const id of ids) assert.equal(modules.definitions(legacy).find(d=>d.id===id).visibility,'internal');
  assert.equal(JSON.stringify(legacy),before);
}
assert.equal(modules.definitions({id:'my-card',world_modules:[{id:'secrets'}]})[0].visibility,'public');
console.log('PASS themed plain text, authored layout preservation, and legacy backstage module privacy');
