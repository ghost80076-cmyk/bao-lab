const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const core = require('../js/world-director-core.js');
const fixture = () => ({worldClock:{tickMinutes:80, scheduledEvents:[
  {id:'wc-1',label:'港口交貨',status:'pending',dueTickMinutes:60},
  {id:'wc-2',label:'午夜碰面',status:'pending',dueTickMinutes:100},
  {id:'wc-3',label:'已取消活動',status:'cancelled',dueTickMinutes:30}
]}});
test('only due pending events appear as non-executing review candidates', () => {
  const s=fixture(), frozen=JSON.stringify(s);
  assert.deepEqual(core.plan(s).map(x=>x.eventId),['wc-1']);
  assert.equal(core.plan(s)[0].action,'review');
  assert.equal(JSON.stringify(s), frozen);
});
test('no implicit clock or event invention', () => {
  assert.deepEqual(core.plan({}),[]);
  assert.deepEqual(core.plan({worldClock:{tickMinutes:-1,scheduledEvents:[]}}),[]);
});
test('unknown and already closed event resolution rejected', () => {
  assert.equal(core.reviewClockPatch(fixture(),{resolve:['wc-999']}).safe,false);
  assert.equal(core.reviewClockPatch(fixture(),{cancel:['wc-3']}).safe,false);
  assert.equal(core.reviewClockPatch(fixture(),{resolve:['wc-1'],cancel:['wc-1']}).safe,false);
});
test('valid resolution still needs evidence and does not mutate state', () => {
  const s=fixture(), b=JSON.stringify(s);
  const review=core.reviewClockPatch(s,{world_clock:{resolve:['wc-1']}});
  assert.equal(review.safe,true);assert.equal(review.requiresReview,true);
  assert.equal(core.reviewClockPatch(s,{resolve:['wc-1']},{evidenceIds:['m-12']}).requiresReview,true);
  const after=fixture(); after.worldClock.scheduledEvents[0].status='resolved';
  assert.deepEqual(core.compare(s,after),[{code:'missing-completion-evidence',severity:'review',eventId:'wc-1'}]);
  assert.equal(JSON.stringify(s),b);
});

test('world event evidence requires a signed visible quote and current actor knowledge', () => {
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/episodic-memory-core.js'),'utf8'),context);
  const memory = context.window.BAOEpisodicMemory;
  const label = '港口交貨';
  const history = Array.from({length:240},(_,i) => ({id:`m${i}`,role:i%2 ? 'assistant' : 'user',content:`第 ${i} 則原文。`}));
  const source = {id:'m65', role:'assistant', content:`商人把牌子翻到正面。\n${label}`};
  history[65] = source;
  const evidence = [{id:source.id,signature:memory.signature(source)}];
  const knowledge = actor => ({actor, mode:'told', claim:label, evidence});
  const event = {id:'episode-port', text:label, evidence, visibility:'restricted', certainty:'confirmed', knowledge:[knowledge('沈霧')]};
  const state = {npcs:[{name:'沈霧',aliases:['阿霧'],presence:'present'},{name:'林雪',presence:'present'}],episodicMemory:{events:[event]}};
  const get = (messages=history) => memory.worldEventEvidence({state,messages,config:{narrativeMode:'world'},labels:[label]}).get(label);
  assert.equal(get(),undefined);
  event.knowledge.push(knowledge('林雪'));
  assert.equal(get()[0].index,65);
  assert.equal(get()[0].signature,evidence[0].signature);
  event.knowledge.push({...knowledge('阿霧'),mode:'rumor'});
  assert.equal(get(),undefined);
  event.knowledge.pop();
  state.npcs.push({name:'另一位沈霧',aliases:['沈霧'],presence:'present'});
  assert.equal(get(),undefined);
  event.visibility='public';
  assert.equal(get()[0].id,'m65');
  assert.equal(get([...history,source]),undefined);
  assert.equal(get(history.slice(0,65)),undefined);
  const edited = history.slice(); edited[65] = {...source,content:'港口交貨只是傳聞'};
  assert.equal(get(edited),undefined);
  const hidden = {...source,content:`<think>\n${label}\n</think>`};
  evidence[0].signature = memory.signature(hidden); edited[65] = hidden;
  assert.equal(get(edited),undefined);
  const quoted = {...source,content:`他打算${label}。`};
  evidence[0].signature = memory.signature(quoted); edited[65] = quoted;
  assert.equal(get(edited),undefined);
  evidence[0].signature = memory.signature(source);
  state.episodicMemory.events.push({id:'retraction',certainty:'retracted',supersedes:[event.id],evidence:[{id:'m100',signature:memory.signature(history[100])}]});
  assert.equal(get(),undefined);
});
test('backward time and re-opening terminal event are contradictions', () => {
  const before=fixture(); before.worldClock.scheduledEvents[2].status='resolved';
  const after=JSON.parse(JSON.stringify(before)); after.worldClock.tickMinutes=72;
  after.worldClock.scheduledEvents[2].status='pending';
  assert.deepEqual(core.compare(before,after).map(x=>x.code),['clock-regression','closed-event-reopened']);
});
test('missing pending events require review; trimmed closed history does not', () => {
  const before=fixture(); const after=fixture();
  after.worldClock.scheduledEvents=after.worldClock.scheduledEvents.filter(x=>x.id==='wc-3');
  assert.deepEqual(core.compare(before,after).map(x=>x.eventId),['wc-1','wc-2']);
});
