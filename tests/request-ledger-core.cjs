'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const requests=[],input={value:'PRIVATE_DRAFT'};
let responder=()=>new Response(JSON.stringify({choices:[{message:{content:'PRIVATE_RESPONSE'}}],content:[{type:'text',text:'PRIVATE_RESPONSE'}],candidates:[{content:{parts:[{text:'PRIVATE_RESPONSE'}]}}],usage:{prompt_tokens:7,completion_tokens:3}}));
const c={console,Date,structuredClone,URL,Response,AbortController,TextDecoder,TextEncoder,setTimeout,clearTimeout,
  document:{getElementById:id=>id==='user-input'?input:null},
  GameState:{current:{}},Chat:{messages:[],reset(){this.messages=[];},async maybeSummarize(){}},
  App:{config:{api:{}},activeCharacter:{id:'test'},escapeHTML:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
    async sendMessage(){return c.API.send(c.App.config.api,[{role:'user',content:'PRIVATE_PROMPT'}]);},
    wrapSendMessage(id,fn){const next=this.sendMessage.bind(this);this.sendMessage=(...args)=>fn.call(this,next,...args);}},
  fetch:async(url,options)=>{requests.push({url,body:options.body,headers:options.headers});return responder(url,options);}};
c.window=c;vm.createContext(c);
const load=name=>vm.runInContext(fs.readFileSync(`js/${name}.js`,'utf8')+(name==='api'?';window.API=API;':''),c,{filename:name});
load('api');c.API.waitForRetry=async()=>{};
const config=protocol=>({model:'audit',type:protocol,protocol,key:'PRIVATE_KEY',baseUrl:'https://private-endpoint.invalid/v1',retryEnabled:false});
const messages=[{role:'system',content:'PRIVATE_SYSTEM'},{role:'user',content:'PRIVATE_PROMPT'}];
(async()=>{
  const before=[];
  for(const protocol of ['openai','anthropic','gemini']){await c.API.send(config(protocol),messages);before.push(requests.at(-1).body);}
  load('request-ledger');load('request-ledger');
  for(const [index,protocol] of ['openai','anthropic','gemini'].entries()){
    const original=JSON.stringify(config(protocol));await c.API.send(config(protocol),messages);
    assert.equal(requests.at(-1).body,before[index],'observability preserves exact provider body');
    assert.equal(JSON.stringify(config(protocol)),original);
    const snap=c.BAORequestLedger.snapshot();assert.equal(snap.logicalRequests,1);assert.equal(snap.transportAttempts,1);assert.equal(snap.calls[0].status,'success');
    assert.doesNotMatch(JSON.stringify(snap),/PRIVATE_|private-endpoint|__requestTrace|key|baseUrl|authorization/);
  }
  let attempts=0;const callbacks=[];
  responder=()=>++attempts<3?new Response('{}',{status:503}):new Response(JSON.stringify({choices:[{message:{content:'OK'}}],usage:{prompt_tokens:7,completion_tokens:3}}));
  await c.API.send({...config('openai'),retryEnabled:true,onRetry:e=>callbacks.push(e)},messages);
  let snap=c.BAORequestLedger.snapshot();assert.equal(snap.logicalRequests,1);assert.equal(snap.transportAttempts,3);assert.equal(snap.retries,2);
  assert.deepEqual(Array.from(snap.calls[0].attempts.map(a=>a.httpStatus)),[503,503,200]);assert.equal(callbacks.length,2);
  assert.ok(!requests.at(-1).body.includes('__requestTrace'));
  const html=c.BAORequestLedger.render();assert.match(html,/3 次傳輸嘗試/);assert.match(html,/重試 2 次/);assert.match(html,/費用未回報/);
  snap.calls[0].status='tamper';assert.equal(c.BAORequestLedger.snapshot().calls[0].status,'success');
  c.Chat.messages.push({id:'one',role:'user',content:'private'}); // Appended future turns preserve old source, until a new scope is opened.
  await c.API.send(config('openai'),messages);c.Chat.messages[0].content='edited';assert.equal(c.BAORequestLedger.snapshot(),null);
  c.Chat.reset();assert.equal(c.BAORequestLedger.snapshot(),null);

  // A rejected request is visible even if it never reaches a transport.
  const blocked=new Error('PRIVATE_KEY failure');
  c.API.wrapSend('helper-api-routing:route',async(next,cfg,msgs)=>{if(cfg.__memoryTask)throw blocked;return next(cfg,msgs);});
  await assert.rejects(c.API.send({...config('openai'),__memoryTask:true},messages),e=>e===blocked);
  snap=c.BAORequestLedger.snapshot();assert.equal(snap.calls[0].status,'failed');assert.equal(snap.transportAttempts,0);assert.equal(snap.calls[0].model,'');
  assert.doesNotMatch(JSON.stringify(snap),/PRIVATE_KEY|failure/);
  responder=()=>{throw Object.assign(new Error('PRIVATE_ABORT'),{name:'AbortError'});};
  await assert.rejects(c.API.send(config('openai'),messages));assert.equal(c.BAORequestLedger.snapshot().calls[0].status,'cancelled');
  assert.equal(c.BAORequestLedger.snapshot().retries,0);

  // Streaming callbacks and bytes are unaffected.
  responder=()=>new Response('data: {"choices":[{"delta":{"content":"STREAM"}}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  const deltas=[];const stream=await c.API.send({...config('openai'),stream:true,onDelta:d=>deltas.push(d)},messages);
  assert.equal(stream.text,'STREAM');assert.deepEqual(deltas,['STREAM']);assert.equal(c.BAORequestLedger.snapshot().transportAttempts,1);

  // A late response cannot overwrite a newer story's record or revive reset data.
  let release;responder=()=>new Promise(resolve=>release=resolve);
  const pending=c.API.send(config('openai'),messages);await Promise.resolve();await Promise.resolve();
  c.GameState.current={};responder=()=>new Response(JSON.stringify({choices:[{message:{content:'NEW'}}]}));
  await c.API.send({...config('openai'),__commentaryTask:true,__auxiliaryTask:true},messages);
  const current=JSON.stringify(c.BAORequestLedger.snapshot());release(new Response(JSON.stringify({choices:[{message:{content:'OLD'}}]})));await pending;
  assert.equal(JSON.stringify(c.BAORequestLedger.snapshot()),current);
  c.Chat.reset();assert.equal(c.BAORequestLedger.snapshot(),null);

  // A faulty optional public diagnostic never blocks the original API.
  c.BAORequestLedger={transport(){throw Error('diagnostic');},decision(){throw Error('diagnostic');}};
  c.API.noteRequest('memory','threshold');assert.equal((await c.API.send(config('openai'),messages)).text,'NEW');
  console.log('PASS exact 3-protocol bodies, retry/abort/streaming, pre-transport failure, metadata privacy, immutable snapshots, story/reset isolation and optional failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
