// Research-only benchmark. Never imported by the website.
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pipeline, env } from '@huggingface/transformers';
const [fixture, output] = process.argv.slice(2);
if (!fixture || !output) throw Error('usage: benchmark <fixture> <report>');
const data = JSON.parse(fs.readFileSync(fixture,'utf8'));
const model = 'Xenova/multilingual-e5-small';
const revision = '761b726';
const dtype = 'q8';
env.allowLocalModels = false;
env.cacheDir = process.env.MODEL_CACHE;
const start = performance.now();
const extractor = await pipeline('feature-extraction',model,{ revision, dtype, device:'cpu' });
const loadMs = performance.now()-start;
env.allowRemoteModels = false;
const timings = [];
async function vector(text) {
  const t = performance.now();
  const result = await extractor(text,{pooling:'mean',normalize:true});
  const v=Array.from(result.data);
  if(v.length!==384 || v.some(x=>!Number.isFinite(x))) throw Error('Invalid embedding');
  timings.push(performance.now()-t);
  return v;
}
const cosine=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
async function rank(groups) {
  const rows=[];
  for(const group of groups) {
    const passages=[];
    for(const [id,text] of group.passages) passages.push({id,v:await vector('passage: '+text)});
    for(const [query,expected] of group.queries) {
      const q=await vector('query: '+query);
      const ranked=passages.map(p=>({id:p.id,score:cosine(q,p.v)})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
      rows.push({group:group.id,query,expected,ranked});
    }
  }
  return rows;
}
function metrics(rows,threshold) {
  let tp=0,fp=0,fn=0,exact=0;
  for(const row of rows) {
    const actual=row.ranked.filter(x=>x.score>=threshold).slice(0,4).map(x=>x.id);
    const missing=row.expected.filter(x=>!actual.includes(x));
    const unexpected=actual.filter(x=>!row.expected.includes(x));
    tp+=actual.length-unexpected.length;fp+=unexpected.length;fn+=missing.length;
    exact+=Number(!missing.length&&!unexpected.length);
  }
  return {cases:rows.length,exact,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null};
}
const development=await rank(data.development);
// Calibrate only on development scores; no false positives there. A threshold
// above 1 is a valid abstain-all result, never treated as useful recall.
const candidates=[1.01,...new Set(development.flatMap(r=>r.ranked.map(x=>x.score)))];
const choices=candidates.map(threshold=>({threshold,...metrics(development,threshold)})).filter(x=>x.fp===0).sort((a,b)=>b.tp-a.tp||b.threshold-a.threshold);
const selected=choices[0];
if(!selected) throw Error('No valid threshold');
const holdout=await rank(data.holdout);
const holdoutMetrics=metrics(holdout,selected.threshold);
const sorted=timings.slice().sort((a,b)=>a-b);
const percentile=p=>sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
function bytes(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).reduce((sum,e)=>sum+(e.isDirectory()?bytes(path.join(dir,e.name)):e.isFile()?fs.statSync(path.join(dir,e.name)).size:0),0);
}
const report={scope:'synthetic visible-claim model ranking only; no runtime, device, or permission validation',model,revision,dtype,loadMs,cacheBytes:bytes(env.cacheDir),embeddingMs:{p50:percentile(.5),p95:percentile(.95)},rssBytes:process.memoryUsage().rss,development:selected,holdout:holdoutMetrics,eligibleForFurtherResearch:selected.tp>0&&holdoutMetrics.tp>0&&holdoutMetrics.fp===0,rows:{development,holdout}};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,rows:undefined}));
await extractor.dispose();
