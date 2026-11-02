'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(process.env.EPISODIC_CORE_SOURCE || 'js/episodic-memory-core.js','utf8'),context);
const core = context.window.BAOEpisodicMemory;
const source = [
  {id:'origin',role:'assistant',content:'艾琳誤以為戒指被偷。'},
  {id:'later',role:'assistant',content:'守衛告訴艾琳：戒指在抽屜裡。'}
];
const episode = {text:'戒指失竊傳聞。',entities:['艾琳'],keywords:['戒指'],evidenceIds:['origin'],certainty:'rumor',visibility:'restricted',knowledge:[
  {actor:'艾琳',mode:'rumor',claim:'艾琳相信戒指被偷。',evidenceIds:['origin']}
]};
const state = {npcs:[{name:'艾琳',aliases:['琳']}]};
core.ingest(state,{episodes:[episode]},source.slice(0,1),source);
const id = state.episodicMemory.events[0].id;
const update = {eventId:id,actor:'琳',mode:'told',claim:'艾琳知道戒指在抽屜裡。',evidenceIds:['later']};
const prior = JSON.stringify(state.episodicMemory), priorObject = state.episodicMemory;
core.ingest(state,{knowledgeUpdates:[update]},source.slice(1),source);
assert.equal(JSON.stringify(priorObject),prior,'ingest must not mutate a retained snapshot');
const query = (messages=source,actors=['艾琳'],target=state) => core.recall({state:target,messages,actors,input:'戒指'});
assert.match(query()[0].block,/抽屜/);
core.ingest(state,{episodes:[episode]},source.slice(0,1),source);
assert.match(query()[0].block,/抽屜/,'replaying original extraction preserves later knowledge');
assert.equal(state.episodicMemory.events[0].knowledge.length,2);
assert.match(query(source.slice(0,1))[0].block,/被偷/,'rollback retains earlier belief only');
const restored = JSON.parse(JSON.stringify(state));
assert.match(query(source,['琳'],restored)[0].block,/抽屜/,'portable JSON reload preserves aliases and dated knowledge');
const matrix = core.knowledgeMatrix({state:restored,messages:source});
assert.equal(matrix[0].knowledge.length,2,'player inspector retains each source label for explicit source review');
assert.equal(matrix[0].knowledge.find(k=>k.actor==='琳').mode,'told');
const reordered = [source[1],source[0]];
assert.match(query(reordered)[0].block,/被偷/,'reordered history cannot know a later event before it occurs');
assert.equal(core.knowledgeMatrix({state,messages:reordered})[0].knowledge[0].mode,'rumor');
for (const duplicate of [source[0],{...source[0],content:'different branch'}]) {
  const ambiguous = [...source,duplicate];
  assert.equal(query(ambiguous).length,0,'duplicate IDs cannot authorize evidence');
  assert.equal(core.knowledgeMatrix({state,messages:ambiguous}).length,0);
  assert.equal(core.updateContext(state,ambiguous).length,0);
  const rejected = {};
  core.ingest(rejected,{episodes:[episode]},ambiguous,ambiguous);
  assert.equal(rejected.episodicMemory.events.length,0,'duplicate sources rejected at ingestion too');
}
assert.equal(core.updateContext(state,[]).length,0,'rolled-back event cannot enter extraction event index');
assert.equal(query(source,['艾琳',...Array.from({length:30},()=> '陌生人')]).length,0,'overflow must not truncate away an unauthorized speaker');
assert.equal(core.canRead({knowledge_scope:'actors',known_by:['艾琳']},[...Array(30).fill('艾琳'),'陌生人'],state),false);
const invalidUpdateState = JSON.parse(prior);
const holder = {episodicMemory:invalidUpdateState};
core.ingest(holder,{knowledgeUpdates:[update]},[source[1]],reordered);
assert.equal(holder.episodicMemory.events[0].knowledge.length,1,'full-history ingest rejects knowledge before origin');
const changed = [{...source[0],content:'原文已改寫。'},source[1]];
core.ingest(restored,{episodes:[episode]},changed.slice(0,1),changed);
assert.doesNotMatch(query(changed,['艾琳'],restored)[0].block,/抽屜/,'new origin proof cannot inherit old later observations');
// A public correction removes the objective claim, but does not rewrite an
// absent character's explicitly evidenced earlier belief.
const publicState = {};
core.ingest(publicState,{episodes:[{...episode,visibility:'public',certainty:'confirmed'}]},source.slice(0,1),source);
const publicId = publicState.episodicMemory.events[0].id;
core.ingest(publicState,{episodes:[{text:'戒指一直在抽屜。',evidenceIds:['later'],visibility:'public',certainty:'confirmed',supersedes:[publicId],knowledge:[]}]},source,source);
const corrected = core.recall({state:publicState,messages:source,actors:[],input:'戒指'});
assert.equal(corrected.length,1);
assert.match(corrected[0].block,/一直在抽屜/);
const beliefs = core.recall({state:publicState,messages:source,actors:['艾琳'],input:'戒指'});
assert.ok(beliefs.some(item=>/角色認知[\s\S]*rumor.*被偷/.test(item.block)),'correction does not grant omniscient knowledge');
assert.ok(beliefs.every(item=>!/公開事實：戒指失竊傳聞/.test(item.block)));
console.log('P2: unique evidence, replay, snapshot isolation, chronology, aliases, rollback/reload, audience and correction beliefs passed');
