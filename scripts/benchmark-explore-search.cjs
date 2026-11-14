// Run with node --expose-gc scripts/benchmark-explore-search.cjs. No network/provider calls.
const fs=require('node:fs');const vm=require('node:vm');const {execFileSync}=require('node:child_process');const {performance}=require('node:perf_hooks');
const core=require('../js/explore-discovery-core.js');
const baseline=execFileSync('git',['show','f6d8983c0f9196f4b912c498f56eb09e4195798c:js/explore-discovery.js'],{encoding:'utf8'});
const candidate=fs.readFileSync('js/explore-discovery.js','utf8');
const official=JSON.parse(fs.readFileSync('data/characters.json'));
const pages=JSON.parse(fs.readFileSync('data/character-catalog/community/manifest.json')).pages;
const catalog=[...new Map([...official,...pages.flatMap(p=>JSON.parse(fs.readFileSync(p.file)))].map(x=>[x.id,x])).values()];
const results=[];
for(const count of [75,1000,5000]){
  const works=Array.from({length:count},(_,i)=>({...catalog[i%catalog.length],id:'work-'+i,source:'built-in'}));
  const library=core.normalizeLibrary({favorites:works.slice(-100).map(w=>w.id),recent:works.slice(-60).map((w,i)=>({id:w.id,viewedAt:Date.now()-i,seenUpdatedAt:1}))});
  for(const [mode,source]of [['before',baseline],['after',candidate]]){
    const state={query:'韓系',category:'all',rating:'all',scope:'all',sort:'updated'};
    const ctx={core,App:{characters:works,characterManifest:works},library,state,window:{BAOContentPreferences:{canExpose:()=>true}}};
    vm.createContext(ctx);
    const extra=baseline.slice(baseline.indexOf('  const manifestEntry ='),baseline.indexOf('  const authorHref'));
    const start=source.indexOf('  const currentMatches =');
    const end=source.indexOf(mode==='before'?'  const decorateCards':'  const requestCompleteCatalog',start);
    vm.runInContext(extra+source.slice(start,end)+';globalThis.run=currentMatches;',ctx);
    ctx.run();global.gc?.();const heapBefore=process.memoryUsage().heapUsed;
    const samples=[];for(let i=0;i<7;i++){let t=performance.now();ctx.run();samples.push(performance.now()-t)}
    global.gc?.();const retainedHeapDeltaBytes=process.memoryUsage().heapUsed-heapBefore;
    samples.sort((a,b)=>a-b);
    results.push({mode,count,p50Ms:+samples[3].toFixed(3),p95Ms:+samples[6].toFixed(3),retainedHeapDeltaBytes});
  }
}
console.log(JSON.stringify({runtime:process.version,scenario:'shared catalog filter+updated sort, 60 recents, 100 favorites; seven warm samples; GC retained delta is noisy, not peak heap',results},null,2));
