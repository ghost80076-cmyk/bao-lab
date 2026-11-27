'use strict';
// Public human-speech benchmark. This is a comparative research report,
// not a claim that any profile meets production quality.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {chromium}=require('@playwright/test');
const {candidateFor}=require('./candidate.cjs');
const origin='http://127.0.0.1:8787';
const [profile,dir,out]=process.argv.slice(2);
const normalize=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}]+/gu,' ').trim().replace(/\s+/gu,' ');
function tokens(s,unit){const n=normalize(s);return unit==='word'?n.split(' ').filter(Boolean):Array.from(n.replace(/\s/gu,''));}
function errors(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j])));row=next;}return row.at(-1);}
function score(ref,hyp,unit){const a=tokens(ref,unit),b=tokens(hyp,unit);assert.ok(a.length);return {edits:errors(a,b),referenceUnits:a.length};}
async function main(){
  candidateFor(profile);
  const corpus=JSON.parse(fs.readFileSync(path.join(dir,'corpus.json'),'utf8'));
  const privateOnly=corpus.privateOnly===true;
  assert.equal(corpus.samples.length,privateOnly?30:5);
  if(privateOnly&&process.env.GITHUB_ACTIONS==='true')throw Error('Private corpus cannot run on public CI');
  if(profile==='moonshine-tiny'&&corpus.language!=='english')throw Error('English-only candidate');
  const blocked=[],samples=[];
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const req=route.request();
      if(new URL(req.url()).origin===origin&&req.method()==='GET')return route.continue();
      blocked.push({url:req.url(),method:req.method()});return route.abort();
    });
    const page=await context.newPage();
    await page.goto(origin);
    await page.locator('#language').selectOption(corpus.language);
    for(const entry of corpus.samples){
      const file=path.join(dir,entry.file);
      assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),entry.sha256);
      let record={...entry};
      try{
        await page.locator('#audio').setInputFiles(file);
        await page.locator('#start').click();
        await page.locator('#start:enabled').waitFor({timeout:310000});
        const status=await page.textContent('#status');
        if(!/Complete/.test(status))throw Error(status);
        const result=JSON.parse(await page.textContent('#output'));
        assert.equal(result.profile,profile);
        assert.equal(result.frames,Math.round(entry.seconds*16000));
        assert.equal(result.device,'wasm');
        assert.ok(Number.isFinite(result.inferenceMs)&&result.inferenceMs>=0);
        assert.ok(Number.isFinite(result.loadMs)&&result.loadMs>=0);
        record={...record,...result,cer:score(entry.reference,result.text,'char'),
          wer:corpus.language==='english'||corpus.language==='korean'?score(entry.reference,result.text,'word'):null,
          empty:!result.text.trim()};
      }catch(e){record.error=String(e.message||e);await page.reload();await page.locator('#language').selectOption(corpus.language);}
      samples.push(record);
      if(!privateOnly)console.log(JSON.stringify({profile,config:corpus.config,row:entry.row,cer:record.cer,wer:record.wer,error:record.error,loadMs:record.loadMs,inferenceMs:record.inferenceMs}));
    }
    function aggregate(key){const scored=samples.filter(s=>s[key]);const edits=scored.reduce((n,s)=>n+s[key].edits,0),units=scored.reduce((n,s)=>n+s[key].referenceUnits,0);return {scored:scored.length,edits,units,rate:units?edits/units:null};}
    const report={profile,engine:'chromium',version:browser.version(),corpus,blocked,samples,cer:aggregate('cer'),wer:aggregate('wer'),runtimeFailures:samples.filter(s=>s.error).length,empty:samples.filter(s=>s.empty).length,scope:'5 deterministic clean public test rows per locale, no Taiwan accent, warm cache, device RAM, noisy or mixed-language claim'};
    const exported=privateOnly?{profile,engine:report.engine,version:report.version,locale:'zh-TW',count:samples.length,cer:report.cer,wer:report.wer,runtimeFailures:report.runtimeFailures,empty:report.empty,blockedCount:blocked.length,scope:'private 30-sample Taiwan Mandarin test; strict Traditional script; no recordings, references or transcripts exported'}:report;
    fs.writeFileSync(out,JSON.stringify(exported,null,2));
    assert.deepEqual(blocked,[]);
    assert.equal(report.runtimeFailures,0);
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
