'use strict';
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const sqlite = new DatabaseSync(':memory:');
const db = {prepare(sql) {
  let args = [];
  const query = {bind(...values) {args=values;return query;},
    async run() {return sqlite.prepare(sql).run(...args);},
    async all() {return {results:sqlite.prepare(sql).all(...args)};}};
  return query;
}};
const load = name => import(pathToFileURL(path.join(__dirname,'../workers/bao-lab-credits-api/modules',name+'.js')).href);
(async () => {
  const {recordRequestTrace,reconciliation} = await load('request-trace');
  assert.equal(await recordRequestTrace(db,'r1',{generationId:'gen-abc12345',route:'aws_relay',elapsedMs:123,attemptCount:2,text:'DO_NOT_STORE',key:'SECRET'}),true);
  await recordRequestTrace(db,'r1',{generationId:'overwrite',route:'direct_openrouter',elapsedMs:999,attemptCount:1});
  const trace=sqlite.prepare('SELECT * FROM api_request_traces').get();
  assert.equal(trace.generation_id,'gen-abc12345');
  assert.equal(trace.attempt_count,2);
  assert.doesNotMatch(JSON.stringify(trace),/SECRET|DO_NOT_STORE|overwrite/);
  await recordRequestTrace(db,'bad',{generationId:'https://secret.test/key',route:'https://secret',elapsedMs:Infinity,attemptCount:-1});
  const bad=sqlite.prepare("SELECT * FROM api_request_traces WHERE request_id='bad'").get();
  assert.equal(bad.generation_id,null);assert.equal(bad.route,null);assert.equal(bad.elapsed_ms,null);
  const report = reconciliation({billing_mode:'cost_usd_v2',status:'ok',settled_cost_microusd:150,
    provider_cost_microusd:100,ledger_entries:1,ledger_amount_microusd:-150});
  assert.equal(report.wallet_check,'matched');assert.equal(report.reported_margin_microusd,50);
  assert.equal(report.invoice_check,'not_reconciled');
  assert.equal(reconciliation({billing_mode:'cost_usd_v2',status:'ok',settled_cost_microusd:150,ledger_entries:2,ledger_amount_microusd:-300}).wallet_check,'mismatch');
  assert.equal(reconciliation({billing_mode:'cost_usd_v2',status:'unverified_refunded',settled_cost_microusd:0,ledger_entries:0}).wallet_check,'refunded');
  assert.equal(reconciliation({billing_mode:'raw_tokens_v1',settled_cost_microusd:5}).reported_margin_microusd,null);
  assert.equal(reconciliation({billing_mode:'cost_usd_v2',status:'ok',settled_cost_microusd:0,provider_cost_microusd:null,ledger_entries:1,ledger_amount_microusd:0}).reported_margin_microusd,null);

  // Execute the real admin JOIN against SQLite, including cross-player ledger isolation.
  sqlite.exec(`CREATE TABLE api_usage(request_id TEXT PRIMARY KEY, player_id TEXT, provider TEXT,model TEXT,request_kind TEXT,
    input_tokens INTEGER,fresh_input_tokens INTEGER,cached_tokens INTEGER,cache_write_tokens INTEGER,output_tokens INTEGER,reasoning_tokens INTEGER,
    provider_cost_microusd INTEGER,cost_microusd INTEGER,settled_cost_microusd INTEGER,balance_before_microusd INTEGER,balance_after_microusd INTEGER,
    billing_mode TEXT,pricing_version TEXT,status TEXT,created_at TEXT);
    CREATE TABLE wallet_ledger(request_id TEXT,player_id TEXT,entry_type TEXT,amount_microusd INTEGER);`);
  const player='503f62e8-3777-43c9-b7ef-a7934aa45ed4';
  sqlite.prepare(`INSERT INTO api_usage(request_id,player_id,billing_mode,status,settled_cost_microusd,provider_cost_microusd,created_at)
    VALUES ('r1',?,'cost_usd_v2','ok',150,100,'2026-10-19')`).run(player);
  sqlite.prepare("INSERT INTO wallet_ledger VALUES ('r1',?,'usage',-150)").run(player);
  sqlite.exec("INSERT INTO wallet_ledger VALUES ('r1','other-player','usage',-200)");
  const {adminUsageRoute}=await load('admin-usage-routes');
  const url=new URL('https://worker.test/admin/usage?player_id='+player);
  const response=await adminUsageRoute(new Request(url),url.pathname,url,db);
  const row=(await response.json()).usage[0];
  assert.equal(row.wallet_check,'matched');assert.equal(row.ledger_entries,1);
  assert.equal(row.generation_id,'gen-abc12345');assert.equal(row.transport_route,'aws_relay');
  assert.equal(row.reported_margin_microusd,50);

  const {providerCall}=await load('provider-transport');
  const previous=global.fetch;
  try {
    const messages=[{role:'user',content:'hello'}];
    const env={OPENROUTER_API_KEY:'secret',MODELS_JSON:JSON.stringify([{provider:'openrouter',model:'openai/test',input_microusd_per_million:1,output_microusd_per_million:1}])};
    for (const cost of [undefined,null,'',0,0.001]) {
      global.fetch=async()=>new Response(JSON.stringify({id:'gen-test12345',choices:[{message:{content:'OK'}}],usage:{prompt_tokens:10,completion_tokens:1,cost}}));
      const result=await providerCall(env,'openrouter','openai/test',messages,10);
      assert.equal(result.providerCost, cost === undefined || cost === null || cost === '' ? null : cost);
      assert.equal(result.route,'direct_openrouter');assert.equal(result.attemptCount,1);assert.ok(result.elapsedMs>=0);
    }
  } finally {global.fetch=previous;}
  console.log('PASS request traces, SQLite wallet correlation, invoice distinction and unknown-versus-zero provider cost');
})().catch(error=>{console.error(error);process.exitCode=1;});
