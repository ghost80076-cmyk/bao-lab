'use strict';
// Developer-only loopback lab. Never imported by the story application.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {verify}=require('./voice-p2-verify-weights.cjs');
const revision='ff4177021cc41f7db950912b73ea4fdf7d01d8e7';
const weights=Object.freeze({
 'onnx/encoder_model_quantized.onnx':'2af4a414ca47aa30f61246017e5fe82b0a8d229281d1255ba666a2a7f6b84d19',
 'onnx/decoder_model_merged_quantized.onnx':'25e807a962b6349356d0ea5d0dfe530b7e5bf0e2a484aeca0359d03143faddd3'
});
function readWav(buffer){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<44||buffer.byteLength>1100000)throw Error('Invalid WAV size');
 const d=new DataView(buffer),tag=i=>String.fromCharCode(...new Uint8Array(buffer,i,4));
 if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||d.getUint32(4,true)+8!==d.byteLength)throw Error('Invalid WAV container');
 let format=false,data=null;
 for(let i=12;i<d.byteLength;){
  if(i+8>d.byteLength)throw Error('Truncated WAV chunk');
  const n=d.getUint32(i+4,true),start=i+8,end=start+n,next=end+(n%2);
  if(next>d.byteLength)throw Error('Truncated WAV data');
  if(tag(i)==='fmt '){
   if(format||n<16||d.getUint16(start,true)!==1||d.getUint16(start+2,true)!==1||d.getUint32(start+4,true)!==16000||d.getUint32(start+8,true)!==32000||d.getUint16(start+12,true)!==2||d.getUint16(start+14,true)!==16)throw Error('Require mono 16 kHz PCM16 WAV');
   format=true;
  }else if(tag(i)==='data'){
   if(data||n<2||n%2||n>960000)throw Error('Require 0–30 seconds PCM16');
   data=[start,n];
  }
  i=next;
 }
 if(!format||!data)throw Error('Missing WAV format or audio');
 const samples=new Float32Array(data[1]/2);
 for(let i=0;i<samples.length;i++)samples[i]=d.getInt16(data[0]+i*2,true)/32768;
 return samples;
}
function browser(){
 const $=id=>document.getElementById(id);
 let active=null;
 function finish(job,msg){
  if(active!==job)return;
  active=null;clearTimeout(job.timer);job.worker?.terminate();
  $('start').disabled=false;$('stop').disabled=true;$('status').textContent=msg;
 }
 $('stop').onclick=()=>{if(active)finish(active,'Cancelled; worker released.');};
 window.addEventListener('pagehide',()=>{if(active)finish(active,'Closed');});
 $('start').onclick=async()=>{
  if(active)return;
  const job={worker:null,timer:null};active=job;
  $('start').disabled=true;$('stop').disabled=false;$('output').textContent='';$('status').textContent='Validating local file…';
  job.timer=setTimeout(()=>finish(job,'Timed out; worker released.'),300000);
  try{
   const file=$('audio').files[0],language=$('language').value,device=$('device').value;
   if(!file||file.size>1100000)throw Error('Select a WAV file under 1.1 MB');
   const samples=readWav(await file.arrayBuffer());
   if(active!==job)return;
   const worker=new Worker('/worker.js',{type:'module'});job.worker=worker;
   worker.onerror=()=>finish(job,'Worker failed (check local asset/runtime configuration).');
   worker.onmessage=({data:m})=>{
    if(active!==job)return;
    if(m.kind==='phase'){$('status').textContent=m.text;return;}
    if(m.kind==='error'){finish(job,m.text);return;}
    if(m.kind==='result'){
     $('output').textContent=JSON.stringify({...m,seconds:samplesDuration,rtf:m.inferenceMs/1000/samplesDuration,device,language,browser:navigator.userAgent},null,2);
     finish(job,'Complete; worker released.');
    }
   };
   const samplesDuration=samples.length/16000;
   worker.postMessage({samples,language,device},[samples.buffer]);
   $('status').textContent='Loading verified local candidate…';
  }catch(e){finish(job,String(e.message||e));}
 };
}
async function workerMain({data}){
 try{
  const {samples,language,device}=data;
  if(!(samples instanceof Float32Array)||!samples.length||samples.length>480000||!['chinese','japanese','korean','english'].includes(language)||!['wasm','webgpu'].includes(device))throw Error('Invalid input');
  if(device==='webgpu'&&!navigator.gpu)throw Error('WebGPU unavailable; select WASM manually');
  const start=performance.now();
  const {env,pipeline}=await import('/runtime/transformers.web.min.js');
  if(env.version!=='3.8.1')throw Error('Unexpected Transformers.js runtime version');
  env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath='/models/';env.useBrowserCache=false;
  env.backends.onnx.wasm.wasmPaths=location.origin+'/runtime/';
  env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
  const recognizer=await pipeline('automatic-speech-recognition','whisper-tiny',{device,dtype:'q8',local_files_only:true});
  const loaded=performance.now();
  postMessage({kind:'phase',text:'Running local inference…'});
  const result=await recognizer(samples,{language,task:'transcribe',return_timestamps:false});
  if(typeof result?.text!=='string')throw Error('Invalid transcript result');
  postMessage({kind:'result',text:result.text,loadMs:Math.round(loaded-start),inferenceMs:Math.round(performance.now()-loaded)});
 }catch(e){postMessage({kind:'error',text:String(e.message||e).slice(0,500)});}
}
const html='<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YoruBay P2 ASR lab</title><h1>P2a — 本機辨識研究工具</h1><p>只使用本機測試音檔；PCM16、單聲道、16kHz、最長30秒。不上傳、不保存、不自動送出。這不是正式功能。</p><p><label>WAV <input id="audio" type="file" accept=".wav,audio/wav"></label></p><p><label>語言 <select id="language"><option value="chinese">中文</option><option value="japanese">日語</option><option value="korean">韓語</option><option value="english">英語</option></select></label> <label>引擎 <select id="device"><option value="wasm">WASM</option><option value="webgpu">WebGPU</option></select></label></p><button id="start">開始辨識</button> <button id="stop" disabled>取消</button><p id="status" role="status">等待手動啟動</p><pre id="output" style="white-space:pre-wrap"></pre><script src="/lab.js" defer></script></html>';
const sources={'/':html,'/lab.js':readWav.toString()+'\n('+browser.toString()+')();','/worker.js':'self.onmessage='+workerMain.toString()+';'};
const modelFiles=new Set(['config.json','generation_config.json','preprocessor_config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','added_tokens.json','normalizer.json','vocab.json','merges.txt',...Object.keys(weights)]);
function assetFor(url){
 const m=url.match(/^\/models\/whisper-tiny\/(.+)$/);
 if(m&&modelFiles.has(m[1]))return 'models/whisper-tiny/'+m[1];
 if(/^\/runtime\/(?:transformers\.web\.min\.js|ort-wasm[a-z0-9._-]*\.(?:mjs|wasm))$/i.test(url))return url.slice(1);
 return null;
}
function selfTest(){
 const b=new ArrayBuffer(48),v=new DataView(b),s=(i,t)=>{for(let k=0;k<t.length;k++)v.setUint8(i+k,t.charCodeAt(k));};
 s(0,'RIFF');v.setUint32(4,40,true);s(8,'WAVE');s(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);s(36,'data');v.setUint32(40,4,true);v.setInt16(44,-32768,true);v.setInt16(46,16384,true);
 assert.deepEqual([...readWav(b)],[-1,.5]);
 v.setUint16(22,2,true);assert.throws(()=>readWav(b),/mono/);v.setUint16(22,1,true);
 v.setUint32(40,8,true);assert.throws(()=>readWav(b),/Truncated/);
 assert.throws(()=>readWav(new ArrayBuffer(1100001)),/size/);
 assert.equal(assetFor('/models/whisper-tiny/onnx/encoder_model_quantized.onnx'),'models/whisper-tiny/onnx/encoder_model_quantized.onnx');
 for(const p of ['/runtime/../secret','/models/whisper-tiny/../../secret','/runtime/x.js','/models/whisper-tiny/onnx/decoder_model.onnx','/runtime/%2e%2e/x'])assert.equal(assetFor(p),null);
 new (require('node:vm').Script)(sources['/lab.js']);
 new (require('node:vm').Script)(sources['/worker.js']);
 console.log('P2 WAV, asset allowlist and browser script syntax fixtures passed; no inference run.');
}
async function main(){
 if(process.argv[2]==='--self-test')return selfTest();
 if(process.argv.length!==3)throw Error('Usage: node scripts/voice-p2-browser-lab.cjs <reviewed local asset directory>|--self-test');
 const root=fs.realpathSync(process.argv[2]);
 // Only the candidate weights have been independently checked. Runtime and all other assets require operator review.
 await verify(path.join(root,'models/whisper-tiny'),weights);
 const server=http.createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(req.headers.host!=='127.0.0.1:8787'||req.method!=='GET'){res.writeHead(403).end();return;}
  const url=req.url;
  if(Object.hasOwn(sources,url)){res.setHeader('Content-Type',url==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.end(sources[url]);return;}
  const relative=assetFor(url);
  if(!relative){res.writeHead(404).end();return;}
  try{
   const file=fs.realpathSync(path.join(root,relative));
   if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw Error('Invalid asset');
   const type={'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.txt':'text/plain','.onnx':'application/octet-stream'}[path.extname(file)]||'application/octet-stream';
   res.setHeader('Content-Type',type);
   const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch{res.writeHead(404).end();}
 });
 server.listen(8787,'127.0.0.1',()=>console.log('P2 developer lab http://127.0.0.1:8787/ revision '+revision+' (local assets only; no full manifest verification)'));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={readWav,assetFor};
