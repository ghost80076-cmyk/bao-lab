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
  const window={};
  const context={API:api,App:app,document,window,TextEncoder,MutationObserver:class{observe(){}},fetch:async(url,opt)=>{calls.push([url,opt]);return {ok:response.ok,status:response.status,json:async()=>response.body}}};
  vm.runInNewContext(code,context);
  return {app,api,calls,options,window,elements};
}
const token='bao_'+'A'.repeat(43);
const cfg={type:'bao-credits',route:'bao-credits',protocol:'openai',baseUrl:'https://bao-lab-credits-api.ghost80076.workers.dev/chat',key:token,model:'gemini-3-flash-preview'};
const msgs=[{role:'user',content:'你好'}];

test('pilot sends player-token request to fixed Worker, never admin/provider keys',async()=>{
 const s=build(); const result=await s.api.send(cfg,msgs);
 assert.equal(result.text,'測試成功'); assert.equal(s.calls.length,1);
 assert.equal(result.credits.charged_credits,1);
 const [url,opt]=s.calls[0]; assert.equal(url,cfg.baseUrl); assert.equal(opt.headers.Authorization,'Bearer '+token);
 assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(opt.body))),{provider:'gemini',model:'gemini-3-flash-preview',request_kind:'chat',messages:msgs,max_output_tokens:6144});
 assert.equal(opt.body.includes(token),false);
});
test('Gemini Pro uses OpenRouter upstream behind same Worker, same player token, bounded output',async()=>{
 const s=build(); const pro={...cfg,model:'google/gemini-3.1-pro-preview',maxOutputTokens:8192};
 const result=await s.api.send(pro,msgs);
 assert.equal(result.text,'測試成功');
 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0][0],cfg.baseUrl);
 assert.equal(s.calls[0][1].headers.Authorization,'Bearer '+token);
 assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(s.calls[0][1].body))),{provider:'openrouter',model:'google/gemini-3.1-pro-preview',request_kind:'chat',messages:msgs,max_output_tokens:2048});
 assert.equal(s.calls[0][1].body.includes(token),false);
 assert.equal(s.calls[0][1].body.includes('OPENROUTER_API_KEY'),false);
});
test('Claude Sonnet and Opus invitation presets route through OpenRouter with the same player token',async()=>{
 const s=build();
 for (const model of ['anthropic/claude-sonnet-4.5','anthropic/claude-sonnet-4.6','anthropic/claude-opus-4.5','anthropic/claude-opus-4.6']) {
   await s.api.send({...cfg,model,maxOutputTokens:4096},msgs);
 }
 assert.equal(s.calls.length,4);
 for (let i=0;i<s.calls.length;i++) {
   const body=JSON.parse(s.calls[i][1].body);
   assert.equal(body.provider,'openrouter');
   assert.equal(body.model,['anthropic/claude-sonnet-4.5','anthropic/claude-sonnet-4.6','anthropic/claude-opus-4.5','anthropic/claude-opus-4.6'][i]);
   assert.equal(body.max_output_tokens,2048);
   assert.equal(s.calls[i][1].headers.Authorization,'Bearer '+token);
 }
});
test('summary routes separate from chat, connection tests use 1024 tokens, and BYOK stays available',async()=>{
 const s=build(); await s.api.send({...cfg,model:'gemini-3.1-flash-lite',__memoryTask:true},msgs);
 assert.equal(JSON.parse(s.calls[0][1].body).request_kind,'summary');
 await s.api.send({...cfg,__connectionTest:true,maxOutputTokens:16},msgs);
 assert.equal(JSON.parse(s.calls[1][1].body).max_output_tokens,1024);
 await s.api.send({...cfg,model:'google/gemini-3.1-pro-preview',__stateTask:true},msgs);
 assert.equal(JSON.parse(s.calls[2][1].body).request_kind,'status');
 const normal=await s.api.send({type:'gemini',key:'own-key',model:'abc',baseUrl:'https://example.org'},msgs);
 assert.equal(normal.text,'BYOK works'); assert.equal(s.calls.length,3);
});
test('refuses player-token leakage to other provider and wrong URL/models',async()=>{
 const s=build();s.app.config.api=cfg;
 await assert.rejects(()=>s.api.send({type:'openrouter',key:token,baseUrl:'https://openrouter.ai/api/v1'},msgs),/不可沿用/);
 await assert.rejects(()=>s.api.send({...cfg,baseUrl:'https://evil.test/chat'},msgs),/固定後端/);
 await assert.rejects(()=>s.api.send({...cfg,model:'gemini-3.1-pro-preview'},msgs),/指定的邀請制模型/);
 assert.equal(s.calls.length,0);
});
test('allows long prompts under 96 KB, rejects oversized prompts before sending',async()=>{
 const s=build();
 await s.api.send(cfg,[{role:'user',content:'x'.repeat(25000)}]);
 assert.equal(s.calls.length,1);
 await assert.rejects(()=>s.api.send(cfg,[{role:'user',content:'x'.repeat(97000)}]),/96 KB/);
 assert.equal(s.calls.length,1);
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
 await assert.rejects(()=>rateLimit.api.send({...cfg,model:'google/gemini-3.1-pro-preview'},msgs),/OpenRouter 回報 API 速率或配額限制/);
 const empty=build({ok:false,status:502,body:{error:'provider_empty_text',finish_reason:'MAX_TOKENS'}});
 await assert.rejects(()=>empty.api.send(cfg,msgs),/MAX_TOKENS/);
});
test('registers all seven invitation model presets without replacing existing provider or duplication',()=>{
 const s=build();s.app.populateAPIControls();s.app.populateAPIControls();
 assert.equal(s.app.modelPresets.length,8);
 assert.equal(s.app.modelPresets[0].provider,'gemini');
 const added=s.app.modelPresets.slice(1);
 assert.deepEqual(Array.from(added.map(p=>p.model)),[
   'gemini-3-flash-preview',
   'gemini-3.1-flash-lite',
   'google/gemini-3.1-pro-preview',
   'anthropic/claude-sonnet-4.5',
   'anthropic/claude-sonnet-4.6',
   'anthropic/claude-opus-4.5',
   'anthropic/claude-opus-4.6'
 ]);
 assert.equal(added.every(p=>p.provider==='bao-credits'),true);
 assert.equal(added.every(p=>p.base_url===cfg.baseUrl),true);
 assert.match(added[4].label,/Sonnet 4\.6/);
 assert.match(added[6].label,/Opus 4\.6/);
 assert.equal(s.window.BAOCreditsPilot.models.length,7);
});
