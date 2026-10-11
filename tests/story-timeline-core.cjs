const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
global.window=global;
const input={value:''};global.document={getElementById:()=>input};
let updates=0,sends=0;
global.App={activeCharacter:{timeline_policy:{version:1,module:'timeline',past_value:'回憶',present_value:'現在'},world_modules:[{id:'timeline',kind:'object'}]},
  sendMessage(){sends++;},buildSystemPrompt(){return 'BASE';},
  wrapSendMessage(id,wrapper){const next=this.sendMessage.bind(this);this.sendMessage=(...args)=>wrapper.call(this,next,...args);},
  wrapBuildSystemPrompt(id,wrapper){const next=this.buildSystemPrompt.bind(this);this.buildSystemPrompt=(...args)=>wrapper.call(this,next,...args);}};
global.GameState={current:{time:'21:00',location:'警局',modules:{timeline:{current:'現在',present_time:'21:00'},economy:{cash:100},case:{progress:10}},worldClock:{tickMinutes:20},npcs:[],events:[]},
  applyUpdate(u){updates++;Object.assign(this.current,u);},addEvent(t){this.current.events.push(t);}};
vm.runInThisContext(fs.readFileSync('js/story-timeline.js','utf8'));
for (const text of ['不想【回憶】昨日','「【回憶】昨日」','【回憶】','我看到【回到現在】']) assert.equal(BAOStoryTimeline.transition(text),false);
input.value='【回憶】昨日的筆錄';App.sendMessage();assert.equal(sends,1);
assert.equal(GameState.current.modules.timeline.current,'回憶');
const original=structuredClone(GameState.current);
const bad={time:'次日',location:'港口',npcs:[{name:'秘密人物'}],world_clock:{advance_minutes:90},modules:{economy:{cash:0},case:{progress:100},timeline:{current:'現在',past_time:'昨日 20:00',past_location:'碼頭',past_events:['車燈亮起。']}}};
GameState.applyUpdate(bad);
assert.equal(updates,0);
for(const k of ['time','location','npcs','worldClock','events']) assert.deepEqual(GameState.current[k],original[k]);
assert.deepEqual(GameState.current.modules.economy,original.modules.economy);
assert.deepEqual(GameState.current.modules.case,original.modules.case);
assert.equal(GameState.current.modules.timeline.current,'回憶');
assert.equal(GameState.current.modules.timeline.past_time,'昨日 20:00');
GameState.addEvent('回憶中的車票');assert.equal(GameState.current.events.length,0);
assert.match(App.buildSystemPrompt(),/當前回憶框架/);
GameState.current=JSON.parse(JSON.stringify(GameState.current));GameState.applyUpdate(bad);assert.equal(updates,0,'restored past stays protected');
assert.equal(BAOStoryTimeline.transition('【回到現在】'),true);
GameState.applyUpdate({modules:{timeline:{current:'回憶',present_time:'偽造'},case:{progress:15}}});
assert.equal(GameState.current.modules.timeline.current,'現在','model cannot switch');
assert.equal(GameState.current.modules.timeline.present_time,'21:00');assert.equal(updates,1);
App.activeCharacter={};GameState.applyUpdate({time:'22:00'});assert.equal(GameState.current.time,'22:00','legacy unaffected');
console.log('PASS timeline: explicit commands, frozen present, bounded memory records, persistence and legacy passthrough');

// Load the real late event wrapper after the guard; it must not bypass it.
App.activeCharacter={timeline_policy:{version:1,module:'timeline',past_value:'回憶',present_value:'現在'},world_modules:[{id:'timeline',kind:'object'}]};
GameState.current=structuredClone(original);
GameState.create=function(){return this.current;};
global.Storage={};
const integrity=fs.readFileSync('js/story-integrity-fixes.js','utf8');
vm.runInThisContext(integrity.slice(0,integrity.indexOf('  const previousRestore'))+'\n})();');
BAOStoryTimeline.transition('【回憶】車票來源');
GameState.applyUpdate({new_events:['昨日查到車票'],modules:{timeline:{past_time:'昨日'}}});
GameState.addEvent('昨日詢問目擊者');
assert.deepEqual(GameState.current.events,original.events);
assert.ok(GameState.current.modules.timeline.past_events.includes('昨日查到車票'));
assert.ok(GameState.current.modules.timeline.past_events.includes('昨日詢問目擊者'));
console.log('PASS timeline integration: late story-integrity wrapper cannot write flashback events into present log');
