const {test,expect}=require('@playwright/test');
async function setup(page,width){
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>{
  window.__voiceCalls=[];window.__recognitions=0;
  const voices=[{voiceURI:'ja',name:'Japanese fixture',lang:'ja-JP',localService:true},{voiceURI:'ko',name:'Korean fixture',lang:'ko-KR',localService:true},{voiceURI:'remote',name:'Remote fixture',lang:'ja-JP',localService:false}];
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>voices,speak:u=>window.__voiceCalls.push({text:u.text,lang:u.lang,rate:u.rate,voice:u.voice.voiceURI}),cancel(){},addEventListener(){},removeEventListener(){}}});
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(text){this.text=text;}}});
  Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:class{start(){window.__recognitions++;setTimeout(()=>{this.onresult?.({results:[{isFinal:true,0:{transcript:'今天好累'}}]});this.onend?.();},20);}stop(){this.onend?.();}abort(){}}});
 });
 await page.goto('/');
 await page.waitForFunction(()=>window.BAOExtensionLoadHealth?.snapshot().story==='ready'&&BAOExtensionLoadHealth.snapshot().world==='ready'&&window.BAOStoryVoice&&Storage.status().ready);
 await page.evaluate(()=>{
  App.activeCharacter=CharacterEngine.normalize({id:'voice-test',name:'角色',system_prompt:'fixture',greeting:'start',initial_state:{npcs:[{id:'a',name:'A'},{id:'b',name:'B'}]}});
  App.config={narrativeMode:'world',displayMode:'text',persona:{name:'旅人'},api:{type:'custom',protocol:'openai',model:'fixture',key:'TEXT-PRIVATE',baseUrl:'https://text.example.invalid/v1/chat/completions'},memory:{mode:'rounds',maxRounds:20,maxContext:32000},cost:{enabled:false}};
  Chat.reset();GameState.create(App.activeCharacter,App.config);BAOStoryLibrary.beginStory('語音測試');
  Chat.add('assistant','他走到窗邊。「晚安。」');App.showView('chat');App.renderChatShell(false);App.saveStory(false);
 });
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
