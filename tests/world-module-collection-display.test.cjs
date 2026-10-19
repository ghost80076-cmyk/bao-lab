'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const escapeHTML = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const ui = { innerHTML: '', querySelector: () => null };
const moduleDefinitions = [
  { id:'people', label:'相關人物', icon:'◌', kind:'collection', tracking:'medium', context:'recent' },
  { id:'messages', label:'訊息', icon:'✉', kind:'collection', tracking:'medium', context:'recent' },
  { id:'profile', label:'檔案', icon:'□', kind:'object', tracking:'medium', context:'recent',
    fields:[{ key:'records',label:'紀錄' }] }
];
const GameState = { current:{
  moduleDefinitions,
  modules:{people:[],messages:[],profile:{records:[]}}
}};
const App = {
  config:{displayMode:'ui'},
  escapeHTML,
  activeCharacter:{id:'test'},
  renderUIPanel(){},
  renderChatShell(){},
  openBuilder(){}
};
const window = { BAOWorldModules:{ensureState(){}} };
const document = {
  querySelector(selector){ return selector.includes('link[href') ? { nodeName:'LINK' } : null; },
  getElementById(id){ return id === 'ui-panel' ? ui : null; }
};
vm.runInNewContext(fs.readFileSync('js/world-module-ui.js','utf8'),
 {window, App, GameState, document, setTimeout, console});
const display = window.BAOWorldModuleUI;
assert.ok(display?.renderModule);

const spirit=[{name:'謝承宇',public_identity:'協會公告上的外校研究生候選名單',
  known_connection:'尚未確認是否進入今日共鳴實習',status:'未正式登場'}];
GameState.current.modules.people=[JSON.stringify(spirit)];
const before = JSON.stringify(GameState.current.modules.people);
display.renderModule('people');
assert.match(ui.innerHTML,/謝承宇/);
assert.match(ui.innerHTML,/身分/);
assert.match(ui.innerHTML,/已知資訊/);
assert.match(ui.innerHTML,/未正式登場/);
assert.doesNotMatch(ui.innerHTML,/&quot;name&quot;/);
assert.doesNotMatch(ui.innerHTML,/public_identity/);
assert.equal(JSON.stringify(GameState.current.modules.people),before,'render must not mutate persisted collection data');

const chenxi={name:'歐陽雪',identity:'月影學院知名成年潛力藝人',
  known:'有男友張昊然；非晨曦旗下',relationship:'尚未認識玩家'};
GameState.current.modules.people=[JSON.stringify(chenxi)];
display.renderModule('people');
assert.match(ui.innerHTML,/歐陽雪/);
assert.match(ui.innerHTML,/張昊然/);
assert.match(ui.innerHTML,/關係/);
assert.doesNotMatch(ui.innerHTML,/&quot;identity&quot;/);

// Native object items must work too; sensitive internal fields should not be accidentally displayed.
GameState.current.modules.people=[{...chenxi,hidden_plan:'不得顯示',secret_note:'不得顯示'}];
display.renderModule('people');
assert.match(ui.innerHTML,/歐陽雪/);
assert.doesNotMatch(ui.innerHTML,/不得顯示/);

GameState.current.modules.messages=['營運通知','日結已完成',JSON.stringify([{title:'藝人合約',status:'有效'}])];
display.renderModule('messages');
assert.match(ui.innerHTML,/營運通知/);
assert.match(ui.innerHTML,/日結已完成/);
assert.match(ui.innerHTML,/藝人合約/);
assert.match(ui.innerHTML,/有效/);

// Malicious user/model values must remain inert escaped text.
GameState.current.modules.people=[JSON.stringify([{name:'<img src=x onerror=alert(1)>',
  known:'<script>alert(1)</script>'}])];
display.renderModule('people');
assert.doesNotMatch(ui.innerHTML,/<img|<script/);
assert.match(ui.innerHTML,/&lt;img/);
assert.match(ui.innerHTML,/&lt;script/);

// Malformed JSON must not throw or silently delete the original text.
GameState.current.modules.people=['[{not valid JSON]'];
display.renderModule('people');
assert.match(ui.innerHTML,/not valid JSON/);

GameState.current.modules.profile.records=[{name:'公開紀錄',status:'正常'}];
display.renderModule('profile');
assert.match(ui.innerHTML,/公開紀錄/);
assert.doesNotMatch(ui.innerHTML,/&quot;name&quot;/);
console.log('PASS world module collection cards render safely without raw JSON');

// Compact story status must use the same decoding as the full module tabs.
const record = {time:'22:36',source:'親眼所見',fact:'他撿起圍巾',verification:'關係未確認',title:'酒吧線索',status:'待查證',secret_note:'不可顯示'};
for (const value of [[record], JSON.stringify([record]), [JSON.stringify([record])]]) {
  const saved = JSON.stringify(value);
  const lines = display.statusLines({fields:[{key:'fact',label:'親見事實'}]}, value).join('\n');
  for (const text of ['時間：22:36', '來源：親眼所見', '親見事實：他撿起圍巾', '確認程度：關係未確認', '待查證']) assert.ok(lines.includes(text));
  assert.doesNotMatch(lines, /不可顯示|\{"|\[\{/);
  assert.equal(JSON.stringify(value),saved);
}
assert.match(display.statusLines({}, '[{bad JSON]').join('\n'), /bad JSON/);
console.log('PASS compact status decodes native and legacy collections without mutating state');
