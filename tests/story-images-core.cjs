const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/story-images-core.js');
const image = {version:1, width:1, height:1, data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6AAAAAElFTkSuQmCC'};
const plain = value => JSON.parse(JSON.stringify(value));
const read = name => fs.readFileSync(require('node:path').join(__dirname,'../js',name),'utf8');
for (const bad of [{...image,data:'https://evil.test/photo'}, {...image,data:'data:image/svg+xml;base64,PHN2Zz4='}, {...image,width:1281}, {...image,data:'data:image/png;base64,'+'A'.repeat(Core.MAX_DATA)}]) assert.throws(() => Core.validate(bad));
assert.throws(() => Core.validateMessages([{role:'assistant',storyImage:image}]));
assert.throws(() => Core.validateMessages(Array.from({length:21},()=>({role:'user',storyImage:image}))));
const cloud = {type:'custom',protocol:'openai',model:'vision-test',baseUrl:'https://selected.test/v1/chat/completions',key:'FAKE-NOT-A-CREDENTIAL'};
assert.equal(Core.capability(cloud),'unknown');
cloud.visionConfirmedRoute = Core.routeKey(cloud);
assert.equal(Core.capability(cloud),'confirmed');
assert.equal(Core.capability({...cloud,model:'another-model'}),'unknown');
assert.equal(Core.capability({...cloud,baseUrl:'https://other.test'}),'unknown');
for (const config of [{...cloud,type:'bao-credits'},{...cloud,model:'deepseek-chat'},{...cloud,model:'gpt-3.5-turbo'},{...cloud,route:'bao-credits'},{...cloud,protocol:'anthropic'}]) assert.throws(()=>Core.assertCapability(config));
assert.equal(Core.capability({model:'gpt-4o',baseUrl:'https://api.openai.com/v1/chat/completions'}),'supported');
// Reject oversized encoded dimensions before any browser pixel allocation.
const png = Buffer.from(image.data.split(',')[1], 'base64');
assert.deepEqual(Core.dimensions(png.buffer.slice(png.byteOffset, png.byteOffset+png.length),'image/png'),{width:1,height:1});
const bomb=Buffer.from(png);bomb.writeUInt32BE(50000,16);bomb.writeUInt32BE(50000,20);
assert.throws(()=>Core.validate({...image,data:'data:image/png;base64,'+bomb.toString('base64')}),/內容或尺寸/);
assert.throws(()=>Core.validate({...image,width:2}),/內容或尺寸/);
const mutable={...image};Core.validate(mutable);mutable.width=2;
assert.throws(()=>Core.validate(mutable),/內容或尺寸/,'validation cache must not trust mutated metadata');
assert.throws(()=>Core.dimensions(bomb.buffer.slice(bomb.byteOffset,bomb.byteOffset+bomb.length),'image/png'),/3,200/);
assert.throws(()=>Core.dimensions(new ArrayBuffer(0),'image/jpeg'),/無法解碼/);
const messages = [{role:'system',content:'Existing world and player agency rules'},{role:'user',content:'Only A can see this room.'}];
const original = JSON.stringify(messages);
const calls = [], inspected = [];
const c = {console,URL,atob,AbortController,TextDecoder,TextEncoder,setTimeout,clearTimeout,
  document:{getElementById:()=>null,querySelector:()=>null},
  GameState:{current:{}},App:{config:{api:cloud},wrapRenderChatShell(){}},
  fetch:async (url,init)=>{
    calls.push({url,body:JSON.parse(init.body)});
    return {ok:true,status:200,text:async()=>JSON.stringify(String(url).includes(':generateContent')
      ? {candidates:[{content:{parts:[{text:'A notices the door.'}]}}]}
      : {choices:[{message:{content:'A notices the door.'}}]})};
  }
};
c.window=c;vm.createContext(c);
for (const file of ['story-images-core.js','api.js','story-images.js','lm-studio-core.js']) vm.runInContext(read(file)+(file==='api.js'?'\nwindow.API=API;':''),c);
c.API.wrapSend('context-inspector:request',async(next,config,payload)=>{inspected.push(JSON.stringify(payload));return next(config,payload)});
c.API.wrapSend('lm-studio:local-transport',(next,config,payload)=>config.type==='lmstudio'?c.BAOLMStudioCore.send(config,payload,c.API,c.fetch):next(config,payload));
(async()=>{
  const bind = config => c.BAOStoryImages.bindRequest(config,image);
  for (const type of ['custom','openrouter','lmstudio']) {
    const config = {...cloud,type,baseUrl:type==='lmstudio'?'http://localhost:1234/v1':cloud.baseUrl};
    config.visionConfirmedRoute=Core.routeKey(config);
    await c.API.send(bind(config),messages);
    assert.equal(calls.at(-1).body.messages.at(-1).content[1].image_url.url,image.data);
    assert.match(calls.at(-1).body.messages[0].content,/只讓實際可接觸圖片的角色知情/);
  }
  const gemini = {type:'gemini',protocol:'gemini',model:'gemini-3.1-pro-preview',baseUrl:'https://generativelanguage.googleapis.com/v1beta/models',key:'FAKE'};
  await c.API.send(bind(gemini),messages);
  assert.deepEqual(calls.at(-1).body.contents.at(-1).parts[1],{inlineData:{mimeType:'image/png',data:image.data.split(',')[1]}});
  assert(inspected.every(text=>!text.includes('base64')&&!text.includes('inlineData')), 'diagnostics and text transforms must never receive image bytes');
  await c.API.send(cloud,messages);
  assert.deepEqual(calls.at(-1).body.messages,messages,'subsequent text requests remain byte-for-byte unchanged');
  await c.API.send({...cloud,__memoryTask:true},messages);
  assert.deepEqual(calls.at(-1).body.messages,messages);
  const count=calls.length;
  await assert.rejects(c.API.send({...bind(cloud),__stateTask:true},messages),/路由已變更/);
  await assert.rejects(c.API.send({...bind(cloud),baseUrl:'https://other.test'},messages),/路由已變更/);
  assert.equal(calls.length,count);
  assert.equal(JSON.stringify(messages),original);
  // An error echoing the entire request must never reach UI/logging consumers.
  c.fetch=async()=>({ok:false,status:400,text:async()=>JSON.stringify({error:{message:image.data}})});
  await assert.rejects(c.API.send(bind(cloud),messages),error=>!error.message.includes('base64')&&/圖片請求失敗/.test(error.message));
  console.log('Story images: bounds, capability binding, real OpenAI/Gemini/local serializers, text/helper isolation, nonmutation and safe errors passed');
})().catch(error=>{console.error(error);process.exitCode=1});
