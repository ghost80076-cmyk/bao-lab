const {test,expect}=require('@playwright/test');
if(process.env.STORY_VOICE_BASE_URL)test.use({baseURL:process.env.STORY_VOICE_BASE_URL});
async function setup(page,width,solo=false){
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>{
  window.__voiceCalls=[];window.__recognitions=0;
  const voices=[{voiceURI:'zh',name:'Local Chinese',lang:'zh-TW',localService:true},{voiceURI:'ja',name:'Japanese fixture',lang:'ja-JP',localService:true},{voiceURI:'ko',name:'Korean fixture',lang:'ko-KR',localService:true},{voiceURI:'remote',name:'Remote fixture',lang:'ja-JP',localService:false}];
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>voices,speak:u=>{window.__voiceCalls.push({text:u.text,lang:u.lang,rate:u.rate,voice:u.voice.voiceURI});window.__lastUtterance=u;},cancel(){},addEventListener(){},removeEventListener(){}}});
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(text){this.text=text;}}});
  Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:class{start(){window.__recognitions++;setTimeout(()=>{this.onresult?.({results:[{isFinal:true,0:{transcript:'今天好累'}}]});this.onend?.();},20);}stop(){this.onend?.();}abort(){}}});
 });
 await page.goto('/');
 await page.waitForFunction(()=>window.BAOExtensionLoadHealth?.snapshot().story==='ready'&&BAOExtensionLoadHealth.snapshot().world==='ready'&&window.BAOStoryVoice&&Storage.status().ready);
 await page.evaluate(solo=>{
  App.activeCharacter=CharacterEngine.normalize({id:'voice-test',name:'角色',system_prompt:'fixture',greeting:'start',initial_state:{npcs:solo?[]:[{id:'a',name:'A'},{id:'b',name:'B'}]}});
  App.config={narrativeMode:'world',displayMode:'text',persona:{name:'旅人'},api:{type:'custom',protocol:'openai',model:'fixture',key:'TEXT-PRIVATE',baseUrl:'https://text.example.invalid/v1/chat/completions'},memory:{mode:'rounds',maxRounds:20,maxContext:32000},cost:{enabled:false}};
  Chat.reset();GameState.create(App.activeCharacter,App.config);BAOStoryLibrary.beginStory('語音測試');
  Chat.add('assistant',solo?'她心想：「快關店了。」她把菜單推近。「要一起點嗎？」「我想吃麵。」':'他走到窗邊。「晚安。」');App.showView('chat');App.renderChatShell(false);App.saveStory(false);
 },solo);
 await page.evaluate(()=>BAOStorageWriteGuard.whenIdle());
 await page.waitForFunction(()=>window.BAOChatToolNavigation&&window.BAOMobileReadingLayout);
}
async function openVoice(page,width){
 await expect(page.locator('#chat-view .composer [data-bao-voice-tools]')).toHaveCount(0);
 if(width<821){
   await page.locator('#bao-mobile-composer-tools').click();
 }else{
   await page.evaluate(()=>BAOChatToolNavigation.openDrawer());
 }
 const drawer=page.locator('#bao-chat-tool-drawer');
 await expect(drawer).toBeVisible();
 await drawer.getByRole('searchbox',{name:'搜尋故事工具'}).fill('語音工具');
 await drawer.getByRole('button',{name:'語音工具',exact:true}).click();
 await expect(drawer).toHaveCount(0);
}
for(const width of [390,1440])test('optional browser speech at '+width+'px',async({page})=>{
 await setup(page,width);
 const before=await page.evaluate(()=>({messages:JSON.stringify(Chat.messages),state:JSON.stringify(GameState.current),api:JSON.stringify(App.config.api)}));
 await page.locator('#user-input').fill('原有文字');
 await openVoice(page,width);
 const d=page.getByRole('dialog',{name:'角色語音與語音輸入'});
 await expect(d).toBeVisible();
 await d.getByRole('button',{name:'開始語音辨識'}).click();
 expect(await page.evaluate(()=>window.__recognitions)).toBe(0);
 await d.getByLabel('我同意使用瀏覽器語音辨識服務').check();
 await d.getByRole('button',{name:'開始語音辨識'}).click();
 await expect(d.getByLabel('辨識文字預覽（可修改）')).toHaveValue('今天好累');
 await d.getByRole('button',{name:'將文字填入故事輸入框'}).click();
 await expect(page.locator('#user-input')).toHaveValue('原有文字\n今天好累');
 await openVoice(page,width);
 await d.getByLabel('配音角色').selectOption('a');
 await d.getByLabel('配音語言').selectOption('ja-JP');
 await d.getByLabel('選擇故事回覆').selectOption('0');
 await expect(d.getByLabel('實際配音台詞（可編輯／貼上翻譯）')).toHaveValue('');
 await d.getByRole('button',{name:'播放確認的台詞'}).click();expect(await page.evaluate(()=>window.__voiceCalls.length)).toBe(0);
 await d.getByLabel('可能的台詞（須手動確認）').selectOption('0');
 await d.getByLabel('實際配音台詞（可編輯／貼上翻譯）').fill('おやすみ。');
 await d.getByLabel('裝置聲線').selectOption('ja');
 await d.getByRole('button',{name:'保存角色聲線設定'}).click();
 await d.getByRole('button',{name:'播放確認的台詞'}).click();
 expect(await page.evaluate(()=>window.__voiceCalls)).toEqual([{text:'おやすみ。',lang:'ja-JP',rate:1,voice:'ja'}]);
 await d.getByLabel('配音角色').selectOption('b');await expect(d.getByLabel('配音語言')).toHaveValue('zh-TW');
 await d.getByLabel('配音角色').selectOption('a');await expect(d.getByLabel('裝置聲線')).toHaveValue('ja');
 await d.getByLabel('裝置聲線').selectOption('remote');
 await d.getByRole('button',{name:'播放確認的台詞'}).click();expect(await page.evaluate(()=>window.__voiceCalls.length)).toBe(1);
 await d.getByLabel('我同意此聲線可能將台詞傳給裝置／瀏覽器語音服務').check();
 await d.getByRole('button',{name:'播放確認的台詞'}).click();expect(await page.evaluate(()=>window.__voiceCalls.length)).toBe(2);
 await d.getByRole('button',{name:'關閉',exact:true}).click();
 expect(await page.evaluate(()=>({messages:JSON.stringify(Chat.messages),state:JSON.stringify(GameState.current),api:JSON.stringify(App.config.api)}))).toEqual(before);
 expect(await page.evaluate(()=>localStorage.getItem('yorubay-device-voice-v1'))).not.toContain('TEXT-PRIVATE');
});

test('voice pack preview requires explicit role and save, rejects unknown fields',async({page})=>{
 await setup(page,390);await openVoice(page,390);
 const d=page.getByRole('dialog',{name:'角色語音與語音輸入'});
 await d.getByLabel('配音角色').selectOption('a');
 await d.getByText('聲線設定包（匯入／匯出）',{exact:true}).click();
 const pack={schema:'yorubay.voice-profile',version:1,engine:'web-speech',profile:{language:'ko-KR',voiceURI:'ko',rate:.9,pitch:1.15,volume:.7}};
 const load=async value=>d.getByLabel('選擇聲線設定包 JSON').setInputFiles({name:'voice.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
 await load({...pack,url:'https://example.invalid'});
 await expect(d.locator('p[role="status"]')).toContainText('不支援');
 await expect(d.getByLabel('配音語言')).toHaveValue('zh-TW');
 await load(pack);
 await expect(d.locator('p[role="status"]')).toContainText('尚未保存');
 await expect(d.getByLabel('配音語言')).toHaveValue('ko-KR');
 await expect(d.getByLabel('裝置聲線')).toHaveValue('ko');
 expect(await page.evaluate(()=>localStorage.getItem('yorubay-device-voice-v1'))).toBeNull();
 expect(await page.evaluate(()=>window.__voiceCalls.length)).toBe(0);
 await d.getByRole('button',{name:'保存角色聲線設定'}).click();
 await d.getByLabel('配音角色').selectOption('b');
 await expect(d.getByLabel('配音語言')).toHaveValue('zh-TW');
 await d.getByLabel('配音角色').selectOption('a');
 await expect(d.getByLabel('配音語言')).toHaveValue('ko-KR');
 const download=page.waitForEvent('download');
 await d.getByRole('button',{name:'匯出目前聲線設定包'}).click();
 expect((await download).suggestedFilename()).toBe('yorubay-voice-profile.json');
});

test('automatic dialogue reads the current single-card reply and subsequent committed turns',async({page})=>{
 await setup(page,390,true);
 await page.route('https://text.example.invalid/**',route=>route.fulfill({
   json:{choices:[{message:{content:'她看見門上寫著「休息中」。她開口問：「改吃火鍋？」'},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:10}},
   headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}
 }));
 const spoken=()=>page.evaluate(()=>window.__voiceCalls.map(u=>u.text));
 await openVoice(page,390);
 const dialog=page.getByRole('dialog',{name:'角色語音與語音輸入'});
 expect(await spoken()).toEqual([]);
 await dialog.getByLabel('自動朗讀角色台詞').check();
 await expect.poll(spoken).toEqual(['要一起點嗎？']);
 await dialog.getByRole('button',{name:'關閉',exact:true}).click();
 await page.evaluate(()=>window.__lastUtterance.onend());
 await expect.poll(spoken).toEqual(['要一起點嗎？','我想吃麵。']);
 await page.evaluate(()=>window.__lastUtterance.onend());
 await page.locator('#user-input').fill('「我來看看。」');
 await page.locator('[data-send-message]').click();
 await expect.poll(spoken,{timeout:20000}).toEqual(['要一起點嗎？','我想吃麵。','改吃火鍋？']);
 await page.evaluate(()=>App.renderChatShell(false));
 expect(await spoken()).toHaveLength(3);
 await openVoice(page,390);
 await dialog.getByLabel('自動朗讀角色台詞').uncheck();
 expect(await page.evaluate(()=>window.__lastUtterance.onend)).toBeNull();
});

test('automatic dialogue respects named voices and rejects a stale reply queue',async({page})=>{
 await setup(page,1440);
 await page.evaluate(()=>{
   const core=BAOStoryVoiceCore;
   const profiles={};
   for(const [id,uri,lang] of [['a','ja','ja-JP'],['b','ko','ko-KR']]){
     profiles[core.profileKey(App.activeCharacter.id,id)]=core.profile({language:lang,voiceURI:uri});
   }
   localStorage.setItem('yorubay-device-voice-v1',JSON.stringify(profiles));
   Chat.add('assistant','A：「晚安。」\n「路人插話。」\nB：「明天見。」「再見。」');App.renderChatShell(false);
 });
 await openVoice(page,1440);
 await page.getByLabel('自動朗讀角色台詞').check();
 await page.evaluate(()=>window.__lastUtterance.onend());
 expect(await page.evaluate(()=>window.__voiceCalls.map(u=>[u.voice,u.text]))).toEqual([['ja','晚安。'],['ko','明天見。']]);
 await page.evaluate(()=>{Chat.messages.at(-1).content='B：「新版本。」';window.__lastUtterance.onend();});
 expect(await page.evaluate(()=>window.__voiceCalls)).toHaveLength(2);
});

test('custom STT is opt-in, cancel-safe and only fills editable draft',async({page,browserName})=>{
 await page.addInitScript(()=>{
   window.__sttMic=0;window.__sttStopped=0;window.__sttPayloads=[];
   const nativeFetch=window.fetch.bind(window);
   window.fetch=async(input,init)=>{
     if(input==='https://stt.example.invalid/v1/audio/transcriptions'){
       const file=init.body.get('file');
       window.__sttPayloads.push({bytes:await file.text(),size:file.size,type:file.type,name:file.name,model:init.body.get('model'),language:init.body.get('language'),fields:[...init.body.keys()]});
     }
     return nativeFetch(input,init);
   };
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{window.__sttMic++;return {getTracks:()=>[{stop:()=>window.__sttStopped++}]};}}});
   Object.defineProperty(window,'MediaRecorder',{configurable:true,value:class{
     static isTypeSupported(t){return t.startsWith('audio/webm');}
     constructor(){this.mimeType='audio/webm';this.state='inactive';}
     start(){this.state='recording';}
     stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio-fixture'],{type:'audio/webm'})});this.onstop?.();}
   }});
 });
 let requests=0,failNext=false;
 await page.route('https://stt.example.invalid/**',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization'}});
   requests++;expect(route.request().headers().authorization).toBe('Bearer STT-PRIVATE');
   // WebKit's intercepted postData omits binary multipart file bytes; check
   // actual FormData Blob content inside the browser for every engine below.
   expect(route.request().postData()).toContain('filename="speech.webm"');
   if(browserName!=='webkit')expect(route.request().postData()).toContain('audio-fixture');
   expect(route.request().postData()).not.toContain('TEXT-PRIVATE');
   expect(route.request().postData()).toContain('player-model');
   if(failNext)return route.fulfill({status:503,body:'PRIVATE-SERVICE-ERROR',headers:{'access-control-allow-origin':'*'}});
   await route.fulfill({json:{text:'繁體中文測試'},headers:{'access-control-allow-origin':'*'}});
 });
 await setup(page,390);
 await page.locator('#user-input').fill('原稿');
 await openVoice(page,390);
 const d=page.getByRole('dialog',{name:'角色語音與語音輸入'});
 await expect(d.getByLabel('語音辨識來源')).toHaveValue('device');
 await d.getByLabel('語音辨識來源').selectOption('custom');
 await d.getByLabel('STT 接口網址').fill('https://stt.example.invalid/v1/audio/transcriptions');
 await d.getByLabel('STT 模型 ID').fill('player-model');
 await d.getByLabel('STT API Key（選填）').fill('STT-PRIVATE');
 await d.getByRole('button',{name:'開始語音辨識'}).click();
 expect(await page.evaluate(()=>window.__sttMic)).toBe(0);expect(requests).toBe(0);
 const consent=d.getByLabel('我同意將本次錄音傳至上述接口，可能由該服務收費');
 await consent.check();await d.getByRole('button',{name:'開始語音辨識'}).click();
 await expect(d.locator('p[role="status"]')).toContainText('錄音中');
 await d.getByRole('button',{name:'取消本次錄音／辨識'}).click();
 expect(requests).toBe(0);expect(await page.evaluate(()=>window.__sttStopped)).toBeGreaterThan(0);
 await consent.check();await d.getByRole('button',{name:'開始語音辨識'}).click();
 await expect(d.locator('p[role="status"]')).toContainText('錄音中');
 await d.getByRole('button',{name:'停止辨識',exact:true}).click();
 await expect(d.getByLabel('辨識文字預覽（可修改）')).toHaveValue('繁體中文測試');
 expect(requests).toBe(1);
 await d.getByLabel('辨識文字預覽（可修改）').fill('修改後');
 failNext=true;
 await consent.check();await d.getByRole('button',{name:'開始語音辨識'}).click();
 await expect(d.locator('p[role="status"]')).toContainText('錄音中');
 await d.getByRole('button',{name:'停止辨識',exact:true}).click();
 await expect(d.locator('p[role="status"]')).toContainText('STT 辨識失敗');
 await expect(d.locator('p[role="status"]')).not.toContainText('PRIVATE-SERVICE-ERROR');
 await expect(d.getByLabel('辨識文字預覽（可修改）')).toHaveValue('修改後');
 expect(requests).toBe(2);
 expect(await page.evaluate(()=>window.__sttPayloads)).toEqual(Array.from({length:2},()=>({bytes:'audio-fixture',size:13,type:'audio/webm',name:'speech.webm',model:'player-model',language:'zh',fields:['file','model','language']})));
 expect(await page.evaluate(()=>window.__recognitions)).toBe(0);
 await expect(page.locator('#user-input')).toHaveValue('原稿');
 await d.getByRole('button',{name:'將文字填入故事輸入框'}).click();
 await expect(page.locator('#user-input')).toHaveValue('原稿\n修改後');
 expect(await page.evaluate(()=>Chat.messages.filter(m=>m.role==='user').length)).toBe(0);
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('STT-PRIVATE');
 await openVoice(page,390);await expect(d.getByLabel('語音辨識來源')).toHaveValue('device');
});

test('custom TTS only sends confirmed line and keeps role voice choices temporary',async({page})=>{
 await setup(page,390);
 // One short valid PCM WAV fixture; no provider or actual paid call.
 const wav=Buffer.alloc(44+1600);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
 let requests=0,failNext=false;
 await page.route('https://tts.example.invalid/**',async route=>{
   const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   requests++;expect(route.request().headers().authorization).toBe('Bearer TTS-PRIVATE');
   expect(route.request().postDataJSON()).toEqual({model:'player-tts',voice:'voice-a',input:'晚安。',speed:1,response_format:'mp3'});
   if(failNext)return route.fulfill({status:503,headers,body:'PRIVATE-SERVICE-ERROR'});
   await route.fulfill({headers:{...headers,'content-type':'audio/wav'},body:wav});
 });
 await openVoice(page,390);const d=page.getByRole('dialog',{name:'角色語音與語音輸入'});
 await expect(d.getByLabel('配音來源')).toHaveValue('device');
 await d.getByLabel('配音來源').selectOption('custom');
 await expect(d.getByLabel('自動朗讀角色台詞')).toBeDisabled();
 await d.getByLabel('配音角色').selectOption('a');
 await d.getByLabel('TTS 接口網址').fill('https://tts.example.invalid/v1/audio/speech');
 await d.getByLabel('TTS 模型 ID').fill('player-tts');
 await d.getByLabel('TTS 聲線 ID').fill('voice-a');
 await d.getByLabel('TTS API Key（選填）').fill('TTS-PRIVATE');
 await d.getByLabel('配音角色').selectOption('b');
 await expect(d.getByLabel('TTS 聲線 ID')).toHaveValue('');
 await d.getByLabel('TTS 聲線 ID').fill('voice-b');
 await d.getByLabel('配音角色').selectOption('a');
 await expect(d.getByLabel('TTS 聲線 ID')).toHaveValue('voice-a');
 await d.getByLabel('實際配音台詞（可編輯／貼上翻譯）').fill('晚安。');
 const generate=d.getByRole('button',{name:'生成確認的台詞'}),consent=d.getByLabel('我同意將本次確認的台詞傳至指定 TTS 接口，可能收費');
 await generate.click();expect(requests).toBe(0);
 await consent.check();await generate.click();
 await expect(d.locator('p[role="status"]')).toContainText('語音已生成');
 const audio=d.locator('audio[aria-label="生成的角色語音"]');
 await expect(audio).toBeVisible();await expect(audio).toHaveAttribute('src',/^blob:/);
 expect(requests).toBe(1);
 await d.getByRole('button',{name:'停止播放',exact:true}).click();
 await expect(audio).toBeHidden();await expect(audio).not.toHaveAttribute('src',/./);
 failNext=true;await consent.check();await generate.click();
 await expect(d.locator('p[role="status"]')).toContainText('TTS 生成失敗');
 await expect(d.locator('p[role="status"]')).not.toContainText('PRIVATE-SERVICE-ERROR');
 expect(requests).toBe(2);
 expect(await page.evaluate(()=>window.__voiceCalls.length)).toBe(0);
 await d.getByRole('button',{name:'關閉',exact:true}).click();
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('TTS-PRIVATE');
 await openVoice(page,390);
 await expect(d.getByLabel('配音來源')).toHaveValue('device');
 await expect(d.getByLabel('自動朗讀角色台詞')).toBeEnabled();
});

test('custom automatic TTS grants only future dialogue to mapped roles and can be revoked',async({page})=>{
 await page.addInitScript(()=>{
   window.__autoAudio=[];
   window.Audio=class{
     constructor(src){this.src=src;}
     play(){window.__autoAudio.push(this);return Promise.resolve();}
     pause(){}
     removeAttribute(name){if(name==='src')this.src='';}
     load(){}
   };
 });
 await setup(page,390);
 const calls=[];
 const wav=Buffer.alloc(44+1600);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
 await page.route('https://tts.example.invalid/**',async route=>{
   const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   expect(route.request().headers().authorization).toBe('Bearer AUTO-TTS-PRIVATE');
   calls.push(route.request().postDataJSON());
   await route.fulfill({headers:{...headers,'content-type':'audio/wav'},body:wav});
 });
 await page.route('https://text.example.invalid/**',route=>route.fulfill({json:{choices:[{message:{content:'A：「晚安。」\nB：「明天見。」\n路人：「借過。」\nA心想：「秘密。」'},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:10}},headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}}));
 await openVoice(page,390);const d=page.getByRole('dialog',{name:'角色語音與語音輸入'});
 await d.getByLabel('配音來源').selectOption('custom');
 await d.getByLabel('配音角色').selectOption('a');
 await d.getByLabel('TTS 接口網址').fill('https://tts.example.invalid/v1/audio/speech');
 await d.getByLabel('TTS 模型 ID').fill('player-tts');
 await d.getByLabel('TTS 聲線 ID').fill('voice-a');
 await d.getByLabel('TTS API Key（選填）').fill('AUTO-TTS-PRIVATE');
 await d.getByLabel('配音角色').selectOption('b');
 await d.getByLabel('TTS 聲線 ID').fill('voice-b');
 const enable=d.getByRole('button',{name:'啟用本章節自訂自動配音'});
 await enable.click();await expect(d.locator('p[role="status"]')).toContainText('請先確認');
 expect(calls).toHaveLength(0);
 await d.getByLabel('我同意本章節後續角色台詞自動傳至指定 TTS 接口，可能收費').check();
 await enable.click();await expect(d.locator('p[role="status"]')).toContainText('尚未送出請求');
 expect(calls).toHaveLength(0);
 await d.getByRole('button',{name:'關閉',exact:true}).click();
 await page.locator('#user-input').fill('晚安');
 await page.locator('[data-send-message]').click();
 await expect.poll(()=>calls.length,{timeout:20000}).toBe(1);
 expect(calls[0]).toEqual({model:'player-tts',voice:'voice-a',input:'晚安。',speed:1,response_format:'mp3'});
 await expect.poll(()=>page.evaluate(()=>window.__autoAudio.length)).toBe(1);
 await page.evaluate(()=>window.__autoAudio[0].onended());
 await expect.poll(()=>calls.length).toBe(2);
 expect(calls[1]).toEqual({model:'player-tts',voice:'voice-b',input:'明天見。',speed:1,response_format:'mp3'});
 await expect.poll(()=>page.evaluate(()=>window.__autoAudio.length)).toBe(2);
 await page.evaluate(()=>window.__autoAudio[1].onended());
 await page.evaluate(()=>App.renderChatShell(false));
 expect(calls).toHaveLength(2);
 await openVoice(page,390);
 await d.getByRole('button',{name:'停止所有自動配音'}).click();
 await d.getByRole('button',{name:'關閉',exact:true}).click();
 await page.locator('#user-input').fill('再見');
 await page.locator('[data-send-message]').click();
 await expect.poll(()=>page.evaluate(()=>Chat.messages.filter(m=>m.role==='user').length)).toBe(2);
 await expect.poll(()=>page.evaluate(()=>Boolean(App.__requestPending))).toBe(false);
 expect(calls).toHaveLength(2);
 expect(await page.evaluate(()=>window.__voiceCalls.length)).toBe(0);
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('AUTO-TTS-PRIVATE');
});

test('local audio recording and file preview remain separate from STT and the story',async({page})=>{
 const wav=Buffer.alloc(44+1600);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
 await page.addInitScript(bytes=>{
   window.__localMic=0;window.__localStopped=0;
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{window.__localMic++;return {getTracks:()=>[{stop:()=>window.__localStopped++}]};}}});
   Object.defineProperty(window,'MediaRecorder',{configurable:true,value:class{
     static isTypeSupported(){return false;}
     constructor(){this.mimeType='audio/wav';this.state='inactive';}
     start(){this.state='recording';}
     stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array(bytes)],{type:'audio/wav'})});this.onstop?.();}
   }});
 },Array.from(wav));
 let external=0;
 await page.route(/https:\/\/(?:text|stt|tts)\.example\.invalid\//,route=>{external++;return route.abort();});
 await setup(page,390);
 const before=await page.evaluate(()=>({messages:JSON.stringify(Chat.messages),state:JSON.stringify(GameState.current)}));
 await page.locator('#user-input').fill('原草稿');
 await openVoice(page,390);
 const d=page.getByRole('dialog',{name:'角色語音與語音輸入'});
 const details=d.locator('details').filter({hasText:'玩家錄音／音檔預覽（本機）'});
 await details.getByText('玩家錄音／音檔預覽（本機）',{exact:true}).click();
 const start=details.getByRole('button',{name:'開始本機錄音'}),stop=details.getByRole('button',{name:'停止本機錄音'}),discard=details.getByRole('button',{name:'捨棄本機音檔／取消錄音'});
 const audio=details.locator('audio[aria-label="本機音檔預覽"]'),file=details.getByLabel('選擇本機音檔');
 expect(await page.evaluate(()=>window.__localMic)).toBe(0);
 await start.click();await expect(details.getByText('本機錄音中；停止後可預覽，不會傳送。')).toBeVisible();
 await discard.click();await expect(audio).toBeHidden();
 expect(await page.evaluate(()=>window.__localStopped)).toBe(1);
 await start.click();await expect(stop).toBeEnabled();await stop.click();
 await expect(audio).toBeVisible();await expect(audio).toHaveAttribute('src',/^blob:/);
 await expect(details.getByRole('button',{name:'下載本機音檔'})).toBeEnabled();
 expect(await page.evaluate(()=>window.__localStopped)).toBe(2);
 await file.setInputFiles({name:'fake.wav',mimeType:'audio/wav',buffer:Buffer.from('<html>invalid audio</html>')});
 await expect(details.getByText('音檔格式不支援或與內容不符。')).toBeVisible();await expect(audio).toBeHidden();
 await file.setInputFiles({name:'sample.wav',mimeType:'audio/wav',buffer:wav});
 await expect(audio).toBeVisible();await expect(audio).toHaveAttribute('src',/^blob:/);
 await discard.click();await expect(audio).not.toHaveAttribute('src',/./);
 await start.click();await expect(stop).toBeEnabled();
 await d.getByRole('button',{name:'關閉',exact:true}).click();
 expect(await page.evaluate(()=>window.__localStopped)).toBe(3);
 expect(await page.evaluate(()=>window.__recognitions)).toBe(0);
 expect(await page.evaluate(()=>window.__voiceCalls.length)).toBe(0);
 expect(external).toBe(0);
 await expect(page.locator('#user-input')).toHaveValue('原草稿');
 expect(await page.evaluate(()=>({messages:JSON.stringify(Chat.messages),state:JSON.stringify(GameState.current)}))).toEqual(before);
});

test('custom voice settings survive closing tools only after explicit save, never keys or consent',async({page})=>{
 await setup(page,390);await openVoice(page,390);
 const d=page.getByRole('dialog',{name:'角色語音與語音輸入'});
 await d.getByLabel('語音辨識來源').selectOption('custom');
 await d.getByLabel('STT 接口網址').fill('https://stt.example.invalid/v1/audio/transcriptions');
 await d.getByLabel('STT 模型 ID').fill('whisper');
 await d.getByLabel('輸入語言').selectOption('ja-JP');
 await d.getByLabel('STT API Key（選填）').fill('STT-NOT-SAVED');
 await d.getByRole('button',{name:'保存 STT 接口設定'}).click();
 await d.getByLabel('配音來源').selectOption('custom');
 await d.getByLabel('TTS 接口網址').fill('https://tts.example.invalid/v1/audio/speech');
 await d.getByLabel('TTS 模型 ID').fill('model');
 await d.getByLabel('TTS API Key（選填）').fill('TTS-NOT-SAVED');
 await d.getByLabel('配音角色').selectOption('a');
 await d.getByLabel('TTS 聲線 ID').fill('voice-a');
 await d.getByLabel('配音角色').selectOption('b');
 await d.getByLabel('TTS 聲線 ID').fill('voice-b');
 await d.getByRole('button',{name:'保存自訂 TTS 與角色聲線'}).click();
 const saved=await page.evaluate(()=>localStorage.getItem('yorubay-custom-voice-v1'));
 expect(saved).toContain('voice-a');expect(saved).toContain('voice-b');expect(saved).not.toContain('NOT-SAVED');
 await d.getByRole('button',{name:'關閉',exact:true}).click();await openVoice(page,390);
 await expect(d.getByLabel('配音來源')).toHaveValue('device');
 await d.getByLabel('語音辨識來源').selectOption('custom');
 await expect(d.getByLabel('STT 模型 ID')).toHaveValue('whisper');
 await expect(d.getByLabel('STT API Key（選填）')).toHaveValue('');
 await d.getByLabel('配音來源').selectOption('custom');
 await d.getByLabel('配音角色').selectOption('a');
 await expect(d.getByLabel('TTS 聲線 ID')).toHaveValue('voice-a');
 await expect(d.getByLabel('TTS API Key（選填）')).toHaveValue('');
 await d.getByLabel('自動配音使用上限').selectOption('extended');
 await d.getByRole('button',{name:'啟用本章節自訂自動配音'}).click();
 await expect(d.locator('p[role="status"]')).toContainText('請先確認');
 await d.getByLabel('TTS 接口網址').fill('https://other.example.invalid/v1/audio/speech');
 await expect(d.getByLabel('TTS 聲線 ID')).toHaveValue('');
 await d.getByRole('button',{name:'清除已保存 TTS 設定'}).click();
 await d.getByRole('button',{name:'清除已保存 STT 設定'}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('yorubay-custom-voice-v1')))).toEqual({});
});

function voiceWav(){
 const wav=Buffer.alloc(44+1600);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
 return wav;
}

test('saved local audio belongs only to its chapter and never becomes a model message',async({page})=>{
 const wav=voiceWav();
 let external=0;
 await page.route(/https:\/\/(?:text|stt|tts)\.example\.invalid\//,route=>{external++;return route.abort();});
 await setup(page,390);await openVoice(page,390);
 const before=await page.evaluate(()=>({messages:JSON.stringify(Chat.messages),state:JSON.stringify(GameState.current)}));
 const d=page.getByRole('dialog',{name:'角色語音與語音輸入'});
 await d.getByText('玩家錄音／音檔預覽（本機）',{exact:true}).click();
 const file=d.getByLabel('選擇本機音檔');
 await file.setInputFiles({name:'sample.wav',mimeType:'audio/wav',buffer:wav});
 await expect(d.getByRole('button',{name:'保存至本章節音訊庫'})).toBeEnabled();
 await d.getByRole('button',{name:'保存至本章節音訊庫'}).click();
 await expect(d.locator('[data-local-audio-status]')).toHaveText('已保存本機音訊，尚未傳送給角色。');
 await expect(d.getByText('已保存 1 段音訊。',{exact:true})).toBeVisible();
 await d.getByRole('button',{name:'保存至本章節音訊庫'}).click();
 await expect.poll(()=>page.evaluate(async()=> (await BAOStoryVoiceAssets.list(BAOStoryLibrary.refs())).length)).toBe(1);
 const isolated=await page.evaluate(async()=>{
   const scope=BAOStoryLibrary.refs(),other={...scope,chapterId:scope.chapterId+'-other'},rows=await BAOStoryVoiceAssets.list(scope);
   const saved=await BAOStoryVoiceAssets.get(scope,rows[0].id);
   if(saved.blob.size!==1644||saved.blob.type!=='audio/wav')throw Error('stored audio mismatch');
   let blocked=0;
   try{await BAOStoryVoiceAssets.get(other,rows[0].id);}catch(_){blocked++;}
   try{await BAOStoryVoiceAssets.remove(other,rows[0].id);}catch(_){blocked++;}
   return {other:(await BAOStoryVoiceAssets.list(other)).length,blocked};
 });
 expect(isolated).toEqual({other:0,blocked:2});
 await d.getByRole('button',{name:'關閉',exact:true}).click();
 await openVoice(page,390);
 await d.getByText('玩家錄音／音檔預覽（本機）',{exact:true}).click();
 await d.getByText('本章節已保存音訊',{exact:true}).click();
 await expect(d.getByText('已保存 1 段音訊。',{exact:true})).toBeVisible();
 await d.getByRole('button',{name:'預覽音訊 1',exact:true}).click();
 await expect(d.getByLabel('本機音檔預覽')).toBeVisible();
 await expect(d.getByRole('button',{name:'刪除音訊 1',exact:true})).toBeDisabled();
 await d.getByLabel('確認刪除音訊 1').check();
 await d.getByRole('button',{name:'刪除音訊 1',exact:true}).click();
 await expect(d.getByText('本章節尚無已保存音訊。')).toBeVisible();
 expect(external).toBe(0);
 expect(await page.evaluate(()=>({messages:JSON.stringify(Chat.messages),state:JSON.stringify(GameState.current)}))).toEqual(before);
});

test('audio story backup restores into a separate story and deletion cleans only that copy',async({page})=>{
 await setup(page,390);
 const result=await page.evaluate(async()=>{
   const scope=BAOStoryLibrary.refs(),original={storyId:scope.storyId,chapterId:scope.chapterId};
   const wav=new Uint8Array(1644),v=new DataView(wav.buffer);
   for(const [offset,str] of [[0,'RIFF'],[8,'WAVEfmt '],[36,'data']])wav.set([...str].map(c=>c.charCodeAt(0)),offset);
   v.setUint32(4,1636,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,1600,true);
   const A=BAOStoryVoiceAssets,B=BAOStoryVoiceBackup;
   const blob=new Blob([wav],{type:'audio/wav'});
   const saved=await A.save(original,blob,.1,()=>true);
   const bundle=await B.exportStory(original.storyId);
   // Model an existing Blob row at read time. Some WebKit test containers
   // cannot insert new IndexedDB Blob records, which production no longer does.
   const nativeGet=IDBObjectStore.prototype.get;
   IDBObjectStore.prototype.get=function(key){
     const request=nativeGet.call(this,key);
     if(this.name==='audio'&&key===saved.id)Object.defineProperty(request,'result',{value:{id:saved.id,blob}});
     return request;
   };
   let legacy;
   try{legacy=await A.exportPack(original.storyId,[original.chapterId]);}
   finally{IDBObjectStore.prototype.get=nativeGet;}
   const legacyMatches=JSON.stringify(legacy)===JSON.stringify(bundle.audio);
   let rejected=false;const bad=structuredClone(bundle);bad.audio.items[0].hash='0'.repeat(64);
   try{await B.importStory(bad);}catch(_){rejected=true;}
   const imported=await B.importStory(bundle),target={storyId:imported.storyId,chapterId:imported.chapterMap[original.chapterId]};
   const rows=await A.list(target),asset=await A.get(target,rows[0].id);
   const same=Array.from(new Uint8Array(await asset.blob.arrayBuffer())).every((b,i)=>b===wav[i]);
   const deleted=await BAOStoryLibrary.deleteStory(imported.storyId);
   let staleRejected=false;
   try{await A.save(target,blob,.1,()=>true);}catch(e){staleRejected=e.message.includes('已刪除');}
   return {rejected,same,legacyMatches,staleRejected,distinct:target.storyId!==original.storyId,deleted,restored:rows.length,remaining:(await A.list(target)).length,original:(await A.list(original)).length,secret:JSON.stringify(bundle).includes('TEXT-PRIVATE')};
 });
 expect(result).toEqual({rejected:true,same:true,legacyMatches:true,staleRejected:true,distinct:true,deleted:true,restored:1,remaining:0,original:1,secret:false});
});

test('committed chapter deletion preserves a promoted child and blocks stale writes, and a failed audio import removes only its copy', async ({page,context}) => {
  await setup(page,390);
  const original=await page.evaluate(async()=>{
    const A=BAOStoryVoiceAssets,L=BAOStoryLibrary,scope=L.refs();
    const bytes=new TextEncoder().encode('RIFF0000WAVE');
    const audio=new Blob([bytes],{type:'audio/wav'});
    const record=await A.save(scope,audio,1,()=>true);
    const branch=await L.createBranch(Chat.messages[0].id,'子分支');
    await A.save(branch._library,audio,1,()=>true);
    L.adoptRefs({_library:scope});
    return {storyId:scope.storyId,chapterId:scope.chapterId,child:branch._library.chapterId,recordId:record.id};
  });
  const stale=await context.newPage();
  await stale.goto('/');
  await stale.waitForFunction(()=>window.BAOStoryVoiceAssets);
  const before=await stale.evaluate(async scope=>(await BAOStoryVoiceAssets.list(scope)).length,original);
  expect(before).toBe(1);
  const preserved=await page.evaluate(async scope=>{
    const L=BAOStoryLibrary,A=BAOStoryVoiceAssets;
    L.clearRefs();
    if (!await L.deleteChapter(scope.storyId,scope.chapterId)) throw Error("fixture chapter was not deleted");
    const children=await L.listChapters(scope.storyId);
    const audio=await A.list({storyId:scope.storyId,chapterId:scope.child});
    return {promoted:children.length===1&&children[0].chapterId===scope.child&&!children[0].parentChapterId, audio:audio.length};
  },original);
  expect(preserved).toEqual({promoted:true,audio:1});
  expect(await stale.evaluate(async scope=>{
    const asset=new Blob([new TextEncoder().encode('RIFF0000WAVE')],{type:'audio/wav'});
    try{await BAOStoryVoiceAssets.save(scope,asset,1,()=>true);return false;}catch(error){return error.message.includes('已刪除');}
  },original)).toBe(true);
  await stale.close();

  const outcome=await page.evaluate(async scope=>{
    const L=BAOStoryLibrary,A=BAOStoryVoiceAssets,B=BAOStoryVoiceBackup;
    L.clearRefs();
    const pack=await B.exportStory(scope.storyId);
    const prior=(await L.listStories()).map(story=>story.storyId);
    await new Promise((resolve,reject)=>{
      const req=indexedDB.open('yorubay-audio-assets');
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const db=req.result,tx=db.transaction('metadata','readwrite');
        tx.objectStore('metadata').put({id:'quota-fixture',scope:'["unrelated","fixture"]',size:128*1024*1024});
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onabort=()=>{db.close();reject(tx.error);};
      };
    });
    let capacityError=false;
    try{await B.importStory(pack);}catch(error){capacityError=error.message.includes('容量上限');}
    const after=(await L.listStories()).map(story=>story.storyId);
    const child=(await A.list({storyId:scope.storyId,chapterId:scope.child})).length;
    return {same:JSON.stringify(prior)===JSON.stringify(after),capacityError,child};
  },original);
  expect(outcome).toEqual({same:true,capacityError:true,child:1});
});

test('player voice message follows its exact story reply and travels only in the audio backup', async ({page}) => {
 const requests=[];
 await page.route(/https:\/\/(?:text|stt|tts)\.example\.invalid\//, route => {
   requests.push(route.request().url());
   return route.abort();
 });
 await setup(page,390);
 const before=await page.evaluate(()=>JSON.stringify(Chat.messages));
 await openVoice(page,390);
 const dialog=page.getByRole('dialog',{name:'角色語音與語音輸入'});
 await dialog.getByText('玩家錄音／音檔預覽（本機）',{exact:true}).click();
 await dialog.getByLabel('選擇本機音檔').setInputFiles({name:'sample.wav',mimeType:'audio/wav',buffer:voiceWav()});
 await dialog.getByRole('button',{name:'加入故事語音訊息'}).click();
 await expect(dialog.locator('[data-local-audio-status]')).toHaveText('語音訊息已加入本機故事。');
 await dialog.getByRole('button',{name:'關閉',exact:true}).click();
 const voice=page.locator('#chat-stream .yoru-story-voice-message');
 await expect(voice).toHaveCount(1);
 await voice.locator('summary').click();
 await expect(voice.getByLabel('播放玩家語音訊息')).toBeVisible();
 await expect(voice.getByRole('link',{name:'下載語音'})).toHaveAttribute('href',/^blob:/);
 expect(await page.evaluate(()=>JSON.stringify(Chat.messages))).toBe(before);

 const checks=await page.evaluate(async()=>{
   const library=BAOStoryLibrary,base=library.refs(),initial=Chat.messages[0];
   const bundle=await BAOStoryVoiceBackup.exportStory(base.storyId);
   const regular=await BAOStoryBackup.buildBundle(base.storyId);
   const copy=await BAOStoryVoiceBackup.importStory(bundle);
   const imported=await BAOStoryVoiceAssets.list(copy);
   const bad=structuredClone(bundle);
   bad.audio.items[0].delivery.after.revision='0'.repeat(64);
   let rejected=false;
   try{await BAOStoryVoiceBackup.importStory(bad);}catch(_){rejected=true;}
   const branch=await library.createBranch(initial.id,'另一條路');
   const others=await BAOStoryVoiceAssets.list(branch._library);
   library.adoptRefs({_library:base});
   Chat.messages[0]={...initial,variants:[initial.variants[0],{...initial.variants[0]}],activeVariant:1};
   App.renderChatShell(false);
   await BAOStoryVoiceMessages.refresh();
   return {
     format:bundle.audio.version,
     noAudioInRegular:!JSON.stringify(regular).includes(bundle.audio.items[0].delivery.id),
     copied:imported[0]?.delivery?.after.id===initial.id,
     isolated:others.length===0,
     rejected
   };
 });
 expect(checks).toEqual({format:2,noAudioInRegular:true,copied:true,isolated:true,rejected:true});
 await expect(voice).toHaveCount(0);
 expect(requests).toEqual([]);
});

test('Phone voice messages stay in the addressed private or group conversation', async ({page}) => {
 const requests=[];
 await page.route(/https:\/\/(?:text|stt|tts)\.example\.invalid\//, route => {
   requests.push(route.request().url());
   return route.abort();
 });
 await setup(page,390);
 const before=await page.evaluate(()=>{
   App.activeCharacter.phone_ui={
     enabled:true,userName:'旅人',contactName:'A',
     contacts:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}],
     threads:[
       {id:'private-a',name:'A 的私訊',participants:['a'],messages:[]},
       {id:'group-ab',name:'AB 群組',participants:['a','b'],messages:[]},
       {id:'group-ac',name:'AC 群組',participants:['a','c'],messages:[]}
     ]
   };
   App.renderChatShell(false);
   return JSON.stringify(Chat.messages);
 });
 const messages=page.locator('.bp-voice-messages .yoru-story-voice-message');
 async function enter(name){
   await page.locator('#bao-phone-launch').click();
   await page.locator('.bp-home-handle').click();
   await page.locator('.bp-apps .bp-icon-kakao').click();
   await page.locator('[data-phone-action^="thread:"]').filter({hasText:name}).click();
 }
 async function send(recipient){
   await page.getByRole('button',{name:'語音訊息',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Phone 語音訊息'});
   await expect(dialog).toContainText(recipient);
   await dialog.getByLabel('選擇本機音檔').setInputFiles({name:'sample.wav',mimeType:'audio/wav',buffer:voiceWav()});
   await dialog.getByRole('button',{name:'傳送本機語音'}).click();
   await expect(dialog).toHaveCount(0);
   await expect(messages).toHaveCount(1);
 }
 const closePhone=()=>page.getByRole('button',{name:'關閉手機'}).click();
 await enter('A 的私訊');
 await page.getByLabel('手機訊息').fill('尚未送出的文字');
 await send('傳給 A 的私訊');
 await expect(page.getByLabel('手機訊息')).toHaveValue('尚未送出的文字');
 await messages.locator('summary').click();
 await expect(messages.getByRole('link',{name:'下載語音'})).toHaveAttribute('href',/^blob:/);
 await closePhone();
 await enter('AB 群組');
 await expect(messages).toHaveCount(0);
 await send('AB 群組（A、B）');
 await closePhone();
 await enter('AC 群組');
 await expect(messages).toHaveCount(0);
 await closePhone();
 await enter('A 的私訊');
 await expect(messages).toHaveCount(1);
 await closePhone();
 await enter('AB 群組');
 await expect(messages).toHaveCount(1);
 await page.evaluate(()=>{
   App.activeCharacter.phone_ui.threads.find(thread=>thread.id==='group-ab').participants=['a','c'];
   BAOPhoneUI.refreshFromState();
 });
 await expect(messages).toHaveCount(0);
 await closePhone();
 await expect(page.locator('#chat-stream .yoru-story-voice-message')).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.stringify(Chat.messages))).toBe(before);
 expect(requests).toEqual([]);
});
