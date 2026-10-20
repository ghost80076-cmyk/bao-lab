'use strict';
const assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path');
const {collect}=require('../js/admin-publication-export.js');
const sample=id=>({id,pr_number:id+100,work_id:'work-'+id,author_id:'writer',published_version:1,status:'pending_review',submitted_at:'2026-10-20 00:00:00',snapshot_json:'PRIVATE_PROMPT',pr_url:'PRIVATE_URL',admin_token:'PRIVATE_TOKEN'});
const page=(rows,as_of_id,has_more=false)=>({schema_version:1,rows,as_of_id,has_more,next_after_id:has_more?rows.at(-1).id:null,captured_at:'2026-10-20T00:00:00.000Z'});
function database(rows,{missing=false,broken=false}={}){
 const queries=[];return{queries,prepare(sql){assert.match(sql,/^SELECT /,'GET must not create or write tables');assert.doesNotMatch(sql,/snapshot_json|pr_url/);queries.push(sql);let args=[];return{bind(...values){args=values;return this;},async first(){if(missing)throw Error('D1_ERROR: no such table: work_license_submissions: SQLITE_ERROR');return{max_id:rows.at(-1)?.id??null};},async all(){if(missing)throw Error('no such table: work_license_submissions');if(broken){const error=Error('PRIVATE_DB_ERROR');error.httpStatus=500;throw error;}const [after,bound,limit]=args;assert.equal(args.length,3);return{success:true,results:rows.filter(r=>r.id>after&&r.id<=bound).slice(0,limit)};},run(){throw Error('Unexpected write');}};}};
}
(async()=>{
 const {adminPublicationRoute}=await import(pathToFileURL(path.resolve('workers/bao-lab-credits-api/modules/admin-publication-routes.js')).href);
 const {adminRoute}=await import(pathToFileURL(path.resolve('workers/bao-lab-credits-api/modules/admin-routes.js')).href);
 const endpoint='/admin/characters/license-submissions';
 let touched=false;const never={prepare(){touched=true;throw Error('Unauthorized DB access');}};
 for(const headers of [{},{authorization:'Bearer wrong'},{authorization:'Bearer player-session'}]){
  const req=new Request('https://worker.test'+endpoint,{headers});assert.equal((await adminRoute(req,new URL(req.url),{ADMIN_TOKEN:'admin'},never)).status,401);
 }assert.equal(touched,false);
 const get=(query,db,method='GET')=>{const req=new Request('https://worker.test'+endpoint+query,{method,headers:{authorization:'Bearer admin'}});return adminRoute(req,new URL(req.url),{ADMIN_TOKEN:'admin'},db);};
 const rows=[sample(1),sample(3),sample(6)],db=database(rows);
 let response=await get('?limit=2',db);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const first=await response.json();assert.deepEqual(first.rows.map(r=>r.id),[1,3]);assert.equal(first.as_of_id,6);assert.equal(first.next_after_id,3);assert.equal(first.has_more,true);assert.doesNotMatch(JSON.stringify(first),/PRIVATE_/);
 rows.push(sample(7));const last=await (await get('?limit=2&after_id=3&as_of_id=6',db)).json();assert.deepEqual(last.rows.map(r=>r.id),[6]);assert.equal(last.next_after_id,null);assert.equal(last.has_more,false);
 const authExport=await collect(async url=>{const r=await get(url.slice(endpoint.length),db);assert.equal(r.status,200);return r.json();},{pageSize:2});assert.deepEqual(authExport.rows.map(r=>r.id),[1,3,6,7]);assert.equal(authExport.complete,true);assert.doesNotMatch(JSON.stringify(authExport),/PRIVATE_/);
 for(const query of ['?limit=0','?limit=201','?after_id=-1','?after_id=1','?after_id=4&as_of_id=3','?as_of_id=1e3','?limit=2.5','?after_id=9007199254740992']){const empty=database([]);assert.equal((await get(query,empty)).status,400);assert.equal(empty.queries.length,0);}
 assert.equal((await get('',never,'POST')).status,405);assert.equal(touched,false);
 assert.equal((await get('',database([],{missing:true}))).status,409);
 response=await get('',database([sample(1)],{broken:true}));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PRIVATE_/);
 assert.equal((await get('',database([{...sample(1),published_version:'1'}]))).status,503);
 const empty=await (await get('',database([]))).json();assert.deepEqual(empty.rows,[]);assert.equal(empty.as_of_id,0);
 assert.equal((await collect(async()=>page([],0))).rows.length,0);
 for(const mutate of [p=>{p.next_after_id=0;},p=>{p.rows=[{...sample(1),id:0}];},p=>{p.rows.push(sample(1));},p=>{p.as_of_id=-1;},p=>{p.rows[0].author_id='';}]){
  const p=page([sample(1)],1);mutate(p);await assert.rejects(()=>collect(async()=>p),/invalid_export_page/);
 }
 let calls=0;await assert.rejects(()=>collect(async()=>{calls++;return calls===1?page([sample(1)],3,true):page([sample(2)],4);}),/invalid_export_page/);
 await assert.rejects(()=>collect(async()=>page([sample(1)],2,true),{maxPages:1}),/export_page_limit/);
 await assert.rejects(()=>collect(async()=>{throw Error('offline');}),/offline/);
 console.log('PASS authenticated read-only submission export: bounded pagination, inserts, no table writes, missing vs empty, field allowlist and failed/incomplete collector denial');
})().catch(error=>{console.error(error);process.exitCode=1;});
