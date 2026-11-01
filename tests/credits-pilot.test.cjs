const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../js/credits-pilot.js'), 'utf8');
const siteLoader = fs.readFileSync(path.join(__dirname, '../js/site-ui.js'), 'utf8');
const siteHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert.match(siteLoader, /loadBAOScript\("js\/credits-pilot\.js\?v=2"\)/,
  "Hosted credits must actually load before relying on its production error handler");
const lazyLoaderVersion = siteHtml.match(/js\/site-ui\.js\?v=(\d+)/);
assert(lazyLoaderVersion && Number(lazyLoaderVersion[1]) >= 166,
  "the page must load a recent lazy loader after release");
const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/presets/models.json'), 'utf8'));
function build(response={ok:true,status:200,body:{content:'測試成功',usage:{input_tokens:10,output_tokens:6,charged_credits:1}}}) {
  const calls=[]; const options=[];
  const api={
    __sendWrapperIds:new Set(),
    send:async()=>({text:'BYOK works',usage:{}}),
    contentToText:x=>String(x),
    normalizeUsage:u=>u,
    networkError:e=>e,
    wrapSend(id,wrapper){
      if(this.__sendWrapperIds.has(id)) return false;
      const next=this.send.bind(this);
      this.send=(config,messages,...rest)=>wrapper(next,config,messages,...rest);
      this.__sendWrapperIds.add(id);
      return true;
    }
  };
  const app={config:{api:null},modelRegistry:registry,modelPresets:[{provider:'gemini',label:'original',model:'original',base_url:'https://google',protocol:'gemini'}],populateAPIControls(){},syncSelectedPreset(){}};
  const elements={'api-type':{value:'',querySelector:()=>null,appendChild:o=>options.push(o),addEventListener:()=>{}},'api-key':{value:'',closest:()=>({firstChild:{nodeType:3}}),addEventListener:()=>{}},'api-hint':{textContent:''},'api-protocol-badge':{textContent:''}};
  const document={readyState:'loading',getElementById:id=>elements[id],createElement:()=>({}),addEventListener(){},body:{}};
  const defaultSession='yb_s_'+'A'.repeat(43);
  const window={
    localStorage:{getItem:key=>key==='yorubay:session'?defaultSession:null},
    GameState:{current:{storySessionId:'bao-lab:test-story:11111111-1111-4111-8111-111111111111'}}
  };
  const context={API:api,App:app,document,window,TextEncoder,MutationObserver:class{observe(){}},fetch:async(url,opt)=>{calls.push([url,opt]);return {ok:response.ok,status:response.status,json:async()=>response.body}}};
  vm.runInNewContext(code,context);
  assert.equal(api.__sendWrapperIds.has('credits-pilot:hosted-transport'),true,'credits pilot must install through API.wrapSend');
  return {app,api,calls,options,window,elements,context};
}
const token='yb_s_'+'A'.repeat(43);
const legacyToken='bao_'+'L'.repeat(43);
const cfg={type:'bao-credits',route:'bao-credits',protocol:'openai',baseUrl:'https://api.yorubay.com/chat',key:'__YORUBAY_ACCOUNT__',model:'gemini-3-flash-preview'};
const msgs=[{role:'user',content:'你好'}];

test('pilot sends player-token request to fixed Worker, never admin/provider keys',async()=>{
 const s=build(); const result=await s.api.send(cfg,msgs);
 assert.equal(result.text,'測試成功'); assert.equal(s.calls.length,1);
 assert.equal(result.credits.charged_credits,1);
 const [url,opt]=s.calls[0]; assert.equal(url,cfg.baseUrl); assert.equal(opt.headers.Authorization,'Bearer '+token);
 assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(opt.body))),{provider:'gemini',model:'gemini-3-flash-preview',request_kind:'chat',messages:msgs,max_output_tokens:6144});
 assert.equal(opt.body.includes(token),false);
});
test('Gemini 3.1 Pro uses the Google official hosted route',async()=>{
 const s=build();
 const official={...cfg,model:'gemini-3.1-pro-preview',maxOutputTokens:8192};
 await s.api.send(official,msgs);
 assert.equal(s.calls.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(s.calls[0][1].body))),{provider:'gemini',model:'gemini-3.1-pro-preview',request_kind:'chat',messages:msgs,max_output_tokens:8192});
 assert.equal(s.calls[0][1].headers.Authorization,'Bearer '+token);
 assert.equal(s.calls[0][1].body.includes(token),false);
 assert.equal(s.calls[0][1].body.includes('OPENROUTER_API_KEY'),false);
});
test('Claude hosted presets route through OpenRouter with the same account session',async()=>{
 const s=build();
 const models=[
   'anthropic/claude-haiku-4.5',
   'anthropic/claude-sonnet-4.5',
   'anthropic/claude-sonnet-5',
   'anthropic/claude-sonnet-4.6',
   'anthropic/claude-opus-4.6'
 ];
 for (const model of models) {
   await s.api.send({...cfg,model,maxOutputTokens:4096},msgs);
 }
 assert.equal(s.calls.length,models.length);
 for (let i=0;i<s.calls.length;i++) {
   const body=JSON.parse(s.calls[i][1].body);
   assert.equal(body.provider,'openrouter');
   assert.equal(body.model,models[i]);
   assert.equal(body.max_output_tokens,4096);
   assert.equal(body.session_id,'bao-lab:test-story:11111111-1111-4111-8111-111111111111:chat');
   assert.equal(s.calls[i][1].headers.Authorization,'Bearer '+token);
 }
});

test('OpenAI and xAI hosted presets route through OpenRouter',async()=>{
 const s=build();
 const models=['openai/gpt-5.6-luna','x-ai/grok-4.5'];
 for (const model of models) await s.api.send({...cfg,model,maxOutputTokens:4096},msgs);
 assert.equal(s.calls.length,models.length);
 for (let i=0;i<models.length;i++) {
   const body=JSON.parse(s.calls[i][1].body);
   assert.equal(body.provider,'openrouter');
   assert.equal(body.model,models[i]);
   assert.equal(body.max_output_tokens,4096);
   assert.equal(body.session_id,'bao-lab:test-story:11111111-1111-4111-8111-111111111111:chat');
 }
});
test('DeepSeek, Qwen, MiMo and MiniMax hosted presets route through OpenRouter',async()=>{
 const s=build();
 const models=['deepseek/deepseek-v4-flash-0731','qwen/qwen3.7-flash','xiaomi/mimo-v2.6-flash','minimax/minimax-m3'];
 for (const model of models) await s.api.send({...cfg,model,maxOutputTokens:4096},msgs);
 assert.equal(s.calls.length,models.length);
 for (let i=0;i<models.length;i++) {
   const body=JSON.parse(s.calls[i][1].body);
   assert.equal(body.provider,'openrouter');
   assert.equal(body.model,models[i]);
   assert.equal(body.max_output_tokens,4096);
   assert.equal(body.session_id,'bao-lab:test-story:11111111-1111-4111-8111-111111111111:chat');
 }
});
test('summary and status use separate sticky sessions while BYOK stays available',async()=>{
 const s=build(); await s.api.send({...cfg,model:'qwen/qwen3.7-flash',__memoryTask:true},msgs);
 const summaryBody=JSON.parse(s.calls[0][1].body);
 assert.equal(summaryBody.request_kind,'summary');
 assert.equal(summaryBody.session_id,'bao-lab:test-story:11111111-1111-4111-8111-111111111111:summary');
 await s.api.send({...cfg,__connectionTest:true,maxOutputTokens:16},msgs);
 assert.equal(JSON.parse(s.calls[1][1].body).max_output_tokens,16);
 assert.equal(JSON.parse(s.calls[1][1].body).session_id,undefined);
 await s.api.send({...cfg,model:'minimax/minimax-m3',__stateTask:true},msgs);
 const statusBody=JSON.parse(s.calls[2][1].body);
 assert.equal(statusBody.request_kind,'status');
 assert.equal(statusBody.session_id,'bao-lab:test-story:11111111-1111-4111-8111-111111111111:status');
 const normal=await s.api.send({type:'gemini',key:'own-key',model:'abc',baseUrl:'https://example.org'},msgs);
 assert.equal(normal.text,'BYOK works'); assert.equal(s.calls.length,3);
});

test('OpenRouter hosted chat keeps one session per story and changes it for another story',async()=>{
 const s=build();
 const openrouter={...cfg,model:'anthropic/claude-sonnet-4.6'};
 await s.api.send(openrouter,msgs);
 await s.api.send(openrouter,msgs);
 const first=JSON.parse(s.calls[0][1].body).session_id;
 const second=JSON.parse(s.calls[1][1].body).session_id;
 assert.equal(first,second);
 s.window.GameState.current={storySessionId:'bao-lab:other-story:22222222-2222-4222-8222-222222222222'};
 await s.api.send(openrouter,msgs);
 const third=JSON.parse(s.calls[2][1].body).session_id;
 assert.notEqual(first,third);
 assert.equal(third,'bao-lab:other-story:22222222-2222-4222-8222-222222222222:chat');
});
test('summary allowance reaches Worker independently of chat allowance',async()=>{
 const s=build();
 s.app.config.api={...cfg,maxOutputTokens:256};
 await s.api.send({...cfg,model:'gemini-3.1-pro-preview',__memoryTask:true,maxOutputTokens:8192},msgs);
 const body=JSON.parse(s.calls[0][1].body);
 assert.equal(body.request_kind,'summary');
 assert.equal(body.max_output_tokens,8192);
});
test('YoruBay requests clamp only above the shared 8192 Worker ceiling',async()=>{
 const s=build();
 await s.api.send({...cfg,model:'anthropic/claude-sonnet-4.6',maxOutputTokens:12000},msgs);
 assert.equal(JSON.parse(s.calls[0][1].body).max_output_tokens,8192);
});

test('refuses account-session leakage to other provider and wrong URL/models',async()=>{
 const s=build();s.app.config.api=cfg;
 await assert.rejects(()=>s.api.send({type:'openrouter',key:'__YORUBAY_ACCOUNT__',baseUrl:'https://openrouter.ai/api/v1'},msgs),/不可沿用/);
 await assert.rejects(()=>s.api.send({...cfg,baseUrl:'https://evil.test/chat'},msgs),/固定連線路線/);
 await assert.rejects(()=>s.api.send({...cfg,model:'gemini-9-unknown'},msgs),/已開放模型/);
 assert.equal(s.calls.length,0);
});
test('hosted transport no longer treats 96 KB as the normal story ceiling',async()=>{
 const s=build();
 const long=[{role:'system',content:'s'.repeat(60000)},{role:'user',content:'u'.repeat(40000)}];
 await s.api.send(cfg,long);
 assert.equal(s.calls.length,1);
 assert.ok(Buffer.byteLength(JSON.stringify(JSON.parse(s.calls[0][1].body).messages),'utf8')>96000);
});

test('smart hosted stories compact before sending when the soft budget is crossed',async()=>{
 const s=build();
 let summaries=0;
 s.app.config={api:cfg,memory:{mode:'smart',maxRounds:20}};
 s.window.Chat={
   summarizedUntil:0,
   async maybeSummarize(){summaries+=1;this.summarizedUntil=24;}
 };
 s.app.buildMessages=async()=>s.window.Chat.summarizedUntil
   ? [{role:'system',content:'s'.repeat(18000)},{role:'user',content:'u'.repeat(18000)}]
   : [{role:'system',content:'s'.repeat(60000)},{role:'user',content:'u'.repeat(40000)}];
 const original=[{role:'system',content:'s'.repeat(60000)},{role:'user',content:'u'.repeat(40000)}];
 await s.api.send(cfg,original);
 assert.equal(summaries,1);
 assert.equal(s.calls.length,1);
 const sent=JSON.parse(s.calls[0][1].body).messages;
 assert.ok(Buffer.byteLength(JSON.stringify(sent),'utf8')<88000);
 const budget=s.window.BAOCreditsPilot.contextBudget();
 assert.equal(budget.adaptive,true);
 assert.equal(budget.summaryPasses,1);
 assert.ok(budget.finalBytes<budget.initialBytes);
});

test('hosted hard guard still rejects extreme requests without deleting story data',async()=>{
 const s=build();
 const huge=[
   {role:'system',content:'s'.repeat(70000)},
   {role:'assistant',content:'a'.repeat(70000)},
   {role:'user',content:'u'.repeat(70000)}
 ];
 await assert.rejects(()=>s.api.send(cfg,huge),/不是智慧記憶模式/);
 assert.equal(s.calls.length,0);
});
test('forwards cache-aware usage returned by the Worker to BAO/LAB usage accounting',async()=>{
 const s=build({ok:true,status:200,body:{content:'cache',usage:{input_tokens:1000,output_tokens:100,cached_tokens:700,cache_write_tokens:50,reasoning_tokens:20,provider_cost_usd:0.01,charged_credits:11,billing_mode:'raw_tokens_v1'}}});
 const result=await s.api.send({...cfg,model:'anthropic/claude-sonnet-4.6'},msgs);
 assert.equal(result.usage.input_tokens,1000);
 assert.equal(result.usage.cached_tokens,700);
 assert.equal(result.usage.cache_write_tokens,50);
 assert.equal(result.usage.new_input_tokens,300);
 assert.equal(result.credits.reasoning_tokens,20);
 assert.equal(result.credits.provider_cost_usd,0.01);
 assert.equal(result.credits.billing_mode,'raw_tokens_v1');
});
test('propagates quota and provider-specific upstream errors without exposing player keys',async()=>{
 const auth=build({ok:false,status:401,body:{error:'unauthorized'}});
 await assert.rejects(()=>auth.api.send(cfg,msgs),/登入已失效/);
 const insufficient=build({ok:false,status:402,body:{error:'insufficient_credits'}});
 await assert.rejects(()=>insufficient.api.send(cfg,msgs),/額度不足/);
 const rateLimit=build({ok:false,status:502,body:{error:'provider_rate_limited',upstream_http_status:429}});
 await assert.rejects(()=>rateLimit.api.send(cfg,msgs),/夜灣模型服務 回報速率或配額限制/);
 await assert.rejects(()=>rateLimit.api.send({...cfg,model:'deepseek/deepseek-v4-flash-0731'},msgs),/夜灣模型服務 回報速率或配額限制/);
 const unverified=build({ok:false,status:502,body:{
   error:'provider_usage_unverified',
   billing_refunded:true,
   request_id:'2bcbe50f-9d5f-4c43-8d6f-d339e49bff45',
   route:'direct_openrouter',
   request_bytes:133120,
   elapsed_ms:75012,
   timeout_ms:75000,
   transport_failure:'timeout'
 }});
 await assert.rejects(()=>unverified.api.send({...cfg,model:'anthropic/claude-sonnet-4.6'},msgs),error=>{
   assert.match(error.message,/本次預留燈火已全數退回/);
   assert.match(error.message,/OpenRouter 直連/);
   assert.match(error.message,/130\.0 KB/);
   assert.match(error.message,/75\.0 秒後中斷/);
   assert.match(error.message,/判定：逾時/);
   assert.match(error.message,/截止：75 秒/);
   assert.match(error.message,/診斷編號/);
   return true;
 });
 const upstream500=build({ok:false,status:502,body:{error:'provider_http_error',upstream_http_status:500,request_id:'610dc846-559c-4273-9ac2-e251a7db0971',route:'aws_relay',request_bytes:111469,elapsed_ms:65944,timeout_ms:170000}});
 await assert.rejects(()=>upstream500.api.send(cfg,msgs),error=>{
   assert.match(error.message,/夜灣連線鏈路暫時異常（HTTP 500）/);
   assert.match(error.message,/夜灣 AWS 中繼/);
   assert.match(error.message,/108\.9 KB/);
   assert.match(error.message,/65\.9 秒後收到 HTTP 錯誤/);
   assert.match(error.message,/Worker 逾時設定：170 秒/);
   assert.doesNotMatch(error.message,/Google Gemini 拒絕本次請求/);
   assert.match(error.message,/診斷編號/);
   return true;
 });
 const upstream403=build({ok:false,status:502,body:{error:'provider_http_error',upstream_http_status:403}});
 await assert.rejects(()=>upstream403.api.send(cfg,msgs),/驗證或授權失敗（HTTP 403）/);
 const empty=build({ok:false,status:502,body:{error:'provider_empty_text',finish_reason:'MAX_TOKENS'}});
 await assert.rejects(()=>empty.api.send(cfg,msgs),error=>{
   assert.match(error.message,/MAX_TOKENS/);
   assert.match(error.message,/提高「回覆輸出上限」/);
   return true;
 });
 const noCandidates=build({ok:false,status:502,body:{error:'provider_empty_text',response_shape:'no_candidates'}});
 await assert.rejects(()=>noCandidates.api.send(cfg,msgs),/沒有候選文字/);
 const thinkingOnly=build({ok:false,status:502,body:{error:'provider_empty_text',response_shape:'thought_only',finish_reason:'MAX_TOKENS'}});
 await assert.rejects(()=>thinkingOnly.api.send(cfg,msgs),error=>{
   assert.match(error.message,/僅回傳思考內容/);
   assert.match(error.message,/MAX_TOKENS/);
   assert.doesNotMatch(error.message,/提高「回覆輸出上限」/);
   return true;
 });
 const safety=build({ok:false,status:502,body:{error:'provider_empty_text',finish_reason:'SAFETY'}});
 await assert.rejects(()=>safety.api.send(cfg,msgs),error=>{
   assert.match(error.message,/SAFETY/);
   assert.doesNotMatch(error.message,/提高「回覆輸出上限」/);
   assert.match(error.message,/重新生成或調整本次內容/);
   return true;
 });
 const inputBlocked=build({ok:false,status:502,body:{error:'provider_empty_text',finish_reason:'PROHIBITED_CONTENT',prompt_block_reason:'PROHIBITED_CONTENT',blocked_stage:'input'}});
 await assert.rejects(()=>inputBlocked.api.send(cfg,msgs),error=>{
   assert.equal(error.code,'BAO_PROVIDER_BLOCKED');
   assert.equal(error.blockedStage,'input');
   assert.equal(error.finishReason,'PROHIBITED_CONTENT');
   assert.match(error.message,/未接受本次內容/);
   assert.match(error.message,/階段：輸入內容/);
   assert.doesNotMatch(error.message,/連線失敗/);
   return true;
 });
 const outputBlocked=build({ok:false,status:502,body:{error:'provider_empty_text',finish_reason:'PROHIBITED_CONTENT',candidate_finish_reason:'PROHIBITED_CONTENT',blocked_stage:'output'}});
 await assert.rejects(()=>outputBlocked.api.send(cfg,msgs),error=>{
   assert.equal(error.code,'BAO_PROVIDER_BLOCKED');
   assert.equal(error.blockedStage,'output');
   assert.equal(error.finishReason,'PROHIBITED_CONTENT');
   assert.match(error.message,/中止本次生成/);
   assert.match(error.message,/階段：生成輸出/);
   assert.doesNotMatch(error.message,/連線失敗/);
   return true;
 });
 const unknown=build({ok:false,status:502,body:{error:'provider_empty_text'}});
 await assert.rejects(()=>unknown.api.send(cfg,msgs),error=>{
   assert.match(error.message,/已回應，但沒有可顯示文字/);
   assert.match(error.message,/先重新生成/);
   assert.doesNotMatch(error.message,/輸出上限/);
   return true;
 });
});
test('registers only the prioritized YoruBay hosted catalog without free or duplicate routes',()=>{
  const s=build();s.app.populateAPIControls();s.app.populateAPIControls();
  assert.equal(s.app.modelPresets.length,18);
  assert.equal(s.app.modelPresets[0].provider,'gemini');
  const added=s.app.modelPresets.slice(1);
  assert.deepEqual(Array.from(added.map(p=>p.model)),[
    'deepseek/deepseek-v4-flash-0731',
    'qwen/qwen3.7-flash',
    'xiaomi/mimo-v2.6-flash',
    'google/gemma-4-31b-it',
    'gemini-3-flash-preview',
    'gemini-3.8-flash',
    'minimax/minimax-m3',
    'openai/gpt-5.6-luna',
    'x-ai/grok-4.5',
    'gemini-3.1-pro-preview',
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-sonnet-5',
    'anthropic/claude-sonnet-5.5',
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-opus-4.6',
    'anthropic/claude-opus-5.5'
  ]);
  assert.equal(added.every(p=>p.provider==='bao-credits'),true);
  assert.equal(added.every(p=>p.provider_label==='夜灣燈火'),true);
  assert.equal(added.every(p=>p.base_url===cfg.baseUrl),true);
  assert.equal(added.some(p=>p.model==='openrouter/free'),false);
  assert.equal(added.some(p=>p.model==='gemini-3.1-flash-lite'),false);
  assert.equal(added.some(p=>p.model==='google/gemini-3.1-pro-preview'),false);
  assert.equal(added.some(p=>p.model==='anthropic/claude-opus-4.5'),false);
  assert.match(added[0].label,/超省長聊.*DeepSeek/);
  assert.match(added[3].label,/高 CP RP.*Gemma 4 31B/);
  assert.match(added[4].label,/日常主力.*Gemini 3 Flash/);
  assert.match(added[5].label,/新主力.*Gemini 3\.8 Flash/);
  assert.match(added[6].label,/長篇世界.*MiniMax M3/);
  assert.match(added[7].label,/OpenAI 選擇.*GPT-5\.6 Luna/);
  assert.match(added[8].label,/xAI 選擇.*Grok 4\.5/);
  assert.match(added[10].label,/低成本 Claude.*Haiku 4\.5/);
  assert.match(added[11].label,/舊版相容.*Sonnet 4\.5/);
  assert.match(added[12].label,/新版備選.*Sonnet 5/);
  assert.match(added[13].label,/Claude 主力.*Sonnet 5\.5/);
  assert.match(added[14].label,/RP 高品質.*Sonnet 4\.6/);
  assert.match(added[15].label,/豪華.*Opus 4\.6/);
  assert.match(added[16].label,/旗艦.*Opus 5\.5/);
  assert.equal(s.window.BAOCreditsPilot.models.length,17);
});

test('cookie-backed YoruBay session sends credentials without exposing a bearer token',async()=>{
 const s=build();
 const store=new Map([['yorubay:session:active','1']]);
 s.window.localStorage={
   getItem:key=>store.get(key)||null,
   setItem:(key,value)=>store.set(key,String(value)),
   removeItem:key=>store.delete(key)
 };
 const result=await s.api.send({...cfg,key:'__YORUBAY_ACCOUNT__',model:'gemini-3-flash-preview'},msgs);
 assert.equal(result.text,'測試成功');
 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0][1].credentials,'include');
 assert.equal(Object.prototype.hasOwnProperty.call(s.calls[0][1].headers,'Authorization'),false);
 assert.equal(s.calls[0][1].body.includes('yb_s_'),false);
});

test('uses logged-in YoruBay session token without copying it into request body',async()=>{
 const s=build();
 const session='yb_s_'+'S'.repeat(43);
 s.window.localStorage={getItem:key=>key==='yorubay:session'?session:null};
 const result=await s.api.send({...cfg,key:'__YORUBAY_ACCOUNT__',model:'gemini-3-flash-preview'},msgs);
 assert.equal(result.text,'測試成功');
 assert.equal(s.calls[0][1].headers.Authorization,'Bearer '+session);
 assert.equal(s.calls[0][1].credentials,'omit');
 assert.equal(s.calls[0][1].body.includes(session),false);
});

test('rejects legacy bao_ token before any Worker request when no YoruBay session exists',async()=>{
 const s=build();
 s.window.localStorage={getItem:()=>null};
 await assert.rejects(()=>s.api.send({...cfg,key:legacyToken},msgs),/舊版 bao_ 玩家金鑰已停止/);
 assert.equal(s.calls.length,0);
});

test('logged-in account normalizes saved Worker connections and does not require a BYOK key',()=>{
 const s=build();
 const session='yb_s_'+'W'.repeat(43);
 s.window.localStorage={getItem:key=>key==='yorubay:session'?session:null};
 const saved={type:'custom',route:'custom',protocol:'gemini',model:'gemini-3.1-pro-preview',baseUrl:cfg.baseUrl,key:''};
 assert.equal(s.window.BAOCreditsPilot.isAccountConnection(saved),true);
 assert.equal(s.window.BAOCreditsPilot.isAccountReady(saved),true);
 assert.equal(s.window.BAOCreditsPilot.prepareAccountConfig(saved),true);
 assert.equal(saved.type,'bao-credits');
 assert.equal(saved.route,'bao-credits');
 assert.equal(saved.protocol,'openai');
 assert.equal(saved.key,'__YORUBAY_ACCOUNT__');
});

test('smart Claude handoff compacts over 100 messages even below the byte target',async()=>{
 const s=build();
 const claude={...cfg,model:'anthropic/claude-sonnet-4.6'};
 const original=Array.from({length:102},(_,i)=>({role:i%2?'user':'assistant',content:'history '+i}));
 const snapshot=JSON.stringify(original);
 s.app.config={api:claude,memory:{mode:'smart',maxRounds:20}};
 s.window.Chat={summarizedUntil:0,async maybeSummarize(){this.summarizedUntil=90;}};
 s.app.buildMessages=async()=>s.window.Chat.summarizedUntil ? msgs : original;
 await s.api.send(claude,original);
 assert.equal(s.window.Chat.summarizedUntil,90);
 assert.equal(s.calls.length,1);
 assert.deepEqual(JSON.parse(s.calls[0][1].body).messages,msgs);
 assert.equal(JSON.stringify(original),snapshot);
});

test('failed summary preserves history and blocks an oversized message count',async()=>{
 const s=build();
 const original=Array.from({length:102},()=>({role:'user',content:'history'}));
 const snapshot=JSON.stringify(original);
 s.app.config={api:cfg,memory:{mode:'smart',maxRounds:20}};
 s.window.Chat={summarizedUntil:0,async maybeSummarize(){}};
 s.app.buildMessages=async()=>original;
 await assert.rejects(()=>s.api.send(cfg,original),/仍超過 100/);
 assert.equal(s.calls.length,0);
 assert.equal(JSON.stringify(original),snapshot);
});

test('oversized single history message can be summarized before transport validation',async()=>{
 const s=build();
 const original=[{role:'assistant',content:'a'.repeat(80001)},...msgs];
 s.app.config={api:cfg,memory:{mode:'smart',maxRounds:20}};
 s.window.Chat={summarizedUntil:0,async maybeSummarize(){this.summarizedUntil=1;}};
 s.app.buildMessages=async()=>s.window.Chat.summarizedUntil ? msgs : original;
 await s.api.send(cfg,original);
 assert.equal(s.calls.length,1);
 assert.equal(original[0].content.length,80001);
});


test('real bounded summarizer drains a Chinese backlog beyond two batches and checkpoints progress',async()=>{
 const s=build();
 s.context.GameState=s.window.GameState;
 s.window.addEventListener=()=>{};
 s.window.BAOHelperData={memoryRules:'',memoryText:v=>v==='GOOD'?'可靠摘要':'',parse:()=>({})};
 s.context.console={warn(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/chat.js'),'utf8')+'\nwindow.Chat=Chat;',s.context);
 const chat=s.window.Chat;
 chat.messages=Array.from({length:48},(_,i)=>({id:'m'+i,role:i%2?'assistant':'user',content:'劇'.repeat(3000)}));
 chat.messages.push({id:'latest',role:'user',content:'繼續'});
 chat.ensureMessageIds();
 const snapshot=JSON.stringify(chat.messages);
 s.app.config={api:cfg,memory:{mode:'smart',maxRounds:20,episodicRecall:false}};
 let saved=0;
 s.app.saveStory=()=>{saved++;assert.ok(chat.summarizedUntil>0);};
 s.app.buildMessages=async()=>[{role:'system',content:'固定設定'+chat.summary},...chat.messages.slice(chat.summarizedUntil)];
 // Summary requests still pass through the hosted wrapper and independent budget.
 s.context.fetch=async(url,opt)=>{
   const body=JSON.parse(opt.body);s.calls.push([url,opt]);
   return {ok:true,status:200,json:async()=>({content:body.request_kind==='summary'?'GOOD':'續寫',usage:{}})};
 };
 await s.api.send(cfg,await s.app.buildMessages());
 const requests=s.calls.map(c=>JSON.parse(c[1].body));
 assert.ok(saved>2);
 assert.equal(requests.filter(r=>r.request_kind==='summary').length,saved);
 assert.equal(requests.filter(r=>r.request_kind==='chat').length,1);
 assert.ok(Buffer.byteLength(JSON.stringify(requests.at(-1).messages),'utf8')<=88000);
 assert.equal(requests.at(-1).messages.at(-1).content,'繼續');
 assert.equal(JSON.stringify(chat.messages),snapshot);
 assert.equal(s.window.BAOCreditsPilot.contextBudget().summaryPasses,saved);
});

function backlogFixture() {
 const s=build();
 const original=Array.from({length:4},(_,i)=>({role:i%2?'user':'assistant',content:'劇'.repeat(20000)}));
 s.app.config={api:cfg,memory:{mode:'smart',maxRounds:20}};
 s.window.Chat={summarizedUntil:0,async maybeSummarize(){this.summarizedUntil+=2;}};
 s.app.buildMessages=async()=>original;
 return {...s,original};
}

test('recovery checkpoints and stops at twelve batches, then resumes from saved coverage',async()=>{
 const s=backlogFixture();let saved=0;
 s.app.saveStory=()=>saved++;
 await assert.rejects(()=>s.api.send(cfg,s.original),/已達 12 批/);
 assert.equal(s.window.Chat.summarizedUntil,24);
 assert.equal(saved,12);assert.equal(s.calls.length,0);
 s.app.buildMessages=async()=>s.window.Chat.summarizedUntil>24?msgs:s.original;
 await s.api.send(cfg,s.original);
 assert.equal(saved,13);assert.equal(s.calls.length,1);
});

test('failure after successful batches stops immediately and reports actual summary failure',async()=>{
 const s=backlogFixture();let attempts=0;
 s.window.Chat.maybeSummarize=async function(){
   if(++attempts<4)this.summarizedUntil+=2;
   else this.memoryHealth={phase:'failed',message:'摘要輸出已截斷，尚有內容未整理'};
 };
 await assert.rejects(()=>s.api.send(cfg,s.original),/摘要輸出已截斷/);
 assert.equal(attempts,4);assert.equal(s.window.Chat.summarizedUntil,6);assert.equal(s.calls.length,0);
});

test('no-progress recovery is finite for large fixed settings',async()=>{
 const s=backlogFixture();let attempts=0;
 s.window.Chat.maybeSummarize=async()=>{attempts++;};
 await assert.rejects(()=>s.api.send(cfg,s.original),/上限 192 KB/);
 assert.equal(attempts,2);assert.equal(s.calls.length,0);
});

test('story switch and cancellation during recovery never send the rebuilt story',async()=>{
 for(const cancel of [false,true]) {
   const s=backlogFixture();const signal={aborted:false};
   s.window.Chat.maybeSummarize=async()=>{
     if(cancel)signal.aborted=true;
     else s.window.GameState.current={storySessionId:'other'};
   };
   await assert.rejects(()=>s.api.send({...cfg,signal},s.original),cancel?/已停止/:/故事已切換/);
   assert.equal(s.calls.length,0);
 }
});

test('auxiliary hosted requests cannot recursively drain story memory',async()=>{
 for(const kind of ['__memoryTask','__stateTask','__auxiliaryTask','__storyTool','__connectionTest']) {
   const s=backlogFixture();let attempts=0;
   s.window.Chat.maybeSummarize=async()=>attempts++;
   await assert.rejects(()=>s.api.send({...cfg,[kind]:true},s.original),/仍過大/);
   assert.equal(attempts,0);assert.equal(s.calls.length,0);
 }
});


test('Gemini summary has independent 16K allowance while story and other providers retain 8K',async()=>{
 const s=build();
 for(const [extra,expected] of [
   [{__memoryTask:true,maxOutputTokens:16384},16384],
   [{maxOutputTokens:16384},8192],
   [{__stateTask:true,maxOutputTokens:16384},8192],
   [{model:'anthropic/claude-sonnet-4.6',__memoryTask:true,maxOutputTokens:16384},8192]
 ]) {
   await s.api.send({...cfg,...extra},msgs);
   assert.equal(JSON.parse(s.calls.at(-1)[1].body).max_output_tokens,expected);
 }
});

test('hosted memory retains effective Worker budget and reasoning usage',async()=>{
 const s=build({ok:true,status:200,body:{content:'partial',finish_reason:'MAX_TOKENS',usage:{input_tokens:100,output_tokens:1796,reasoning_tokens:1000,requested_max_output_tokens:8192,effective_max_output_tokens:1796},request_id:'budget-test'}});
 const result=await s.api.send({...cfg,__memoryTask:true,maxOutputTokens:8192},msgs);
 assert.equal(result.outputBudget.requested,8192);
 assert.equal(result.outputBudget.effective,1796);
 assert.equal(result.outputBudget.source,'hosted-worker');
 assert.equal(result.usage.reasoning_tokens,1000);
});

test('insufficient summary reserve explains no model call and does not retry',async()=>{
 const s=build({ok:false,status:402,body:{error:'insufficient_wallet_balance_for_summary',model_called:false}});
 await assert.rejects(()=>s.api.send({...cfg,__memoryTask:true,maxOutputTokens:16384},msgs),/本次尚未呼叫模型/);
 assert.equal(s.calls.length,1);
});

for (const status of [401, 403]) test(`hosted upstream ${status} points to administrator without guessing provider or requesting player keys`, async () => {
 const s=build({ok:false,status:502,body:{error:'provider_http_error',upstream_http_status:status,request_id:'610dc846-559c-4273-9ac2-e251a7db0971'}});
 await assert.rejects(()=>s.api.send(cfg,msgs), error=>{
   assert.match(error.message,/向管理員回報診斷編號/);
   assert.match(error.message,/無須填寫自己的 API Key/);
   assert.doesNotMatch(error.message,/OpenRouter|Google Gemini|登入已失效/);
   return true;
 });
 assert.equal(s.window.BAOCreditsPilot.isAccountReady(cfg),true);
});
