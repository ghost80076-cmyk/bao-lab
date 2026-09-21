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
  return {app,api,calls,options,window};
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
test('summary routes separate from chat, connection tests use 1024 tokens, and BYOK stays available',async()=>{
 const s=build(); await s.api.send({...cfg,model:'gemini-3.1-flash-lite',__memoryTask:true},msgs);
 assert.equal(JSON.parse(s.calls[0][1].body).request_kind,'summary');
 await s.api.send({...cfg,__connectionTest:true,maxOutputTokens:16},msgs);
 assert.equal(JSON.parse(s.calls[1][1].body).max_output_tokens,1024);
 const normal=await s.api.send({type:'gemini',key:'own-key',model:'abc',baseUrl:'https://example.org'},msgs);
 assert.equal(normal.text,'BYOK works'); assert.equal(s.calls.length,2);
});
test('refuses player-token leakage to other provider and wrong URL/models',async()=>{
 const s=build();s.app.config.api=cfg;
 await assert.rejects(()=>s.api.send({type:'openrouter',key:token,baseUrl:'https://openrouter.ai/api/v1'},msgs),/不可沿用/);
 await assert.rejects(()=>s.api.send({...cfg,baseUrl:'https://evil.test/chat'},msgs),/固定後端/);
 await assert.rejects(()=>s.api.send({...cfg,model:'gemini-3.1-pro-preview'},msgs),/指定的兩款/);
 assert.equal(s.calls.length,0);
});
test('allows long prompts under 96 KB, rejects oversized prompts before sending',async()=>{
 const s=build();
 await s.api.send(cfg,[{role:'user',content:'x'.repeat(25000)}]);
 assert.equal(s.calls.length,1);
 await assert.rejects(()=>s.api.send(cfg,[{role:'user',content:'x'.repeat(97000)}]),/96 KB/);
 assert.equal(s.calls.length,1);
});
test('propagates quota and upstream errors without exposing player keys',async()=>{
 const auth=build({ok:false,status:401,body:{error:'unauthorized'}});
 await assert.rejects(()=>auth.api.send(cfg,msgs),/玩家金鑰無效/);
 const insufficient=build({ok:false,status:402,body:{error:'insufficient_credits'}});
 await assert.rejects(()=>insufficient.api.send(cfg,msgs),/額度不足/);
 const rateLimit=build({ok:false,status:502,body:{error:'provider_rate_limited',upstream_http_status:429}});
 await assert.rejects(()=>rateLimit.api.send(cfg,msgs),/Google Gemini 回報 API 速率或免費配額限制/);
 const empty=build({ok:false,status:502,body:{error:'provider_empty_text',finish_reason:'MAX_TOKENS'}});
 await assert.rejects(()=>empty.api.send(cfg,msgs),/MAX_TOKENS/);
});
test('registers both model presets without replacing existing provider',()=>{
 const s=build();s.app.populateAPIControls();
 assert.equal(s.app.modelPresets.length,3);
 assert.equal(s.app.modelPresets[0].provider,'gemini');
 assert.equal(s.app.modelPresets[1].model,'gemini-3-flash-preview');
 assert.equal(s.app.modelPresets[2].model,'gemini-3.1-flash-lite');
});