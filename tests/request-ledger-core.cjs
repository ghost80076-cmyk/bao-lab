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
  const safeRating={category:'HARM_CATEGORY_HARASSMENT',probability:'HIGH',blocked:true};
  const unsafeRating={...safeRating,source:'PRIVATE_PROMPT'};
  responder=()=>new Response(JSON.stringify({
    promptFeedback:{blockReason:'PROHIBITED_CONTENT',safetyRatings:[unsafeRating]},
    usageMetadata:{promptTokenCount:31123}
  }));
  await c.API.send({...config('gemini'),__memoryTask:true,__memoryTaskKind:'context-pack'},messages);
  let diagnostic=c.BAORequestLedger.snapshot().calls[0];
  assert.equal(diagnostic.task,'context-pack');
  assert.equal(diagnostic.provider,'gemini');
  assert.equal(diagnostic.diagnostic.outcome,'policy_block');
  assert.equal(diagnostic.diagnostic.finishReason,null);
  assert.equal(diagnostic.diagnostic.promptBlockReason,'PROHIBITED_CONTENT');
  assert.equal(diagnostic.diagnostic.observedInputTokens,31123);
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostic.diagnostic.promptSafetyRatings)),[safeRating]);
  assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE_/);

  responder=()=>new Response(JSON.stringify({candidates:[{
    finishReason:'MAX_TOKENS',content:{parts:[{thought:true,text:'PRIVATE_THOUGHT'}]}
  }]}));
  const truncated=await c.API.send({...config('gemini'),__stateTask:true,__stateRebuild:true},messages);
  assert.doesNotMatch(truncated.text,/PRIVATE_THOUGHT/);
  diagnostic=c.BAORequestLedger.snapshot().calls[0];
  assert.equal(diagnostic.task,'state-rebuild');
  assert.equal(diagnostic.diagnostic.outcome,'output_truncated');

  responder=()=>new Response(JSON.stringify({choices:[{message:{content:''},finish_reason:'stop'}]}));
  await c.API.send({...config('openai'),__storyRevision:'regenerate'},messages);
  assert.equal(c.BAORequestLedger.snapshot().calls[0].diagnostic.outcome,'empty_response');

  responder=()=>new Response(JSON.stringify({error:{message:'PRIVATE_ERROR'}}),{status:403});
  await assert.rejects(c.API.send({...config('openai'),type:'openrouter'},messages));
  assert.equal(c.BAORequestLedger.snapshot().calls[0].diagnostic.outcome,'api_error');
  responder=()=>new Response(JSON.stringify({error:{message:'PRIVATE_ERROR',metadata:{error_type:'content_policy_violation'}}}));
  await assert.rejects(c.API.send({...config('openai'),type:'openrouter'},messages));
  assert.equal(c.BAORequestLedger.snapshot().calls[0].diagnostic.outcome,'policy_block');
  assert.doesNotMatch(JSON.stringify(c.BAORequestLedger.snapshot()),/PRIVATE_/);

  let attempts=0;const callbacks=[];
  responder=()=>++attempts<3?new Response('{}',{status:503}):new Response(JSON.stringify({choices:[{message:{content:'OK'}}],usage:{prompt_tokens:7,completion_tokens:3}}));
  await c.API.send({...config('openai'),retryEnabled:true,onRetry:e=>callbacks.push(e)},messages);
  let snap=c.BAORequestLedger.snapshot();assert.equal(snap.logicalRequests,1);assert.equal(snap.transportAttempts,3);assert.equal(snap.retries,2);
  assert.deepEqual(Array.from(snap.calls[0].attempts.map(a=>a.httpStatus)),[503,503,200]);assert.equal(callbacks.length,2);
  assert.ok(!requests.at(-1).body.includes('__requestTrace'));
  const html=c.BAORequestLedger.render();assert.match(html,/最近回覆狀態/);assert.match(html,/已完成/);assert.doesNotMatch(html,/傳輸嘗試|重試|HTTP|audit|費用|PRIVATE_|private-endpoint/);
  snap.calls[0].status='tamper';assert.equal(c.BAORequestLedger.snapshot().calls[0].status,'success');
  responder=()=>new Response('{}',{status:503});
  c.API.waitForRetry=async()=>{throw Object.assign(new Error('cancelled during delay'),{name:'AbortError'});};
  await assert.rejects(c.API.send({...config('openai'),retryEnabled:true},messages));
  assert.equal(c.BAORequestLedger.snapshot().transportAttempts,1);
  assert.equal(c.BAORequestLedger.snapshot().retries,0,'cancelled retry delay is not an executed retry');
  c.API.waitForRetry=async()=>{};
  responder=()=>new Response(JSON.stringify({choices:[{message:{content:'OK'}}]}));

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

  // Gemini emits safety metadata and usage in separate SSE events.
  responder=()=>new Response([
    {candidates:[{finishReason:'SAFETY',safetyRatings:[unsafeRating]}]},
    {usageMetadata:{promptTokenCount:234}}
  ].map(item=>'data: '+JSON.stringify(item)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
  await c.API.send({...config('gemini'),stream:true,onDelta:()=>assert.fail('thought/block must not produce a delta')},messages);
  diagnostic=c.BAORequestLedger.snapshot().calls[0].diagnostic;
  assert.equal(diagnostic.outcome,'policy_block');
  assert.equal(diagnostic.finishReason,'SAFETY');
  assert.equal(diagnostic.observedInputTokens,234);
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostic.safetyRatings)),[safeRating]);

  // Failed streams must keep already-observed usage and safety metadata in
  // the ledger without retaining emitted story text or provider explanations.
  for (const [protocol, first] of [
    ['openai', {choices:[{delta:{content:'PRIVATE_PARTIAL'}}],usage:{prompt_tokens:42}}],
    ['anthropic', {type:'message_start',message:{usage:{input_tokens:42}}}],
    ['gemini', {promptFeedback:{blockReason:'SAFETY',safetyRatings:[unsafeRating]},usageMetadata:{promptTokenCount:42}}],
  ]) {
    responder=()=>new Response([first,{error:{message:'PRIVATE_ERROR'}}]
      .map(item=>'data: '+JSON.stringify(item)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
    await assert.rejects(c.API.send({...config(protocol),stream:true,onDelta:()=>{}},messages));
    diagnostic=c.BAORequestLedger.snapshot().calls[0].diagnostic;
    assert.equal(diagnostic.observedInputTokens,42);
    assert.equal(diagnostic.outcome,protocol==='gemini'?'policy_block':'api_error');
    assert.doesNotMatch(JSON.stringify(c.BAORequestLedger.snapshot()),/PRIVATE_/);
  }

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
