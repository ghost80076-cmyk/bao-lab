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

test('custom STT is opt-in, cancel-safe and only fills editable draft',async({page})=>{
 await page.addInitScript(()=>{
   window.__sttMic=0;window.__sttStopped=0;
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
   expect(route.request().postData()).toContain('audio-fixture');
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
 await expect(d.getByRole('status')).toContainText('錄音中');
 await d.getByRole('button',{name:'取消本次錄音／辨識'}).click();
 expect(requests).toBe(0);expect(await page.evaluate(()=>window.__sttStopped)).toBeGreaterThan(0);
 await consent.check();await d.getByRole('button',{name:'開始語音辨識'}).click();
 await expect(d.getByRole('status')).toContainText('錄音中');
 await d.getByRole('button',{name:'停止辨識',exact:true}).click();
 await expect(d.getByLabel('辨識文字預覽（可修改）')).toHaveValue('繁體中文測試');
 expect(requests).toBe(1);
 await d.getByLabel('辨識文字預覽（可修改）').fill('修改後');
 failNext=true;
 await consent.check();await d.getByRole('button',{name:'開始語音辨識'}).click();
 await expect(d.getByRole('status')).toContainText('錄音中');
 await d.getByRole('button',{name:'停止辨識',exact:true}).click();
 await expect(d.getByRole('status')).toContainText('STT 辨識失敗');
 await expect(d.getByRole('status')).not.toContainText('PRIVATE-SERVICE-ERROR');
 await expect(d.getByLabel('辨識文字預覽（可修改）')).toHaveValue('修改後');
 expect(requests).toBe(2);
 expect(await page.evaluate(()=>window.__recognitions)).toBe(0);
 await expect(page.locator('#user-input')).toHaveValue('原稿');
 await d.getByRole('button',{name:'將文字填入故事輸入框'}).click();
 await expect(page.locator('#user-input')).toHaveValue('原稿\n修改後');
 expect(await page.evaluate(()=>Chat.messages.filter(m=>m.role==='user').length)).toBe(0);
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('STT-PRIVATE');
 await openVoice(page,390);await expect(d.getByLabel('語音辨識來源')).toHaveValue('device');
});
