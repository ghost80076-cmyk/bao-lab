'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../js/chapter-memory-core.js');
const ctx = {console, structuredClone};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../js/episodic-memory-core.js'),'utf8'),ctx);
const resolver = ctx.BAOEpisodicMemory;
const state = {npcs:[
  {npc_id:'erin',name:'艾琳',aliases:['琳'],presence:'present'},
  {npc_id:'guard',name:'守衛',presence:'away'}
]};
const story = rounds => {
  const result = [];
  for (let i=1;i<=rounds;i++) {
    result.push({id:'u-'+i,role:'user',content:'玩家在港口查看舊信與承諾。'.repeat(2)},
      {id:'a-'+i,role:'assistant',content:'艾琳聽完後決定暫時保密，並非所有角色都知道。'.repeat(3)});
  }
  return result;
};
const messages = story(100);
const first = core.createDraft({messages,start:0,end:40,text:'港口的舊信仍未解開，艾琳遵守與玩家的保密約定。',
  keywords:['舊信','港口','承諾']});
assert.equal(first.approved,false);
assert.equal(first.knowledge_scope,'pending');
assert.equal(core.check(first,messages).ok,false,'draft is never readable');
assert.throws(() => core.upsert({},first,messages),/未核准/);
assert.throws(()=>core.approve(first,{messages}),/確認知情範圍/);
const shared=core.approve(first,{messages,knowledge_scope:'shared'});
assert.equal(core.check(shared,messages).ok,true);
assert.ok(!JSON.stringify(shared).includes('玩家在港口查看'),'only summary and proof, never raw source text');
let archive=core.upsert({},shared,messages);
assert.deepEqual(archive.chapters.map(ch=>ch.id),[shared.id]);
const same=core.upsert(archive,shared,messages);
assert.equal(same.chapters.length,1,'idempotent ingestion must not duplicate source ranges');
assert.equal(core.recall({archive,messages,query:'港口舊信',state,config:{narrativeMode:'world'},resolver}).selected.length,1);
assert.equal(core.recall({archive,messages,query:'今天天氣',state,config:{narrativeMode:'immersive'},primary:'艾琳',resolver}).selected.length,0);

const privateDraft=core.createDraft({messages,start:40,end:80,
  text:'艾琳從此得知一段只有她能辨認的秘密暗號。',keywords:['秘密','暗號']});
assert.throws(()=>core.approve(privateDraft,{messages,knowledge_scope:'actors'}),/知情名單/);
assert.throws(()=>core.approve(privateDraft,{messages,knowledge_scope:'shared',known_by:['艾琳']}),/不可同時/);
const privateEntry=core.approve(privateDraft,{messages,knowledge_scope:'actors',known_by:['琳'],state,resolver});
assert.deepEqual(privateEntry.known_by,['艾琳']);
archive=core.upsert(archive,privateEntry,messages);
assert.equal(core.recall({archive,messages,query:'秘密暗號',state:{...state,npcs:state.npcs.map(n=>({...n,presence:n.name==='守衛'?'present':'away'}))},config:{narrativeMode:'world'},resolver}).selected.length,0,
  'private chapter cannot become shared knowledge');
assert.equal(core.recall({archive,messages,query:'秘密暗號',state:{...state,npcs:state.npcs.map(n=>({...n,presence:'present'}))},config:{narrativeMode:'immersive'},primary:'艾琳',resolver}).selected.length,0,
  'mixed cast must not inherit private chapter');
assert.deepEqual(core.recall({archive,messages,query:'秘密暗號',state,config:{narrativeMode:'immersive'},primary:'艾琳',resolver}).selected.map(e=>e.id),[privateEntry.id]);
assert.equal(core.recall({archive,messages,query:'秘密暗號',state,config:{narrativeMode:'immersive'},primary:'艾琳'}).selected.length,0,
  'missing knowledge resolver must fail closed');
const ambiguous={npcs:[
  {name:'甲',aliases:['姐']}, {name:'乙',aliases:['姐']}
]};
assert.throws(()=>core.approve(privateDraft,{messages,knowledge_scope:'actors',known_by:['姐'],state:ambiguous,resolver}),
  /歧義/);
const excludedDraft=core.createDraft({messages,start:80,end:120,
  text:'這段章節應禁止作為角色可見的記憶。',keywords:['排除']});
const excluded=core.approve(excludedDraft,{messages,knowledge_scope:'exclude'});
archive=core.upsert(archive,excluded,messages);
assert.equal(core.recall({archive,messages,query:'排除',state,config:{narrativeMode:'immersive'},primary:'艾琳',resolver}).selected.length,0);
assert.throws(()=>core.upsert(archive,core.approve(core.createDraft({messages,start:20,end:60,text:'重疊的章節摘要。',keywords:['重疊']}),{messages,knowledge_scope:'shared'}),messages),/重疊/);

const rewritten=messages.map((m,i)=>i===11?{...m,content:m.content+'已改寫'}:m);
assert.equal(core.check(shared,rewritten).ok,false,'source edits invalidate archive');
assert.equal(core.recall({archive,messages:rewritten,query:'港口舊信',state,resolver}).selected.length,0);
assert.ok(core.audit(archive,rewritten).some(x=>!x.ok),'stale chapter is not silently deleted');
const reordered=messages.slice();[reordered[2],reordered[3]]=[reordered[3],reordered[2]];
assert.equal(core.check(shared,reordered).ok,false);
const rewound=messages.slice(0,38);
assert.equal(core.check(shared,rewound).ok,false,'source outside rewind cannot be recalled');
const duplicate=messages.map(m=>({...m}));duplicate[90].id=duplicate[0].id;
assert.equal(core.check(shared,duplicate).ok,false,'ambiguous source IDs block cross-branch replay');
const tampered={...shared,text:'這是未核准的新主張。'};
assert.equal(core.check(tampered,messages).ok,false,'mutating approved content invalidates approval stamp');
assert.equal(core.recall({archive:{chapters:[tampered]},messages,query:'新主張',state,resolver}).selected.length,0);
assert.equal(core.recall({archive,messages,query:'港口舊信',maxChars:200}).selected.length,1);
assert.equal(core.recall({archive,messages,query:'港口舊信',maxChars:200}).text.includes('玩家在港口查看'),false);

for(const rounds of [100,500,1000]) {
  const many=story(rounds);
  let next={version:core.VERSION,chapters:[]};
  for(let at=0;at<(rounds-20)*2;at+=40) {
    const candidate=core.createDraft({messages:many,start:at,end:at+40,
      text:'港口舊信待查證，關係與知情不可由摘要推定。',keywords:['港口','舊信']});
    next=core.upsert(next,core.approve(candidate,{messages:many,knowledge_scope:'shared'}),many);
  }
  assert.equal(next.chapters.length,(rounds-20)/20);
  const raw=JSON.stringify(many), indexed=JSON.stringify(next);
  const matching=core.recall({archive:next,messages:many,query:'港口舊信',maxEntries:2,state,resolver});
  assert.equal(matching.selected.length,2,'bounded selection cannot inject every chapter');
  assert.ok(indexed.length<raw.length,'index does not store full roleplay transcripts');
  assert.equal(core.audit(next,many).every(x=>x.ok),true);
}
console.log('PASS source-bound chapter draft/approval, private permissions, invalidation, 100/500/1000-turn bounded local recall');
