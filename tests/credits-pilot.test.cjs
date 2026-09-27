const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../js/credits-pilot.js'), 'utf8');
function build(response={ok:true,status:200,body:{content:'測試成功',usage:{input_tokens:10,output_tokens:6,charged_credits:1}}}) {
  const calls=[]; const options=[];
  const api={send:async()=>({text:'BYOK works',usage:{}}),contentToText:x=>String(x),normalizeUsage:u=>u,networkError:e=>e};
  const app={config:{api:null},modelPresets:[{provider:'gemini',label:'original',model:'original',base_url:'https://google',protocol:'gemini'}],populateAPIControls(){},syncSelectedPreset(){}};
  const elements={'api-type':{value:'',querySelector:()=>null,appendChild:o=>options.push(o),addEventListener:()=>{}},'api-key':{value:'',closest:()=>({firstChild:{nodeType:3}}),addEventListener:()=>{}},'api-hint':{textContent:''},'api-protocol-badge':{textContent:''}};
  const document={readyState:'loading',getElementById:id=>elements[id],createElement:()=>({}),addEventListener(){},body:{}};
  const defaultSession='yb_s_'+'A'.repeat(43);
  const window={localStorage:{getItem:key=>key==='yorubay:session'?defaultSession:null}};
  const context={API:api,App:app,document,window,TextEncoder,MutationObserver:class{observe(){}},fetch:async(url,opt)=>{calls.push([url,opt]);return {ok:response.ok,status:response.status,json:async()=>response.body}}};
  vm.runInNewContext(code,context);
  return {app,api,calls,options,window,elements};
}
const token='yb_s_'+'A'.repeat(43);
const legacyToken='bao_'+'L'.repeat(43);
const cfg={type:'bao-credits',route:'bao-credits',protocol:'openai',baseUrl:'https://bao-lab-credits-api.ghost80076.workers.dev/chat',key:'__YORUBAY_ACCOUNT__',model:'gemini-3-flash-preview'};
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
test('Claude Sonnet and Opus invitation presets route through OpenRouter with the same account session',async()=>{
 const s=build();
 for (const model of ['anthropic/claude-sonnet-4.5','anthropic/claude-sonnet-4.6','anthropic/claude-opus-4.6']) {
   await s.api.send({...cfg,model,maxOutputTokens:4096},msgs);
 }
 assert.equal(s.calls.length,3);
 for (let i=0;i<s.calls.length;i++) {
   const body=JSON.parse(s.calls[i][1].body);
   assert.equal(body.provider,'openrouter');
   assert.equal(body.model,['anthropic/claude-sonnet-4.5','anthropic/claude-sonnet-4.6','anthropic/claude-opus-4.6'][i]);
   assert.equal(body.max_output_tokens,4096);
   assert.equal(s.calls[i][1].headers.Authorization,'Bearer '+token);
 }
});
test('DeepSeek, Qwen, MiMo and MiniMax hosted presets route through OpenRouter',async()=>{
 const s=build();
 const models=['deepseek/deepseek-v4-flash-0731','qwen/qwen3.7-flash','xiaomi/mimo-v2.5','minimax/minimax-m3'];
 for (const model of models) await s.api.send({...cfg,model,maxOutputTokens:4096},msgs);
 assert.equal(s.calls.length,models.length);
 for (let i=0;i<models.length;i++) {
   const body=JSON.parse(s.calls[i][1].body);
   assert.equal(body.provider,'openrouter');
   assert.equal(body.model,models[i]);
   assert.equal(body.max_output_tokens,4096);
 }
});
test('summary routes separate from chat, connection tests stay minimal, and BYOK stays available',async()=>{
 const s=build(); await s.api.send({...cfg,model:'qwen/qwen3.7-flash',__memoryTask:true},msgs);
 assert.equal(JSON.parse(s.calls[0][1].body).request_kind,'summary');
 await s.api.send({...cfg,__connectionTest:true,maxOutputTokens:16},msgs);
 assert.equal(JSON.parse(s.calls[1][1].body).max_output_tokens,16);
 await s.api.send({...cfg,model:'minimax/minimax-m3',__stateTask:true},msgs);
 assert.equal(JSON.parse(s.calls[2][1].body).request_kind,'status');
 const normal=await s.api.send({type:'gemini',key:'own-key',model:'abc',baseUrl:'https://example.org'},msgs);
 assert.equal(normal.text,'BYOK works'); assert.equal(s.calls.length,3);
});
test('YoruBay requests clamp only above the shared 8192 Worker ceiling',async()=>{
 const s=build();
 await s.api.send({...cfg,model:'anthropic/claude-sonnet-4.6',maxOutputTokens:12000},msgs);
 assert.equal(JSON.parse(s.calls[0][1].body).max_output_tokens,8192);
});

test('refuses account-session leakage to other provider and wrong URL/models',async()=>{
 const s=build();s.app.config.api=cfg;
 await assert.rejects(()=>s.api.send({type:'openrouter',key:'__YORUBAY_ACCOUNT__',baseUrl:'https://openrouter.ai/api/v1'},msgs),/不可沿用/);
 await assert.rejects(()=>s.api.send({...cfg,baseUrl:'https://evil.test/chat'},msgs),/固定後端/);
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
 await assert.rejects(()=>auth.api.send(cfg,msgs),/玩家金鑰無效/);
 const insufficient=build({ok:false,status:402,body:{error:'insufficient_credits'}});
 await assert.rejects(()=>insufficient.api.send(cfg,msgs),/額度不足/);
 const rateLimit=build({ok:false,status:502,body:{error:'provider_rate_limited',upstream_http_status:429}});
 await assert.rejects(()=>rateLimit.api.send(cfg,msgs),/Google Gemini 回報 API 速率或配額限制/);
 await assert.rejects(()=>rateLimit.api.send({...cfg,model:'deepseek/deepseek-v4-flash-0731'},msgs),/OpenRouter 回報 API 速率或配額限制/);
 const empty=build({ok:false,status:502,body:{error:'provider_empty_text',finish_reason:'MAX_TOKENS'}});
 await assert.rejects(()=>empty.api.send(cfg,msgs),/MAX_TOKENS/);
});
test('registers only the prioritized YoruBay hosted catalog without free or duplicate routes',()=>{
 const s=build();s.app.populateAPIControls();s.app.populateAPIControls();
 assert.equal(s.app.modelPresets.length,10);
 assert.equal(s.app.modelPresets[0].provider,'gemini');
 const added=s.app.modelPresets.slice(1);
 assert.deepEqual(Array.from(added.map(p=>p.model)),[
   'deepseek/deepseek-v4-flash-0731',
   'qwen/qwen3.7-flash',
   'xiaomi/mimo-v2.5',
   'gemini-3-flash-preview',
   'minimax/minimax-m3',
   'gemini-3.1-pro-preview',
   'anthropic/claude-sonnet-4.5',
   'anthropic/claude-sonnet-4.6',
   'anthropic/claude-opus-4.6'
 ]);
 assert.equal(added.every(p=>p.provider==='bao-credits'),true);
 assert.equal(added.every(p=>p.provider_label==='YoruBay AI 點數'),true);
 assert.equal(added.every(p=>p.base_url===cfg.baseUrl),true);
 assert.equal(added.some(p=>p.model==='openrouter/free'),false);
 assert.equal(added.some(p=>p.model==='gemini-3.1-flash-lite'),false);
 assert.equal(added.some(p=>p.model==='google/gemini-3.1-pro-preview'),false);
 assert.equal(added.some(p=>p.model==='anthropic/claude-opus-4.5'),false);
 assert.match(added[0].label,/超省長聊.*DeepSeek/);
 assert.match(added[3].label,/日常主力.*Gemini 3 Flash/);
 assert.match(added[4].label,/長篇世界.*MiniMax M3/);
 assert.match(added[7].label,/RP 高品質.*Sonnet 4\.6/);
 assert.match(added[8].label,/豪華.*Opus 4\.6/);
 assert.equal(s.window.BAOCreditsPilot.models.length,9);
});

test('uses logged-in YoruBay session token without copying it into request body',async()=>{
 const s=build();
 const session='yb_s_'+'S'.repeat(43);
 s.window.localStorage={getItem:key=>key==='yorubay:session'?session:null};
 const result=await s.api.send({...cfg,key:'__YORUBAY_ACCOUNT__',model:'gemini-3-flash-preview'},msgs);
 assert.equal(result.text,'測試成功');
 assert.equal(s.calls[0][1].headers.Authorization,'Bearer '+session);
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
