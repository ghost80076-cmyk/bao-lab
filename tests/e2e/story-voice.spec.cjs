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
 await details.locator('summary').click();
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
