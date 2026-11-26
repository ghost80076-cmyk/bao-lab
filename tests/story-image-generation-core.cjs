const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../js/story-image-generation-core.js');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const config={provider:'openai',model:'gpt-image-2.6-flare',key:'PRIVATE-KEY',ratio:'1:1',quality:'low'};
const response=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
test('OpenAI image-only route and parameters never include text-model configuration',()=>{
 const r=C.request(config,'a room');assert.equal(r.url,'https://api.openai.com/v1/images/generations');
 assert.deepEqual(JSON.parse(r.init.body),{model:config.model,prompt:'a room',n:1,size:'1024x1024',quality:'low',output_format:'png'});
 assert.equal(r.init.credentials,'omit');assert.equal(r.init.redirect,'error');
 for(const model of ['gpt-6','gpt-image-1','dall-e-3'])assert.throws(()=>C.request({...config,model},'x'));
 assert.throws(()=>C.request({...config,quality:'unsupported'},'x'));assert.throws(()=>C.request({...config,ratio:'100:1'},'x'));
 assert.throws(()=>C.request({...config,provider:'bao-credits'},'x'));assert.throws(()=>C.request({...config,key:''},'x'));
});
test('retiring OpenAI image models are not selectable and cannot send a paid request',async()=>{
 assert.equal(C.OPENAI[0],config.model);
 assert(C.OPENAI.includes('gpt-image-2')); // Separate shutdown date; not removed in this release.
 const retired=['gpt-image-1.5','gpt-image-1.5-2025-12-16','gpt-image-1-mini','chatgpt-image-latest'];
 let posts=0;
 const client=C.createClient(async()=>{posts++;return response({data:[{b64_json:png}]});});
 for(const model of retired){
  assert(!C.OPENAI.includes(model));
  await assert.rejects(client.generate({...config,model},'x'),/不會自動切換/);
 }
 assert.equal(posts,0);
 await client.generate(config,'x');
 assert.equal(posts,1);
 const model='gpt-image-1.5',endpoint='https://relay.example/v1/images/generations';
 assert.equal(C.request({...config,provider:'custom',model,endpoint,ratio:'',quality:'',confirmedRoute:endpoint+'|'+model},'x').url,endpoint);
});
test('OpenAI authorized reference uses edits multipart, no manually-set content boundary',()=>{
 assert.throws(()=>C.request(config,'photo','data:image/png;base64,'+png));
 const r=C.request({...config,referenceAuthorized:true},'photo','data:image/png;base64,'+png);
 assert.equal(r.url,'https://api.openai.com/v1/images/edits');assert(r.init.body instanceof FormData);
 assert.equal(r.init.headers['Content-Type'],undefined);assert.equal(r.init.body.get('image[]').type,'image/png');
});
test('Gemini separate native image request and reference authorization',()=>{
 const c={...config,provider:'gemini',model:'gemini-3.1-flash-image',quality:'1K',referenceAuthorized:true};
 const r=C.request(c,'portrait','data:image/png;base64,'+png),body=JSON.parse(r.init.body);
 assert.equal(r.init.headers['x-goog-api-key'],config.key);assert(!r.url.includes(config.key));
 assert.deepEqual(body.generationConfig,{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'1:1',imageSize:'1K'}});
 assert.equal(body.contents[0].parts[1].inlineData.mimeType,'image/png');
 assert.throws(()=>C.request({...c,model:'gemini-3.1-pro'},'x'));
});
test('OpenRouter requires image catalog output capability, optional parameters and no fallback',()=>{
 const model='vendor/image',catalog=[{id:model,architecture:{output_modalities:['image']},supported_parameters:{aspect_ratio:{values:['1:1']},quality:{values:['low']}}}];
 const c={...config,provider:'openrouter',model,catalog};const r=C.request(c,'room');
 assert.equal(r.url,'https://openrouter.ai/api/v1/images');const body=JSON.parse(r.init.body);
 assert.deepEqual(body.provider,{allow_fallbacks:false});assert.equal(body.response_format,'b64_json');
 assert.throws(()=>C.request({...c,catalog:[]},'x'));assert.throws(()=>C.request({...c,quality:'high'},'x'));
 assert.throws(()=>C.request(c,'x','data:image/png;base64,'+png));
});
test('custom endpoint confirmation is exact, no known app proxy or credential URLs',()=>{
 const endpoint='https://relay.example/v1/images/generations',model='verified-image';
 const c={...config,provider:'custom',model,endpoint,ratio:'',quality:'',confirmedRoute:endpoint+'|'+model};
 assert.equal(C.request(c,'x').url,endpoint);
 assert.throws(()=>C.request({...c,model:'other'},'x'));
 for(const endpoint of ['http://relay.test/v1/images/generations','https://relay.test/v1/chat/completions','https://yorubay.com/images/generations','https://relay.workers.dev/images/generations','https://user:pass@relay.test/images/generations','https://relay.test/images/generations?key=x'])assert.throws(()=>C.request({...c,endpoint,confirmedRoute:endpoint+'|'+model},'x'));
});
test('single image decode validates MIME, signature, format and bounded bytes',async()=>{
 const client=C.createClient(async()=>response({data:[{b64_json:png,media_type:'image/png'}]}));
 const blob=await client.generate(config,'a room');assert.equal(blob.type,'image/png');assert(blob.size>0);
 for(const value of ['', 'bad', 'PHN2Zz48L3N2Zz4='])assert.throws(()=>C.base64(value));
 assert.throws(()=>C.base64(png,'image/jpeg'));
 await assert.rejects(C.createClient(async()=>response({data:[{b64_json:png},{b64_json:png}]})).generate(config,'x'),/單張/);
 await assert.rejects(C.readBounded(new Response('123456'),3),/容量/);
});
test('Gemini thought previews are not mistaken for a second final image',async()=>{
 const c={...config,provider:'gemini',model:'gemini-3.1-flash-image',quality:'1K'};
 const blob=await C.createClient(async()=>response({candidates:[{content:{parts:[{thought:true,inlineData:{mimeType:'image/png',data:png}},{inlineData:{mimeType:'image/png',data:png}}]}}]})).generate(c,'x');
 assert.equal(blob.type,'image/png');
});
test('duplicate invocation sends one paid POST, failure has no automatic retries',async()=>{
 let finish,count=0;const client=C.createClient(()=>{count++;return new Promise(resolve=>{finish=resolve;});});
 const first=client.generate(config,'room');await assert.rejects(client.generate(config,'room'),/重複/);
 finish(new Response('PRIVATE-KEY data:image/ SECRET',{status:500}));
 await assert.rejects(first,error=>!error.message.includes('PRIVATE')&&!error.message.includes('SECRET'));assert.equal(count,1);
});
test('timeout and cancellation abort once; do not claim cancellation avoids charges',async()=>{
 let count=0;const client=C.createClient((_,options)=>{count++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('PRIVATE-KEY'))));});
 await assert.rejects(client.generate(config,'x',{timeoutMs:5}),/仍可能完成並收費/);assert.equal(count,1);
 const ac=new AbortController(),request=client.generate(config,'x',{signal:ac.signal});ac.abort();await assert.rejects(request,/取消/);assert.equal(count,2);
 await assert.rejects(client.generate(config,'x',{signal:ac.signal}),/未送出/);assert.equal(count,2);
});
test('unexpected network errors cannot echo keys, prompts or private image data',async()=>{
 await assert.rejects(C.createClient(async()=>{throw new Error('PRIVATE-KEY data:image/ private-prompt');}).generate(config,'private-prompt'),error=>!error.message.includes('PRIVATE')&&!error.message.includes('data:image')&&!error.message.includes('private-prompt'));
});
test('temporary URLs are copied locally without authorization, cookies, referrer or redirects',async()=>{
 const requests=[];const client=C.createClient(async(url,options)=>{
 requests.push({url,options});return requests.length===1?response({data:[{url:'https://cdn.example/image?signature=private'}]}):new Response(Buffer.from(png,'base64'),{headers:{'content-type':'image/png'}});
 });
 assert.equal((await client.generate(config,'x')).type,'image/png');assert.equal(requests.length,2);
 assert.equal(requests[1].options.headers,undefined);assert.equal(requests[1].options.credentials,'omit');assert.equal(requests[1].options.redirect,'error');
 const bad=C.createClient(async()=>response({data:[{url:'http://localhost/private'}]}));await assert.rejects(bad.generate(config,'x'),/不安全/);
});
