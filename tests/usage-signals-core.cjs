const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { loadWorkerTestSource } = require('./helpers/worker-test-source.cjs');

// Run real SQLite statements and D1 batch transaction semantics, not SQL mocks.
function database() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    prepare(sql) {
      let params = [];
      return { bind(...values) {params=values; return this;},
        async all() {return {results:sqlite.prepare(sql).all(...params)};},
        execute() {return sqlite.prepare(sql).run(...params);} };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {const result=statements.map(statement=>statement.execute()); sqlite.exec('COMMIT'); return result;}
      catch(error) {sqlite.exec('ROLLBACK'); throw error;}
    }, sqlite
  };
  return db;
}
const full = loadWorkerTestSource().replace(/export\s+default\s+\{/, 'const worker = {');
const { worker } = new Function(full + '\nreturn {worker};')();
const today = () => new Date().toISOString().slice(0,10);
const request = (body, extra={}) => new Request('https://api.yorubay.com/usage-signals', {
  method:'POST', headers:{origin:'https://yorubay.com', ...extra}, body:JSON.stringify(body)
});
const packet = (token='a'.repeat(32), events=['started','first_success']) => ({v:1,day:today(),token,events});

function browser(saved={}, preference=null, navigator={}) {
  const storage = data=>({getItem:key=>data[key] ?? null,setItem:(key,value)=>{data[key]=value;}});
  const local = preference===null ? {} : {'yorubay-usage-signals-v1':preference};
  const calls=[], handlers={}, timers=new Map(); let timer=0;
  const owner={};
  const context = {
    Uint8Array, Set, Date, JSON, Number, Object, Array, Boolean, String,
    navigator, crypto:require('node:crypto').webcrypto,
    localStorage:storage(local),sessionStorage:storage(saved),
    fetch:async(...args)=>{calls.push(args);return {};},
    setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),
    addEventListener:(type,fn)=>{handlers[type]=fn;},
    App:{config:{},wrapShowView(id,fn){this.show=(name)=>fn.call(this,()=>{},name);}},
    GameState:{current:owner},
    API:{wrapSend(id,fn){this.send=(next,config={})=>fn(next,config,[]);}}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/usage-signals.js','utf8'),context);
  return {context,calls,saved,local,owner,handlers,timers};
}

(async()=>{
  const db=database(),env={DB:db,ADMIN_TOKEN:'test-admin',ALLOWED_ORIGIN:'https://yorubay.com'};
  let response=await worker.fetch(request(packet()),env);
  assert.equal(response.status,204);
  await worker.fetch(request(packet()),env);
  let rows=db.sqlite.prepare('SELECT * FROM usage_signal_days').all();
  assert.equal(rows[0].started,1); assert.equal(rows[0].batches,1,'duplicate payload must not count twice');
  for (const body of [{...packet(),account:'secret'}, {...packet(),events:['private title']}, {...packet(),events:['started','started']}, {...packet(),day:'2020-01-01'}]) {
    assert.equal((await worker.fetch(request(body),env)).status,400);
  }
  assert.equal((await worker.fetch(request(packet(),{cookie:'session=secret'}),env)).status,400);
  assert.equal((await worker.fetch(request(packet(),{origin:'https://evil.test'}),env)).status,403);
  assert.equal((await worker.fetch(request({...packet(),junk:'x'.repeat(600)}),env)).status,400);
  const blockedDb={prepare(){throw Error('must not touch DB');}};
  assert.equal((await worker.fetch(request(packet()),{DB:blockedDb,USAGE_SIGNALS_DISABLED:'true',ALLOWED_ORIGIN:'https://yorubay.com'})).status,204);
  assert.equal((await worker.fetch(new Request('https://api.yorubay.com/admin/usage-signals'),{DB:blockedDb,ADMIN_TOKEN:'test-admin'})).status,401);
  db.sqlite.prepare('UPDATE usage_signal_days SET batches=499').run();
  await worker.fetch(request(packet('b'.repeat(32),['five_turns'])),env);
  await worker.fetch(request(packet('c'.repeat(32),['five_turns'])),env);
  rows=db.sqlite.prepare('SELECT * FROM usage_signal_days').all();
  assert.equal(rows[0].batches,500); assert.equal(rows[0].five_turns,1,'cap rejects further writes');
  const report=await worker.fetch(new Request('https://api.yorubay.com/admin/usage-signals',{headers:{authorization:'Bearer test-admin'}}),env);
  const data=await report.json();
  assert.equal(data.rows.length,1); assert.equal(data.daily_batch_limit,500);
  assert.deepEqual(Object.keys(data.rows[0]).sort(),['day','batches','started','first_success','first_failure','five_turns'].sort());
  db.sqlite.prepare("INSERT INTO usage_signal_days(day) VALUES ('2020-01-01')").run();
  db.sqlite.prepare("INSERT INTO usage_signal_receipts VALUES ('2020-01-01','old')").run();
  await worker.fetch(request(packet('d'.repeat(32))),env);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM usage_signal_receipts WHERE day='2020-01-01'").get().n,0);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM usage_signal_days WHERE day='2020-01-01'").get().n,0);

  const b=browser();
  b.context.App.show('chat'); b.context.BAOUsageSignals.flush();
  assert.equal(b.calls.length,0,'default off');
  b.context.BAOUsageSignals.setEnabled(true);
  b.context.App.show('chat'); b.context.App.show('chat');
  await b.context.API.send(async()=>({text:'memory'}),{__memoryTask:true});
  await b.context.API.send(async()=>({text:'state'}),{__stateTask:true});
  await b.context.API.send(async()=>({text:'test'}),{__connectionTest:true});
  await b.context.API.send(async()=>({text:'helper'}),{__auxiliaryTask:true});
  await b.context.API.send(async()=>({text:'tool'}),{__storyTool:true});
  for (let i=0;i<4;i++) await b.context.API.send(async()=>({text:'PRIVATE STORY'}));
  b.context.BAOUsageSignals.flush();
  let payload=JSON.parse(b.calls[0][1].body);
  assert.deepEqual(payload.events,['started','first_success'],'helpers cannot reach fifth milestone');
  await b.context.API.send(async()=>({text:'PRIVATE STORY'}));
  b.context.BAOUsageSignals.flush();
  assert.deepEqual(JSON.parse(b.calls[1][1].body).events,['five_turns']);
  assert.equal(b.calls[0][1].credentials,'omit'); assert.equal(b.calls[0][1].referrerPolicy,'no-referrer');
  assert.notEqual(JSON.parse(b.calls[0][1].body).token,JSON.parse(b.calls[1][1].body).token);
  assert.ok(!JSON.stringify(b.calls).includes('PRIVATE STORY'));
  const reloaded=browser(b.saved,'yes');
  reloaded.context.App.show('chat'); reloaded.context.BAOUsageSignals.flush();
  assert.equal(reloaded.calls.length,0,'refresh preserves tab/day dedup');
  const error=new Error('PRIVATE ERROR');
  await assert.rejects(b.context.API.send(async()=>{throw error;}),/PRIVATE ERROR/);
  b.context.BAOUsageSignals.setEnabled(false); b.context.BAOUsageSignals.flush();
  assert.equal(b.calls.length,2,'opting out drops pending errors');
  const dnt=browser({},'yes',{doNotTrack:'1'});
  dnt.context.App.show('chat');dnt.context.BAOUsageSignals.flush();assert.equal(dnt.calls.length,0);
  const gpc=browser({},'yes',{globalPrivacyControl:true});assert.equal(gpc.context.BAOUsageSignals.enabled(),false);
  const stale=browser({},'yes');
  await stale.context.API.send(async()=>{stale.context.GameState.current={};return {text:'late'};});
  stale.context.BAOUsageSignals.flush();assert.equal(stale.calls.length,0,'old story results ignored');
  const offline=browser({},'yes');offline.context.fetch=()=>{throw Error('offline');};
  offline.context.App.show('chat');assert.doesNotThrow(()=>offline.context.BAOUsageSignals.flush());
  assert.equal((await offline.context.API.send(async()=>({text:'still plays'}))).text,'still plays');
  const aborted=browser({},'yes');
  await assert.rejects(aborted.context.API.send(async()=>{throw Object.assign(Error('cancel'),{code:'BAO_ABORTED'});}));
  aborted.context.BAOUsageSignals.flush();assert.equal(aborted.calls.length,0);
  console.log('PASS usage signals: real SQL dedup/cap/retention, route auth/validation, consent, refresh, helper exclusion and failure isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
