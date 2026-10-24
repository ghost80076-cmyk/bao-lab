'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
let fail = false, calls = 0;
const c = {console,structuredClone,Date,
  Storage:{clone:structuredClone,scrubSecrets:structuredClone},
  document:{getElementById:()=>null,querySelector:()=>null},
  App:{config:{},activeCharacter:{id:'test'},saveStory(){},buildSystemPrompt:()=> 'BASE',
    wrapBuildMessages(id,fn){const next=this.buildMessages.bind(this);this.buildMessages=(...args)=>fn.call(this,next,...args);},
    async buildMessages(config,request={}){
      c.BAOContextInspector?.record('世界書',[{id:'dynamic',reason:'included'}]);
      return [{role:'system',content:'SYSTEM'},...(request.contextMessages || c.Chat.messages)];
    }},
  Chat:{messages:[{id:'u1',role:'user',content:'QUERY'},{id:'a1',role:'assistant',content:'OLD',revisionBase:{state:{location:'before'}}}],
    add(role,content){this.messages.push({id:'new',role,content});},reset(){this.messages=[];}},
  GameState:{current:{location:'after'}}
};
c.window=c;vm.createContext(c);
const load=name=>vm.runInContext(fs.readFileSync(`js/${name}.js`,'utf8'),c,{filename:name});
load('api');vm.runInContext('window.API=API',c);
c.API.send=async(config,messages)=>{calls++;assert.ok(messages.some(m=>m.content==='SYSTEM'),'capture uses the rebuilt request');if(fail)throw Error('provider failed');return{text:'NEW',usage:{input_tokens:100}};};
load('story-revision-state');load('context-efficiency-core');load('context-inspector');
c.App.wrapSendMessage=()=>{};load('request-ledger');
const seen=[];c.BAOSettingsEffects={capture(messages,{kind}){seen.push(kind);return[{id:'test',value:kind}];}};
const tool=kind=>({model:'mock',key:'PRIVATE',__storyTool:true,__storyRevision:kind,__storyRevisionToken:{}});
const input=[{role:'system',content:'LEGACY'},{role:'user',content:'QUERY'}];
(async()=>{
  const originalState=c.GameState.current,identity=c.BAOStoryRevisionState.contextIdentity();
  const regenerate=tool('regenerate');
  await c.API.send(regenerate,input);
  assert.notEqual(c.GameState.current,originalState,'revision really replaced the state while rewinding');
  assert.equal(c.BAOStoryRevisionState.contextIdentity(),identity,'internal rewind keeps diagnostic ownership');
  let snap=c.BAOContextInspector.snapshot();
  assert.equal(snap.kind,'regenerate');assert.equal(snap.status,'success');assert.equal(snap.layers['世界書'][0].id,'dynamic');
  assert.equal(snap.efficiency.deltaChars,null,'revision does not compare to normal-send baseline');
  assert.equal(c.BAORequestLedger.snapshot().calls[0].kind,'regenerate');
  const reply=c.Chat.messages.at(-1);reply.content='NEW';
  assert.equal(c.BAORequestLedger.snapshot(),null);
  c.BAORequestLedger.commitRevision(reply,{});assert.equal(c.BAORequestLedger.snapshot(),null);
  c.BAORequestLedger.commitRevision(reply,regenerate.__storyRevisionToken);
  assert.equal(c.BAORequestLedger.snapshot().calls[0].kind,'regenerate','ledger follows only the committed revision');
  assert.equal(c.BAOContextInspector.snapshot(),null,'uncommitted source changes invalidate the old anchors');
  c.BAOContextInspector.commitRevision(reply,{});assert.equal(c.BAOContextInspector.snapshot(),null,'another request cannot commit this capture');
  c.BAOContextInspector.commitRevision(reply,regenerate.__storyRevisionToken);
  assert.equal(c.BAOContextInspector.snapshot().kind,'regenerate','committed replacement remains inspectable');
  c.BAOStoryRevisionState.applySnapshot({state:{location:'reconciled'}});
  assert.ok(c.BAOContextInspector.snapshot(),'post-revision state reconciliation keeps evidence');
  reply.content='OLD';assert.equal(c.BAORequestLedger.snapshot(),null);
  c.BAORequestLedger.commitRevision(reply,regenerate.__storyRevisionToken);assert.equal(c.BAORequestLedger.snapshot(),null,'ledger cannot rebind twice');
  assert.equal(c.BAOContextInspector.snapshot(),null,'variant switch must invalidate evidence');
  c.BAOContextInspector.commitRevision(reply,regenerate.__storyRevisionToken);assert.equal(c.BAOContextInspector.snapshot(),null,'commit cannot rebind a second time');
  reply.content='NEW';assert.ok(c.BAOContextInspector.snapshot());

  const rewrite=tool('rewrite');
  await c.API.send(rewrite,input);
  assert.equal(c.BAOContextInspector.snapshot().kind,'rewrite');
  c.Chat.messages[0].content='OTHER_BRANCH';reply.content='REWRITE';c.BAOContextInspector.commitRevision(reply,rewrite.__storyRevisionToken);
  assert.equal(c.BAOContextInspector.snapshot(),null,'a changed prefix cannot be rebound');
  c.Chat.messages[0].content='QUERY';reply.content='NEW';
  fail=true;await assert.rejects(c.API.send(tool('rewrite'),input),/provider failed/);fail=false;
  assert.equal(c.BAOContextInspector.snapshot().status,'failed','failed revision retains original anchors and evidence');
  reply.content='FAKE';c.BAOContextInspector.commitRevision(reply,rewrite.__storyRevisionToken);assert.equal(c.BAOContextInspector.snapshot(),null,'failed requests cannot commit');reply.content='NEW';

  const before=JSON.stringify(c.BAOContextInspector.snapshot());
  // Helpers bypass both rebuilding and capture; a mock terminal needs no rebuilt system.
  c.API.wrapSend('test:helper',async(next,config,messages)=>next(config,messages));
  for(const config of [{__storyTool:true,__inspirationTask:true},{__storyTool:true},{__stateTask:true},{__memoryTask:true},{__auxiliaryTask:true},{__connectionTest:true}]){
    await c.API.send(config,[{role:'system',content:'SYSTEM'}]);
    assert.equal(JSON.stringify(c.BAOContextInspector.snapshot()),before,'helpers do not overwrite revision evidence');
  }
  assert.deepEqual(seen,['regenerate','rewrite','rewrite']);
  assert.doesNotMatch(before,/PRIVATE/);
  c.GameState.current=structuredClone(c.GameState.current);assert.equal(c.BAOContextInspector.snapshot(),null,'external restores start a new diagnostic identity');
  await c.API.send(tool('regenerate'),input);c.Chat.reset();assert.equal(c.BAOContextInspector.snapshot(),null);
  assert.equal(calls,10,'diagnostics add no calls');
  console.log('PASS rebuilt revision evidence, rewind lineage, committed variants, source isolation, helper exclusion, failures and reset');
})().catch(error=>{console.error(error);process.exitCode=1;});
