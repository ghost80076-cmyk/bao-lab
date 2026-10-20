'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../js/author-profile-core.js');
const code=fs.readFileSync('js/author-profile.js','utf8');
const author={id:'writer',name:'夜裡的作者',support_links:[{label:'支持創作',url:'https://example.com/support'}]};
const work={id:'new-story',title:'新故事',author_id:'writer',published_version:2,rating:'general',tags:[]};
const manifest={pages:[{file:'data/community-one.json'},{file:'data/community-two.json'}]};
async function run(search='?id=writer',overrides={}){
 const routes={'data/authors.json':{authors:[author]},'data/characters.json':[work],'data/character-catalog/community/manifest.json':manifest,'data/community-one.json':[],'data/community-two.json':[],...overrides};
 const requests=[],handlers={},root={innerHTML:'',addEventListener(type,handler){handlers[type]=handler;}};
 const ctx={URLSearchParams,document:{title:'',getElementById(){return root;}},location:{search},BAOAuthorProfileCore:core,BAOContentPreferences:{canExpose:item=>item.rating!=='adult'},async fetch(url,options){
  requests.push({url,options});const value=routes[url];
  if(value instanceof Error)throw value;
  if(typeof value==='function')return value();
  assert.notEqual(value,undefined,'unexpected fetch '+url);
  return{ok:true,json:async()=>structuredClone(value)};
 }};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();
 return{root,ctx,requests,routes,async retry(){handlers.click({target:{closest:()=>true}});await settle();}};
}
(async()=>{
 let page=await run();assert.match(page.root.innerHTML,/1 部公開作品/);assert.match(page.root.innerHTML,/v2/);assert.doesNotMatch(page.root.innerHTML,/data-author-retry/);
 for(const broken of [new Error('PRIVATE_NETWORK_ERROR'),()=>({ok:false}),()=>({ok:true,json:async()=>{throw Error('PRIVATE_PARSE_ERROR');}}),null,{authors:null},{authors:[{}]}]){
  page=await run('?id=writer',{'data/authors.json':broken});assert.match(page.root.innerHTML,/作者資料暫時無法載入/);assert.doesNotMatch(page.root.innerHTML,/找不到|沒有公開作者|PRIVATE_/);
  page.routes['data/authors.json']={authors:[author]};await page.retry();assert.match(page.root.innerHTML,/1 部公開作品/);assert.doesNotMatch(page.root.innerHTML,/data-author-retry/);
 }
 page=await run('?id=missing');assert.match(page.root.innerHTML,/找不到這位作者/);assert.doesNotMatch(page.root.innerHTML,/data-author-retry/);
 page=await run('?id=bad!');assert.match(page.root.innerHTML,/作者 ID 格式無效/);assert.equal(page.requests.length,0);
 for(const source of ['data/characters.json','data/character-catalog/community/manifest.json','data/community-one.json']){
  page=await run('?id=writer',{[source]:new Error('failed')});assert.match(page.root.innerHTML,/清單可能不完整/);assert.match(page.root.innerHTML,/支持創作/);
  assert.match(page.root.innerHTML,/已載入 [01] 部公開作品/);assert.doesNotMatch(page.root.innerHTML,/目前還沒有公開作品/);
 }
 for(const broken of [{items:[]},[{}],[null]]){
  page=await run('?id=writer',{'data/characters.json':broken,'data/community-two.json':[work]});assert.match(page.root.innerHTML,/已載入 1 部公開作品/);assert.match(page.root.innerHTML,/清單可能不完整/);
 }
 page=await run('?id=writer',{'data/characters.json':[],'data/community-one.json':new Error('failed'),'data/community-two.json':[work]});
 assert.match(page.root.innerHTML,/已載入 1 部公開作品/);assert.match(page.root.innerHTML,/新故事/);
 page.routes['data/community-one.json']=[];await page.retry();assert.match(page.root.innerHTML,/1 部公開作品/);assert.doesNotMatch(page.root.innerHTML,/data-author-retry/);
 page=await run('?id=writer',{'data/character-catalog/community/manifest.json':{pages:[null]}});assert.match(page.root.innerHTML,/新故事/);assert.match(page.root.innerHTML,/清單可能不完整/);
 page=await run('?id=writer',{'data/characters.json':[],'data/community-two.json':[]});assert.match(page.root.innerHTML,/目前還沒有公開作品/);assert.doesNotMatch(page.root.innerHTML,/data-author-retry/);
 page=await run('',{'data/community-two.json':new Error('failed')});assert.match(page.root.innerHTML,/已載入 1 部作品/);assert.match(page.root.innerHTML,/夜裡的作者/);
 page=await run('?id=writer',{'data/community-two.json':[work,{...work,id:'adult-only',title:'不可顯示的作品',rating:'adult'}]});assert.match(page.root.innerHTML,/1 部公開作品/);assert.doesNotMatch(page.root.innerHTML,/不可顯示的作品/);
 assert.ok(page.requests.every(request=>request.options.cache==='no-store'),'retry must request current metadata');
 console.log('PASS actual author runtime: distinct load failure/missing/empty states, partial catalog preservation, retry recovery, invalid metadata and preference filtering');
})().catch(error=>{console.error(error);process.exitCode=1;});
