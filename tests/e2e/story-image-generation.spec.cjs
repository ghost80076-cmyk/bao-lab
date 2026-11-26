const {test,expect}=require('@playwright/test');
if(process.env.STORY_IMAGES_BASE_URL)test.use({baseURL:process.env.STORY_IMAGES_BASE_URL});
async function ready(page){await page.waitForFunction(()=>window.BAOExtensionLoadHealth?.snapshot().story==='ready' && BAOExtensionLoadHealth.snapshot().world==='ready' && window.BAOStoryImagePrompts && window.BAOImageGeneration && window.BAOStoryBackup && Storage.status().ready);}
async function setup(page,width=390){
 await page.setViewportSize({width,height:900});
 const calls=[];let png='';
 await page.route(/https:\/\/(api\.openai\.com|generativelanguage\.googleapis\.com|openrouter\.ai)\//,async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  calls.push({url:route.request().url(),body:route.request().postData()});
  return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({data:[{b64_json:png,media_type:'image/png'}]})});
 });
 await page.goto('/');await ready(page);
 png=await page.evaluate(()=>{
  App.activeCharacter=CharacterEngine.normalize({id:'image-phase-two-test',name:'圖像測試',system_prompt:'fixture',greeting:'start',initial_state:{npcs:[{id:'a',name:'A',appearance:'黑髮、棕色眼睛',outfit:'灰色外套'}]},phone_ui:{enabled:true,userName:'旅人',photos:[{id:'authored',title:'作者照片',src:'assets/brand/yorubay-logo.png'}]}});
  App.config={narrativeMode:'world',displayMode:'text',persona:{name:'旅人'},api:{type:'custom',protocol:'openai',model:'text-fixture',key:'TEXT-KEY-PRIVATE',baseUrl:'https://text.example.invalid/v1/chat/completions'},memory:{mode:'rounds',maxRounds:20,maxContext:32000},cost:{enabled:false}};
  Chat.reset();GameState.create(App.activeCharacter,App.config);BAOStoryLibrary.beginStory('圖像測試');
  Chat.add('assistant','A 站在雨夜的窗邊，穿著灰色外套。B 在另一個房間。');App.showView('chat');App.renderChatShell(false);App.saveStory(false);
  const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle='#573875';x.fillRect(0,0,600,400);x.fillStyle='#e6dced';x.fillRect(160,80,200,240);return c.toDataURL('image/png').split(',')[1];
 });
 await page.evaluate(()=>BAOStorageWriteGuard.whenIdle());
 await expect(page.locator('[data-bao-scene-prompt]').first()).toBeVisible();
 return calls;
}
async function open(page){await page.locator('[data-bao-scene-prompt]').first().click();await expect(page.getByRole('dialog',{name:'將此刻化成畫面'})).toBeVisible();}
const consent=page=>page.getByLabel('我確認本次圖片請求可能收費，並同意將以下完整提示詞及已選參考圖送給此供應商。');
async function generate(page){await page.getByLabel('圖片 API Key（只留在本頁，重載後需重填）').fill('IMAGE-KEY-PRIVATE');await consent(page).check();await page.getByRole('button',{name:'確認並生成 1 張圖片'}).click();await expect(page.getByText('圖片已生成，尚未保存。重新生成需再次勾選費用確認。')).toBeVisible();}
for(const width of [320,390,834,1440])test(`scene generate save reload portable backup and Phone at ${width}px`,async({page})=>{
 const calls=await setup(page,width);
 const before=await page.evaluate(()=>({state:JSON.stringify(GameState.current),messages:JSON.stringify(Chat.messages),card:JSON.stringify(App.activeCharacter),api:JSON.stringify(App.config.api)}));
 await open(page);expect(calls).toHaveLength(0);
 const model=page.getByLabel('圖片模型',{exact:true});
 await expect(model).toHaveValue('gpt-image-2.6-flare');
 await expect(model.locator('option[value="gpt-image-1.5"],option[value="gpt-image-1-mini"]')).toHaveCount(0);
 await page.getByRole('button',{name:'確認並生成 1 張圖片'}).click();expect(calls).toHaveLength(0);
 await generate(page);expect(calls).toHaveLength(1);expect(calls[0].url).toContain('/images/generations');expect(calls[0].body).not.toContain('TEXT-KEY');
 await page.getByLabel('加入本章 Phone 相簿').check();await page.getByRole('button',{name:'保存圖片',exact:true}).click();
 await expect(page.getByText('圖片與引用已保存到本機。跨裝置請使用「故事＋生成圖片」備份。')).toBeVisible();
 expect(await page.evaluate(()=>({state:JSON.stringify(GameState.current),messages:JSON.stringify(Chat.messages),card:JSON.stringify(App.activeCharacter),api:JSON.stringify(App.config.api)}))).toEqual(before);
 const geometry=await page.getByRole('dialog',{name:'將此刻化成畫面'}).evaluate(node=>({width:node.getBoundingClientRect().width,scroll:node.scrollWidth,client:node.clientWidth}));expect(geometry.scroll).toBeLessThanOrEqual(geometry.client+1);expect(geometry.width).toBeLessThanOrEqual(width);
 await test.info().attach(`image-generation-${width}`,{body:await page.screenshot({path:test.info().outputPath('image-generation.png')}),contentType:'image/png'});
 const portable=await page.evaluate(async()=>{
  const bundle=await BAOImageGeneration.exportStory();
  const imported=await BAOImageGeneration.importStory(JSON.parse(JSON.stringify(bundle)));
  const records=await BAOImageAssets.list(imported.storyId);
  return {count:records.length,chapter:records[0].chapterId,expected:imported.chapterId,assetId:records[0].assetId,hasKey:JSON.stringify(bundle).includes('-KEY-PRIVATE'),assets:bundle.images.assets.length};
 });expect(portable.count).toBe(1);expect(portable.chapter).toBe(portable.expected);expect(portable.hasKey).toBe(false);expect(portable.assets).toBe(1);
 await page.keyboard.press('Escape');await expect(page.locator('[data-bao-scene-prompt]').first()).toBeFocused();
 await page.locator('#bao-phone-launch').click();await page.locator('.bp-home-handle').click();await page.locator('[data-phone-action="app:photos"]').click();
 await expect(page.locator('.bao-phone-overlay').getByText('玩家生成收藏',{exact:true})).toBeVisible();await expect(page.locator('.bao-phone-overlay .image-gen-thumb')).toHaveCount(1);
 await page.evaluate(()=>BAOPhoneUI.close());await page.reload();await ready(page);
 await page.evaluate(()=>{Storage.restoreStory(Storage.loadStory());App.showView('chat');App.renderChatShell(false);});
 await expect(page.locator('.generated-story-pictures')).toHaveCount(1);
 await open(page);await expect(page.getByLabel('圖片 API Key（只留在本頁，重載後需重填）')).toHaveValue('');
});
test('selfie authorized reference, repeated request confirmation and modal focus',async({page})=>{
 const calls=await setup(page);await open(page);
 await expect.poll(()=>page.getByRole('dialog',{name:'將此刻化成畫面'}).evaluate(node=>node.contains(document.activeElement))).toBe(true);
 await page.getByLabel('圖片類型',{exact:true}).selectOption('selfie');
 await expect(page.getByLabel('角色外貌（只用於這張照片）')).toHaveValue(/黑髮/);
 await page.getByLabel('拍攝場景、服裝、表情、構圖與風格').fill('窗邊半身自拍，自然微笑');
 await page.getByRole('button',{name:'套用現有 Prompt／角色與拍攝設定'}).click();await expect(page.getByLabel('即將送出的完整圖片提示詞（可修改）')).toHaveValue(/黑髮/);
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=40;return c.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('選用已授權的角色參考圖').setInputFiles({name:'ref.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
 await expect(page.getByText('參考圖已在本機縮圖；只有主動生成時才傳送。')).toBeVisible();
 await page.getByLabel('圖片 API Key（只留在本頁，重載後需重填）').fill('IMAGE-KEY-PRIVATE');await consent(page).check();await page.getByRole('button',{name:'確認並生成 1 張圖片'}).click();expect(calls).toHaveLength(0);
 await page.getByLabel('我有權將此參考圖片送給所選供應商。').check();await page.getByRole('button',{name:'確認並生成 1 張圖片'}).click();
 await expect(page.getByText('圖片已生成，尚未保存。重新生成需再次勾選費用確認。')).toBeVisible();expect(calls).toHaveLength(1);expect(calls[0].url).toContain('/images/edits');
 await page.getByRole('button',{name:'確認並生成 1 張圖片'}).click();expect(calls).toHaveLength(1);
 const dialog=page.getByRole('dialog',{name:'將此刻化成畫面'});await dialog.getByRole('button',{name:'關閉',exact:true}).focus();await page.keyboard.press('Tab');expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
});
test('provider errors, cancel and duplicate clicks are safe and never retry',async({page})=>{
 await setup(page);await open(page);let count=0;
 await page.route('https://api.openai.com/v1/images/generations',async route=>{count++;await route.fulfill({status:429,body:'IMAGE-KEY-PRIVATE data:image/png private-prompt'});});
 await page.getByLabel('圖片 API Key（只留在本頁，重載後需重填）').fill('IMAGE-KEY-PRIVATE');await consent(page).check();await page.getByRole('button',{name:'確認並生成 1 張圖片'}).click();
 await expect(page.getByText(/HTTP 429/)).toBeVisible();expect(count).toBe(1);expect(await page.getByRole('dialog').innerText()).not.toContain('IMAGE-KEY-PRIVATE');
 await page.route('https://api.openai.com/v1/images/generations',async route=>{count++;await new Promise(resolve=>setTimeout(resolve,800));await route.fulfill({status:500,body:'private'}).catch(()=>{});});
 await consent(page).check();await page.getByRole('button',{name:'確認並生成 1 張圖片'}).click();await expect(page.getByRole('button',{name:'確認並生成 1 張圖片'})).toBeDisabled();await page.getByRole('button',{name:'取消等待'}).click();
 await expect(page.getByText(/已取消或逾時/)).toBeVisible();expect(count).toBe(2);await expect(page.getByRole('button',{name:'保存圖片',exact:true})).toHaveCount(0);
});
test('deduplication, branch ownership, rollback visibility and final-reference deletion',async({page})=>{
 await setup(page);
 const evidence=await page.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=80;c.height=40;const blob=await new Promise(r=>c.toBlob(r));const asset=await BAOImageAssets.prepare(blob),s=BAOImageAssets.scope();
  const meta={...s,messageId:s.messageIds[0],title:'one',createdAt:new Date().toISOString(),inStory:true,inPhone:true};
  const parent=await BAOImageAssets.save(asset,meta);await BAOImageAssets.save(asset,meta);
  const branch=BAOStoryLibrary.beginBranch({messageId:meta.messageId,seq:0});
  const inherited=BAOImageAssets.visible(await BAOImageAssets.list(s.storyId)).length;
  const copy=await BAOImageAssets.save(asset,{...meta,...branch});
  const archived=BAOImageAssets.visible(await BAOImageAssets.list(s.storyId),{...BAOImageAssets.scope(),messageIds:[]}).length;
  await BAOImageAssets.remove(copy.id);const retained=!!await BAOImageAssets.get(asset.id);
  const pack=await BAOImageAssets.exportPack(s.storyId);await BAOImageAssets.remove(parent.id);
  return {inherited,archived,retained,removed:!await BAOImageAssets.get(asset.id),assets:pack.assets.length,links:pack.links.length};
 });expect(evidence).toEqual({inherited:0,archived:0,retained:true,removed:true,assets:1,links:1});
});
test('atomic storage failure retains downloadable result; bad backup never creates partial story',async({page})=>{
 await setup(page);await open(page);await generate(page);
 await page.evaluate(()=>{window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='assets')throw new DOMException('full','QuotaExceededError');return window.__originalPut.apply(this,args);};});
 await page.getByRole('button',{name:'保存圖片',exact:true}).click();await expect(page.getByText(/圖片資料操作失敗|圖片儲存失敗/)).toBeVisible();
 await expect(page.getByRole('button',{name:'下載圖片',exact:true})).toBeVisible();
 expect(await page.evaluate(async()=> (await BAOImageAssets.list(BAOImageAssets.scope().storyId)).length)).toBe(0);
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalPut;});await page.getByRole('button',{name:'保存圖片',exact:true}).click();await expect(page.getByText('圖片與引用已保存到本機。跨裝置請使用「故事＋生成圖片」備份。')).toBeVisible();
 const bad=await page.evaluate(async()=>{const bundle=await BAOImageGeneration.exportStory(),before=(await BAOStoryLibrary.allRecords()).length;bundle.images.assets[0].data='PHN2Zz48L3N2Zz4=';let rejected=false;try{await BAOImageGeneration.importStory(bundle);}catch(_){rejected=true;}return {rejected,before,after:(await BAOStoryLibrary.allRecords()).length};});
 expect(bad.rejected).toBe(true);expect(bad.after).toBe(bad.before);
 const compensated=await page.evaluate(async()=>{
  const bundle=await BAOImageGeneration.exportStory(),storyId=BAOImageAssets.scope().storyId;
  const activeIds=async()=>(await BAOStoryLibrary.allRecords()).filter(r=>r.kind!=='deletion').map(r=>r.id).sort();
  const before=await activeIds();
  const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='links')throw new DOMException('full','QuotaExceededError');return put.apply(this,args);};
  let rejected=false;try{await BAOImageGeneration.importStory(bundle);}catch(_){rejected=true;}finally{IDBObjectStore.prototype.put=put;}
  return {rejected,before,after:await activeIds(),originalImages:(await BAOImageAssets.list(storyId)).length};
 });expect(compensated.rejected).toBe(true);expect(compensated.after).toEqual(compensated.before);expect(compensated.originalImages).toBe(1);
});
test('large collection pages thumbnails without injecting image bytes or changing long-story reading',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{for(let i=0;i<80;i++){Chat.add('user','問題 '+i);Chat.add('assistant','長篇內容。'.repeat(300));}App.renderChatShell(false);});
 // Let the existing shell's deferred initial scroll finish before simulating a reader.
 await expect(page.locator('[data-bao-scene-prompt]')).toHaveCount(81);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,0)))));
 const metrics=await page.evaluate(async()=>{
  const stream=document.getElementById('chat-stream');stream.scrollTop=12000;
  const anchor=[...stream.querySelectorAll('.message')].find(node=>node.getBoundingClientRect().bottom>stream.getBoundingClientRect().top);
  const before=anchor.getBoundingClientRect().top;
  const c=document.createElement('canvas');c.width=20;c.height=20;const asset=await BAOImageAssets.prepare(await new Promise(r=>c.toBlob(r))),scope=BAOImageAssets.scope();
  for(let i=0;i<30;i++)await BAOImageAssets.save(asset,{...scope,messageId:scope.messageIds[i],title:'圖片'+i,createdAt:new Date().toISOString(),inPhone:true,inStory:true});
  await BAOImageGeneration.renderStory();
  return {before,after:anchor.getBoundingClientRect().top,leak:JSON.stringify(GameState.current).includes('sha256-')||JSON.stringify(Chat.messages).includes('sha256-')};
 });expect(metrics.after).toBe(metrics.before);expect(metrics.leak).toBe(false);
 await open(page);await page.getByText('生成圖集與完整備份',{exact:true}).click();await page.getByLabel('顯示本故事所有章節與已回溯圖片').check();
 await expect(page.locator('.image-gen-gallery article')).toHaveCount(12);await page.getByRole('button',{name:'載入更多',exact:true}).click();await expect(page.locator('.image-gen-gallery article')).toHaveCount(24);
});
test('private photo exchange sends vision once and delivers only on confirmation',async({page})=>{
 const imageCalls=await setup(page);
 await page.evaluate(()=>{
   App.activeCharacter.phone_ui.contactName='A';
   App.config.api.baseUrl='https://vision.example.test/v1/chat/completions';
   App.config.api.visionConfirmedRoute=BAOStoryImagesCore.routeKey(App.config.api);
 });
 const vision=[];
 await page.route('https://vision.example.test/**',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
   const payload=route.request().postDataJSON();vision.push(payload);
   const reply='回覆私訊。[[YORUBAY_PHONE_V1]]'+JSON.stringify({chat:[{from:'them',text:'看見你的晚餐了。'}],photoOffer:{threadId:'',description:'窗外的夜雨',kind:'scene'}})+'[[/YORUBAY_PHONE_V1]]';
   return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({choices:[{message:{content:reply},finish_reason:'stop'}]})});
 });
 async function enter(){
   await page.locator('#bao-phone-launch').click();await page.locator('.bp-home-handle').click();
   await page.locator('[data-phone-action="app:kakao"]').first().click();await page.locator('[data-phone-action="kakao-chat"]').click();
 }
 await enter();
 const png=await page.evaluate(()=>document.createElement('canvas').toDataURL('image/png').split(',')[1]);
 await page.locator('.bp-dm-photo-controls input[type=file]').setInputFiles({name:'dinner.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.getByAltText('待傳送私訊照片')).toBeVisible();
 await page.getByRole('button',{name:'傳送至故事',exact:true}).click();
 await expect(page.getByText('看見你的晚餐了。',{exact:true}).last()).toBeVisible();
 expect(vision.filter(body=>body.messages?.some(m=>Array.isArray(m.content) && m.content.some(p=>p.type==='image_url')))).toHaveLength(1);
 await expect(page.getByAltText('你傳給A的照片')).toBeVisible();
 expect(await page.locator('.bp-thread').evaluate(thread=>{
   const photo=thread.querySelector('.bp-mine img'),reply=thread.querySelector('.bp-bubble');
   return Boolean(photo.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING);
 })).toBe(true);
 const offer=page.getByRole('button',{name:'查看照片提議'});
 await offer.click();await page.keyboard.press('Escape');await expect(offer).toBeVisible();
 expect(imageCalls).toHaveLength(0);
 await offer.click();await generate(page);expect(imageCalls).toHaveLength(1);
 expect(await page.evaluate(async()=>(await BAOImageAssets.list(BAOImageAssets.scope().storyId)).length)).toBe(0);
 await page.getByRole('button',{name:'傳送至這段私訊'}).click();
 await expect(page.getByText('A 已傳送照片',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'收藏至 Phone 相簿'}).click();
 await expect.poll(()=>page.evaluate(async()=>(await BAOImageAssets.list(BAOImageAssets.scope().storyId))[0]?.inPhone)).toBe(true);
 await page.evaluate(()=>BAOPhoneUI.close());await enter();await expect(offer).toHaveCount(0);
 await expect(page.getByText('A 已傳送照片',{exact:true})).toBeVisible();
 await page.evaluate(()=>BAOPhoneUI.close());await page.reload();await ready(page);
 await page.evaluate(()=>{Storage.restoreStory(Storage.loadStory());App.showView('chat');App.renderChatShell(false);});
 await enter();await expect(page.getByText('A 已傳送照片',{exact:true})).toBeVisible();
 await expect(page.getByAltText('你傳給A的照片')).toBeVisible();
 await page.evaluate(()=>{BAOPhoneUI.close();App.activeCharacter.phone_ui.contactName='B';});
 await enter();await expect(page.locator('.bp-dm-photo-controls')).toBeVisible();
 await expect(page.locator('.bp-dm-photo')).toHaveCount(0);

});

test('group photo exchange isolates recipients and requires explicit delivery',async({page})=>{
 const imageCalls=await setup(page,390);
 await page.evaluate(()=>{
   App.activeCharacter.phone_ui.contactName='A';
   App.activeCharacter.phone_ui.contacts=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}];
   App.activeCharacter.phone_ui.threads=[{id:'group-ab',name:'AB 群組',participants:['a','b'],messages:[]},{id:'group-ac',name:'AC 群組',participants:['a','c'],messages:[]}];
   App.config.api.baseUrl='https://vision.example.test/v1/chat/completions';
   App.config.api.visionConfirmedRoute=BAOStoryImagesCore.routeKey(App.config.api);
 });
 const vision=[];
 await page.route('https://vision.example.test/**',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
   vision.push(route.request().postDataJSON());
   const reply='回覆群聊。[[YORUBAY_PHONE_V1]]'+JSON.stringify({threads:[{id:'group-ab',messages:[{from:'them',senderId:'a',text:'收到晚餐照。'},{from:'them',senderId:'b',text:'我也分享一張。'}]}],photoOffer:{threadId:'group-ab',senderId:'b',description:'B 的窗外夜景',kind:'scene'}})+'[[/YORUBAY_PHONE_V1]]';
   return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({choices:[{message:{content:reply},finish_reason:'stop'}]})});
 });
 async function enter(name){
   await page.locator('#bao-phone-launch').click();await page.locator('.bp-home-handle').click();
   await page.locator('[data-phone-action="app:kakao"]').first().click();
   await page.locator('[data-phone-action^="thread:"]').filter({hasText:name}).click();
 }
 await enter('AB 群組');
 const png=await page.evaluate(()=>document.createElement('canvas').toDataURL('image/png').split(',')[1]);
 await page.locator('.bp-dm-photo-controls input[type=file]').setInputFiles({name:'group.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.getByAltText('待傳送群聊照片')).toBeVisible();
 await expect(page.locator('.bp-dm-photo-controls')).toContainText('A、B');
 await page.getByRole('button',{name:'傳送至故事',exact:true}).click();
 await expect(page.getByText('B 提議分享照片',{exact:true})).toBeVisible();
 expect(vision.filter(body=>body.messages?.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='image_url')))).toHaveLength(1);
 expect(await page.evaluate(()=>Chat.messages.findLast(m=>m.role==='user').content)).toContain('群聊成員 ID：["a","b"]');
 await page.getByRole('button',{name:'查看照片提議'}).click();await generate(page);
 expect(imageCalls).toHaveLength(1);
 expect(await page.evaluate(async()=>(await BAOImageAssets.list(BAOImageAssets.scope().storyId)).length)).toBe(0);
 await page.getByRole('button',{name:'傳送至這段群聊'}).click();
 await expect(page.getByText('B 已傳送照片',{exact:true})).toBeVisible();
 await page.evaluate(()=>BAOPhoneUI.close());await enter('AC 群組');
 await expect(page.locator('.bp-dm-photo')).toHaveCount(0);
 await page.evaluate(()=>BAOPhoneUI.close());await enter('AB 群組');
 await expect(page.getByText('B 已傳送照片',{exact:true})).toBeVisible();
 await page.evaluate(()=>{BAOPhoneUI.close();const thread=GameState.current.phoneUI.threads.find(t=>t.id==='group-ab');thread.participants=['a','c'];});
 await enter('AB 群組');
 await expect(page.locator('.bp-dm-photo')).toHaveCount(0);
});

test('X photo exchange publishes only explicit public attachments and NPC confirmed photos',async({page})=>{
 const imageCalls=await setup(page,390);
 await page.evaluate(()=>{
   App.activeCharacter.phone_ui.contactName='A';
   App.activeCharacter.phone_ui.contacts=[{id:'a',name:'A'},{id:'b',name:'B'}];
   App.activeCharacter.phone_ui.tweets=[{id:'root',authorId:'a',authorName:'A',text:'今日的公開貼文'},{id:'other',authorId:'b',authorName:'B',text:'其他公開貼文'}];
   App.config.api.baseUrl='https://vision.example.test/v1/chat/completions';
   App.config.api.visionConfirmedRoute=BAOStoryImagesCore.routeKey(App.config.api);
 });
 const vision=[];
 await page.route('https://vision.example.test/**',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
   const payload=route.request().postDataJSON();vision.push(payload);
   const reply='公開回覆。[[YORUBAY_PHONE_V1]]'+JSON.stringify({tweets:[{id:'npc-x-photo',authorId:'b',authorName:'B',replyTo:'root',text:'我也想分享風景。'}],xPhotoOffer:{postId:'npc-x-photo',senderId:'b',description:'河邊風景',kind:'scene'}})+'[[/YORUBAY_PHONE_V1]]';
   return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({choices:[{message:{content:reply},finish_reason:'stop'}]})});
 });
 async function enter(){
   await page.locator('#bao-phone-launch').click();await page.locator('.bp-home-handle').click();
   await page.locator('[data-phone-action="app:x"]').first().click();
 }
 await enter();
 await page.locator('[data-phone-action="x-post:root"]').click();
 const png=await page.evaluate(()=>document.createElement('canvas').toDataURL('image/png').split(',')[1]);
 await page.locator('.bp-dm-photo-controls input[type=file]').setInputFiles({name:'public.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.getByAltText('待公開發布的 X 照片')).toBeVisible();
 await expect(page.locator('.bp-dm-photo-controls')).toContainText('故事內公開 X 留言');
 await page.getByRole('button',{name:'傳送至故事',exact:true}).click();
 await expect(page.getByAltText('你公開發布的 X 照片')).toBeVisible();
 expect(vision.filter(body=>body.messages?.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='image_url')))).toHaveLength(1);
 const offer=page.getByRole('button',{name:'查看公開照片提議'});
 await expect(offer).toBeVisible();expect(imageCalls).toHaveLength(0);
 await offer.click();await generate(page);expect(imageCalls).toHaveLength(1);
 expect(await page.evaluate(async()=>(await BAOImageAssets.list(BAOImageAssets.scope().storyId)).length)).toBe(0);
 await page.getByRole('button',{name:'確認發布至 X'}).click();
 await expect(page.getByText('已公開發布照片',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'收藏至 Phone 相簿'}).click();
 await expect.poll(()=>page.evaluate(async()=>(await BAOImageAssets.list(BAOImageAssets.scope().storyId))[0]?.inPhone)).toBe(true);
 await page.evaluate(()=>BAOPhoneUI.close());await enter();
 await page.locator('[data-phone-action="x-post:other"]').click();
 await expect(page.locator('.bp-x-photo')).toHaveCount(0);
 await page.evaluate(()=>BAOPhoneUI.close());
 await page.locator('#bao-phone-launch').click();await page.locator('.bp-home-handle').click();
 await page.locator('[data-phone-action="app:kakao"]').first().click();await page.locator('[data-phone-action="kakao-chat"]').click();
 await expect(page.locator('.bp-dm-photo')).toHaveCount(0);
 await page.evaluate(()=>BAOPhoneUI.close());await enter();await page.locator('[data-phone-action="x-post:root"]').click();
 await expect(page.getByAltText('你公開發布的 X 照片')).toBeVisible();
 await expect(page.getByText('已公開發布照片',{exact:true})).toBeVisible();
});
