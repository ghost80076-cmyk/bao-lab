'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const fixtureIndex=process.argv.indexOf('--fixture');
const fixture=fixtureIndex<0?'tests/fixtures/recall-acceptance/v3.json':process.argv[fixtureIndex+1];
if(!fixture)throw Error('--fixture needs a path');
const files=['js/episodic-memory-core.js','js/episodic-memory.js',fixture,'scripts/evaluate-episodic-recall.cjs'];
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const suite=JSON.parse(read(files[2]));
const clone=value=>JSON.parse(JSON.stringify(value));
const sameSet=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
async function evaluate(test){
 const story=clone(suite.stories[test.story]), ids=new Map(), state={npcs:test.npcs||[]};
 let calls=0;
 const ctx={console,structuredClone,API:{send(){calls++;throw Error('Evaluation must not call a model');}}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(read(files[0]),ctx);
 const core=ctx.BAOEpisodicMemory;
 for(const batch of story.batches){
  const raw={episodes:(batch.episodes||[]).map(({key,supersedesKeys,...event})=>({visibility:'restricted',certainty:'confirmed',...event,supersedes:(supersedesKeys||[]).map(key=>ids.get(key))})),
   knowledgeUpdates:(batch.knowledgeUpdates||[]).map(({eventKey,...update})=>({...update,eventId:ids.get(eventKey)}))};
  const chunk=story.messages.filter(m=>batch.ids.includes(m.id));
  core.ingest(state,raw,chunk);
  for(const event of batch.episodes||[]){
   const match=state.episodicMemory.events.find(e=>e.text===event.text&&e.evidence[0].id===event.evidenceIds[0]);
   if(!match)throw Error('Fixture event was not ingested: '+event.key);
   ids.set(event.key,match.id);
  }
 }
 let messages=story.messages.filter(m=>!(test.dropIds||[]).includes(m.id)).map(m=>({...m,...test.edits?.[m.id]}));
 for(let i=0;i<(test.fillerMessages||0);i++)messages.push({id:'filler-'+i,role:i%2?'assistant':'user',content:'日常閒談第'+i+'則。'});
 messages.push({id:'query',role:'user',content:test.input});
 ctx.Chat={messages};ctx.GameState={current:test.emptyState?{npcs:state.npcs}:test.roundtrip?clone(state):state};
 const config={narrativeMode:test.narrativeMode||'immersive',memory:{mode:test.memoryMode||'smart',episodicRecall:test.recallEnabled!==false}};
 ctx.App={config,activeCharacter:{name:test.primary||'港城故事'},
  wrapBuildMessages(id,fn){const next=this.buildMessages.bind(this);this.buildMessages=(...args)=>fn.call(this,next,...args);},
  async buildMessages(){return[{role:'system',content:'FIXED_PREFIX'},{role:'system',content:test.existingMemory||'MEMORY_PREFIX'},{role:'user',content:test.input}];}};
 const decisions=[];ctx.BAOContextInspector={record(layer,items){decisions.push(...clone(items));}};
 vm.runInContext(read(files[1]),ctx);
 const before=JSON.stringify(ctx.GameState.current), output=clone(await ctx.App.buildMessages(config));
 const content=output.at(-1).content;
 // Inspect actual emitted blocks, rather than treating an included callback as output.
 const suffix='\n\n'+test.input;
 const recallText=content.endsWith(suffix)?content.slice(0,-suffix.length):'';
 const blocks=[...recallText.matchAll(/〔([^｜〕]+)[^〕]*〕\n([\s\S]*?)(?=\n\n〔|$)/g)];
 const byId=new Map([...ids].map(([key,id])=>[id,key]));
 const actual=blocks.map(m=>byId.get(m[1])||'UNKNOWN:'+m[1]);
 const recalled=blocks.map(m=>m[0]).join('\n\n');
 const budgetChars=blocks.reduce((n,m)=>n+m[0].length,0);
 const missing=test.expected.filter(key=>!actual.includes(key)),unexpected=actual.filter(key=>!test.expected.includes(key));
 const sourceErrors=[];
 for(const block of blocks){
  const key=byId.get(block[1]), expected=test.refs?.[key];
  if(!expected)continue;
  const refs=(block[2].match(/來源：([^\n]*)/)?.[1]||'').split('、').filter(Boolean);
  if(!sameSet(refs,expected))sourceErrors.push({key,expected,actual:refs});
 }
 const forbiddenHits=(test.forbidden||[]).filter(text=>recalled.includes(text));
 const failures=[];
 if(unexpected.length)failures.push('unexpected_recall');
 if(sourceErrors.length)failures.push('wrong_evidence');
 if(forbiddenHits.length)failures.push('forbidden_content');
 if(test.diagnostic){if(!sameSet(missing,test.knownMissing||[]))failures.push('diagnostic_baseline_changed');}
 else if(missing.length)failures.push('missing_recall');
 if(test.ordered&&JSON.stringify(actual)!==JSON.stringify(test.expected))failures.push('ranking');
 if(output[0].content!=='FIXED_PREFIX'||output[1].content!==(test.existingMemory||'MEMORY_PREFIX'))failures.push('prefix_changed');
 if(JSON.stringify(ctx.GameState.current)!==before)failures.push('state_mutated');
 if(calls)failures.push('model_called');
 if(actual.length>4||budgetChars>2400)failures.push('budget_exceeded');
 return{id:test.id,story:test.story,diagnostic:test.diagnostic||null,expected:test.expected,actual,missing,unexpected,sourceErrors,forbiddenHits,
  emittedChars:recalled.length,budgetChars,modelCalls:calls,decisions:decisions.map(d=>({...d,id:byId.get(d.id)||d.id})),failures};
}
function totals(results){
 let tp=0,fp=0,fn=0;
 for(const r of results){tp+=r.actual.filter(k=>r.expected.includes(k)).length;fp+=r.unexpected.length;fn+=r.missing.length;}
 return{cases:results.length,truePositives:tp,falsePositives:fp,falseNegatives:fn,
  precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,
  exactMatches:results.filter(r=>!r.missing.length&&!r.unexpected.length).length,
  sourceErrors:results.reduce((n,r)=>n+r.sourceErrors.length,0),forbiddenContentCases:results.filter(r=>r.forbiddenHits.length).length};
}
(async()=>{
 const results=[];
 for(const test of suite.cases)results.push(await evaluate(test));
 const report={suiteVersion:suite.version,scope:suite.description,
  sourceHashes:Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(read(file)).digest('hex')])),
  all:totals(results),supported:totals(results.filter(r=>!r.diagnostic)),diagnostic:totals(results.filter(r=>r.diagnostic)),
  failedCases:results.filter(r=>r.failures.length).length,modelCalls:results.reduce((n,r)=>n+r.modelCalls,0),results};
 const i=process.argv.indexOf('--report');
 if(i>=0){const target=process.argv[i+1];if(!target)throw Error('--report needs a path');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({all:report.all,supported:report.supported,diagnostic:report.diagnostic,failedCases:report.failedCases,modelCalls:report.modelCalls}));
 for(const result of results.filter(r=>r.failures.length))console.log(JSON.stringify({id:result.id,missing:result.missing,unexpected:result.unexpected,sourceErrors:result.sourceErrors,failures:result.failures}));
 if(report.failedCases)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
