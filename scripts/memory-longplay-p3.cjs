'use strict';
// Research-only comparison of the actual event recall wrapper against a pinned
// pre-P2 core. No model calls, player data, persistent writes or new runtime deps.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const [baselineDir,reportPath]=process.argv.slice(2);
if(!baselineDir||!reportPath)throw Error('usage: node scripts/memory-longplay-p3.cjs <pinned-baseline-directory> <report.json>');
const read=(p)=>fs.readFileSync(p,'utf8');
const current={core:read(path.join(root,'js/episodic-memory-core.js')),wrapper:read(path.join(root,'js/episodic-memory.js'))};
const before={core:read(path.join(baselineDir,'episodic-memory-core.js')),wrapper:read(path.join(baselineDir,'episodic-memory.js'))};
const memoryCore=read(path.join(root,'js/memory-core.js'));
const clone=x=>JSON.parse(JSON.stringify(x));
const bytes=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
const sha=x=>createHash('sha256').update(x).digest('hex');
const specs=[
 {kind:'context',topic:'通行證',target:'港口倉庫 通行證 留在櫃台',input:'那張通行證呢？',prior:'港口倉庫在哪裡？',others:['城門旅館','山頂商店','廣場辦公','河邊小屋','北區公園']},
 {kind:'actor',topic:'工作證',target:'林岑 工作證 留在櫃台',input:'阿岑 工作證',prior:'繼續今天的工作。',others:['小夏','小雪','明遠','小林','小周']},
 {kind:'update',topic:'預約單',target:'北區診所 預約單 放在櫃台',origin:'北區診所 預約單 放在房內',input:'預約單',prior:'繼續今天的安排。',others:['城門旅館','山頂商店','廣場辦公','河邊小屋','東區公園']}
];
function context(version) {
 const stats={calls:0};
 const reject=()=>{stats.calls++;throw Error('No external model or network allowed')};
 const ctx={console,structuredClone,API:{send:reject},fetch:reject};
 ctx.window=ctx;vm.createContext(ctx);
 vm.runInContext(version.core,ctx);vm.runInContext(memoryCore,ctx);
 return {ctx,stats,core:ctx.BAOEpisodicMemory};
}
function seed(spec,rounds,entries){
 assert.ok(rounds>=100&&entries>=6&&entries<rounds-10);
 const {core}=context(current);
 const state={npcs:spec.kind==='actor'?[{npc_id:'actor-a',name:'林岑',aliases:['阿岑'],presence:'away'},...spec.others.map((name,i)=>({npc_id:'other-'+i,name,presence:'away'}))]:[]};
 const messages=[];
 for(let i=0;i<rounds;i++){
  messages.push({id:'u'+i,role:'user',content:'第'+i+'輪，繼續日常安排。'+'一般行程照常進行。'.repeat(8)},
   {id:'a'+i,role:'assistant',content:'第'+i+'輪，已完成當日例行記錄。'+'當前情況保持不變，沒有新增其他資訊。'.repeat(18)});
 }
 messages[1].content=spec.origin||spec.target;
 messages[3].content=spec.kind==='update'?spec.target:'已核對原先紀錄。';
 const isPrivate=spec.kind==='update';
 const event=m=>({text:m.content,evidenceIds:[m.id],visibility:isPrivate?'restricted':'public',certainty:'confirmed',knowledge:isPrivate?[{actor:'艾琳',mode:'witnessed',claim:m.content,evidenceIds:[m.id]}]:[]});
 core.ingest(state,{episodes:[event(messages[1])]},messages.slice(0,2),messages);
 const targetId=state.episodicMemory.events[0].id;
 if(isPrivate)core.ingest(state,{knowledgeUpdates:[{eventId:targetId,actor:'艾琳',mode:'told',claim:spec.target,evidenceIds:['a1']}]},messages.slice(2,4),messages);
 const batch=[];
 for(let i=0;i<entries-1;i++){
  const m=messages[(i+2)*2+1];
  m.content=i<5?spec.others[i]+' '+spec.topic+(spec.kind==='update'?' 放在櫃台':' 留在櫃台'):'例行記錄編號 '+i+' 完成巡查';
  batch.push(m);
 }
 for(let i=0;i<batch.length;i+=12){const chunk=batch.slice(i,i+12);core.ingest(state,{episodes:chunk.map(event)},chunk,messages)}
 messages.at(-2).content=spec.prior;messages.at(-1).content='可以接著詢問。';
 const retained=state.episodicMemory.events.some(e=>e.id===targetId);
 assert.equal(state.episodicMemory.events.length,Math.min(entries,1000));
 assert.equal(retained,entries<=1000);
 return {state,messages,targetId,retained};
}
function percentile(values,p){const s=values.slice().sort((a,b)=>a-b);return Number(s[Math.max(0,Math.ceil(s.length*p)-1)].toFixed(3))}
async function run(version,seeded,spec,mode,variant='main',repeats=1){
 const {ctx,stats}=context(version);
 const state=clone(seeded.state);
 let source=clone(seeded.messages);
 let input=spec.input, primary=spec.kind==='update'?'艾琳':'港城故事';
 if(variant==='unrelated')input='金融利率';
 if(variant==='direct')input=spec.target.split(' ').slice(0,2).join(' ');
 if(variant==='edited')source[1].content='已改寫原始來源。';
 if(variant==='unauthorized')primary='守衛';
 if(variant==='rewind-update')source=source.filter(m=>m.id!=='a1');
 if(variant==='no-continuity')source.at(-2).content='今天的其他工作。';
 const user={id:'query',role:'user',content:input};source.push(user);
 const config={narrativeMode:'immersive',memory:{mode:mode==='full'?'full':'smart',hybridRecall:mode!=='default',episodicRecall:mode!=='off'}};
 const raw=source.slice(-9).map(({role,content})=>({role,content}));
 const base=[{role:'system',content:'FIXED_PREFIX'},{role:'system',content:'合成摘要：例行工作。'},...raw];
 ctx.Chat={messages:source};ctx.GameState={current:state};
 ctx.App={config,activeCharacter:{name:primary},async buildMessages(){return base;},wrapBuildMessages(id,fn){const next=this.buildMessages.bind(this);this.buildMessages=(...args)=>fn.call(this,next,...args)}};
 vm.runInContext(version.wrapper,ctx);
 const initial=JSON.stringify(state),rawBefore=JSON.stringify(source);
 let output=await ctx.App.buildMessages(config); // warm-up, excluded from timings
 const expectedOutput=JSON.stringify(output),times=[];
 for(let i=0;i<repeats;i++){
  const t=performance.now();output=await ctx.App.buildMessages(config);times.push(performance.now()-t);
  assert.equal(JSON.stringify(output),expectedOutput,'deterministic recall output');
 }
 assert.equal(JSON.stringify(state),initial);assert.equal(JSON.stringify(source),rawBefore);
 assert.equal(stats.calls,0);assert.equal(JSON.stringify(output.slice(0,-1)),JSON.stringify(base.slice(0,-1)));
 const last=output.at(-1).content;assert.ok(last.endsWith(input));
 const prefix=last===input?'':last.slice(0,-input.length);
 const blocks=[...prefix.matchAll(/〔([^｜〕]+)[^〕]*〕\n([\s\S]*?)(?=\n\n〔|$)/g)];
 const ids=blocks.map(m=>m[1]),sourceIds=new Set(source.map(m=>m.id));
 assert.ok(ids.length<=4);
 assert.ok(blocks.reduce((n,m)=>n+m[0].trimEnd().length,0)<=2400);
 for(const block of blocks){const refs=block[2].match(/來源：([^\n]*)/)?.[1].split('、')||[];assert.ok(refs.length&&refs.every(id=>sourceIds.has(id)),'all emitted refs exist in this source')}
 if(variant==='edited'||variant==='unauthorized'||variant==='rewind-update')assert.ok(!ids.includes(seeded.targetId),'invalid/unknown target not recalled');
 if(variant==='unrelated'||mode==='off'||mode==='full')assert.equal(ids.length,0,'no unrelated/disabled/full recall');
 const target=blocks.find(m=>m[1]===seeded.targetId);
 if(target&&spec.kind==='update'){assert.ok(target[0].includes('來源：a1'));assert.ok(!target[0].includes('放在房內'))}
 if(target&&spec.kind!=='update')assert.ok(target[0].includes('來源：a0'));
 return {targetRank:ids.includes(seeded.targetId)?ids.indexOf(seeded.targetId)+1:null,selected:ids.length,
  otherSelected:ids.filter(id=>id!==seeded.targetId).length,
  addedBytes:bytes(output)-bytes(base),addedTokensEstimate:ctx.BAOMemoryCore.tokens(output)-ctx.BAOMemoryCore.tokens(base),
  latencyMs:{p50:percentile(times,.5),p95:percentile(times,.95),samples:times.length},modelCalls:stats.calls};
}
(async()=>{
 const rows=[],controls=[];
 for(const [rounds,entries] of [[100,60],[1000,600],[5000,1000]]){
  for(const spec of specs){
   const s=seed(spec,rounds,entries);
   const old=await run(before,s,spec,'hybrid','main',12),now=await run(current,s,spec,'hybrid','main',12);
   assert.equal(now.targetRank,1,spec.kind+' current targeted ranking');
   assert.equal(old.targetRank,null,spec.kind+' pre-P2 distractor baseline');
   assert.ok(now.otherSelected<=old.otherSelected);
   rows.push({kind:spec.kind,rounds,events:s.state.episodicMemory.events.length,indexBytes:bytes(s.state.episodicMemory),historyBytes:bytes(s.messages),before:old,after:now});
   const variants=['unrelated','direct','edited',...(spec.kind==='update'?['unauthorized','rewind-update']:spec.kind==='context'?['no-continuity']:[])];
   for(const variant of variants){const result=await run(current,s,spec,'hybrid',variant);
    if(variant==='direct')assert.ok(result.targetRank,'literal recall survives');
    if(variant==='no-continuity')assert.equal(result.targetRank,null);
    controls.push({kind:spec.kind,rounds,variant,...result});
   }
   for(const mode of ['default','off','full']){
    const oldControl=await run(before,s,spec,mode),result=await run(current,s,spec,mode);
    for(const key of ['targetRank','selected','otherSelected','addedBytes','addedTokensEstimate','modelCalls'])assert.equal(result[key],oldControl[key],mode+' stable behavior');
    controls.push({kind:spec.kind,rounds,variant:mode,...result});
   }
  }
 }
 const cap=seed(specs[0],5000,1001);
 const capResult=await run(current,cap,specs[0],'hybrid');
 assert.equal(cap.retained,false);assert.equal(capResult.targetRank,null);
 const report={scope:'synthetic indexed event recall; actual wrapper, stub base prompt; no LLM extraction/generation, browser, provider billing or full story pipeline',baselineCommit:'ae6d305e14d250a15c80e8eabe5d281186b6da2b',sourceHashes:{beforeCore:sha(before.core),beforeWrapper:sha(before.wrapper),afterCore:sha(current.core),afterWrapper:sha(current.wrapper)},runtime:{node:process.version,platform:process.platform,arch:process.arch},rows,controls,capacity:{rounds:5000,attemptedEvents:1001,retainedEvents:cap.state.episodicMemory.events.length,targetRetained:cap.retained,...capResult},providerTokens:null,providerCost:null};
 fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({scope:report.scope,rows,controlCount:controls.length,capacity:report.capacity}));
})().catch(e=>{console.error(e);process.exitCode=1});
