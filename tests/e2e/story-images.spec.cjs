const {test,expect}=require('@playwright/test');
if (process.env.STORY_IMAGES_BASE_URL) test.use({baseURL:process.env.STORY_IMAGES_BASE_URL});
async function ready(page) {
  await page.waitForFunction(()=>window.BAOExtensionLoadHealth?.snapshot().story==='ready'
    && BAOExtensionLoadHealth.snapshot().world==='ready' && Storage.status().ready && window.BAOStoryImages && window.BAOStoryBackup);
}
async function setup(page,width=390,reply='A 看著照片，指出門邊的陰影。B 尚未見過照片。') {
  await page.setViewportSize({width,height:900});
  const requests=[];
  await page.route('https://vision.example.test/**',async route=>{
    if (route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
    requests.push(route.request().postDataJSON());
    await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({choices:[{message:{content:reply},finish_reason:'stop'}],usage:{prompt_tokens:120,completion_tokens:20,total_tokens:140}})});
  });
  await page.goto('/');await ready(page);
  await page.evaluate(()=>{
    App.activeCharacter=App.characters[0];
    App.config={narrativeMode:'world',displayMode:'text',persona:{name:'旅人'},api:{type:'custom',protocol:'openai',model:'fixture-vision',key:'FAKE-TEST-KEY',baseUrl:'https://vision.example.test/v1/chat/completions'},memory:{mode:'rounds',maxRounds:20,maxContext:32000},cost:{enabled:false}};
    App.config.api.visionConfirmedRoute=BAOStoryImagesCore.routeKey(App.config.api);
    Chat.reset();GameState.create(App.activeCharacter,App.config);
    Chat.add('assistant','故事開始。');App.showView('chat');App.renderChatShell(false);
  });
  return requests;
}
async function select(page,color='red') {
  // Generate the fixture through each real browser's encoder, not image mocks.
  const data=await page.evaluate(color=>{const c=document.createElement('canvas');c.width=1600;c.height=800;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,1600,800);return c.toDataURL('image/png').split(',')[1]},color);
  await page.locator('#story-image-file').setInputFiles({name:'room.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  await expect(page.locator('#story-image-status')).toContainText('圖片已準備好');
}
async function send(page,text='只有 A 看到這張房間照片，哪裡不對勁？') {
  const before=await page.evaluate(()=>Chat.messages.length);
  await page.locator('#user-input').fill(text);
  await page.locator('[data-send-message]').click();
  await page.waitForFunction(before=>!App.__requestPending && Chat.messages.at(-1)?.role==='assistant' && Chat.messages.length>=before+2,before);
  expect(await page.evaluate(()=>BAOStorageWriteGuard.whenIdle())).toBe(true);
}
for (const width of [320,390,834,1440]) test(`select replace remove send and portable story at ${width}px`,async({page})=>{
  const requests=await setup(page,width);
  await page.locator('#user-input').fill('草稿保留');
  await select(page);
  const first=await page.locator('#story-image-panel img').getAttribute('src');
  expect(requests).toHaveLength(0);
  await select(page,'blue');
  expect(await page.locator('#story-image-panel img').getAttribute('src')).not.toBe(first);
  await page.locator('[data-image-remove]').click();
  await expect(page.locator('#story-image-panel')).toBeHidden();
  await expect(page.locator('#user-input')).toHaveValue('草稿保留');
  await select(page);
  const geometry=await page.evaluate(()=>{
    const pick=document.getElementById('story-image-pick').getBoundingClientRect(),input=document.getElementById('user-input').getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth,pick:[pick.width,pick.height],inputBottom:input.bottom,rowDifference:Math.abs(pick.bottom-input.bottom)};
  });
  expect(geometry.overflow).toBe(false);expect(geometry.pick[0]).toBeGreaterThanOrEqual(44);expect(geometry.pick[1]).toBeGreaterThanOrEqual(44);expect(geometry.inputBottom).toBeLessThanOrEqual(902);
  expect(geometry.rowDifference).toBeLessThanOrEqual(2);
  await test.info().attach('image-preview-'+width,{body:await page.screenshot(),contentType:'image/png'});
  await send(page,width===320?'':'只有 A 看到這張房間照片，哪裡不對勁？');
  const request=requests.find(r=>Array.isArray(r.messages?.at(-1)?.content));
  expect(request.messages.at(-1).content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.locator('#chat-stream .story-message-image')).toHaveCount(1);
  await expect(page.locator('#story-image-panel')).toBeHidden();
  const saved=await page.evaluate(async()=>{
    const save=Storage.loadStory();
    const bundle=await BAOStoryBackup.buildBundle();
    const imported=await BAOStoryBackup.importBundle(JSON.parse(JSON.stringify(bundle)));
    return {image:save.chat.messages.find(m=>m.storyImage).storyImage,imported:imported.payload.chat.messages.find(m=>m.storyImage).storyImage,
      backupHasKey:JSON.stringify(bundle).includes('FAKE-TEST-KEY')};
  });
  expect(saved.imported).toEqual(saved.image);expect(saved.image.width).toBe(1280);expect(saved.backupHasKey).toBe(false);
  await page.reload();await ready(page);
  await page.evaluate(()=>{Storage.restoreStory(Storage.loadStory());App.config.api.key='FAKE-TEST-KEY';App.showView('chat');App.renderChatShell(false)});
  await expect(page.locator('#chat-stream .story-message-image')).toHaveCount(1);
  await page.evaluate(()=>{App.config.dialogueMode='avatar_chat';BAOAvatarChat.refresh()});
  await expect(page.locator('#chat-stream .story-message-image')).toHaveCount(1);
  const count=requests.length;
  await send(page,'繼續對話');
  expect(requests.slice(count).every(r=>r.messages.every(m=>typeof m.content==='string'))).toBe(true);
  expect(requests.slice(count).some(r=>r.messages.some(m=>m.content.includes('歷史圖片未重送')))).toBe(true);
});
test('unsupported model, broken input and provider failure retain draft without story mutation',async({page})=>{
  const requests=await setup(page);
  await select(page);await page.locator('#user-input').fill('不要遺失的文字');
  await page.evaluate(()=>{App.config.api.model='deepseek-chat'});
  await page.locator('[data-send-message]').click();
  await expect(page.locator('#story-image-status')).toContainText('不支援圖片');
  expect(requests).toHaveLength(0);expect(await page.evaluate(()=>Chat.messages.length)).toBe(1);
  await page.locator('#story-image-file').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});
  await expect(page.locator('#story-image-status')).toContainText('無法解碼');
  await expect(page.locator('#story-image-panel img')).toBeVisible();
  await page.evaluate(()=>{App.config.api.model='fixture-vision'});
  await page.route('https://vision.example.test/**',route=>route.fulfill({status:400,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({error:{message:'unsupported image input'}})}));
  await page.locator('[data-send-message]').click();
  await expect(page.locator('#bao-chat-send-feedback')).toContainText('圖片請求失敗');
  await expect(page.locator('#user-input')).toHaveValue('不要遺失的文字');
  await expect(page.locator('#story-image-panel img')).toBeVisible();
  expect(await page.evaluate(()=>Chat.messages.length)).toBe(1);
});
test('branch rollback and other stories keep attachment ownership',async({page})=>{
  await setup(page);await select(page);await send(page);
  const result=await page.evaluate(async()=>{
    const original=Storage.loadStory(),refs=BAOStoryLibrary.refs(),image=Chat.messages[1].storyImage.data;
    const branch=await BAOStoryLibrary.createBranch(Chat.messages.at(-1).id,'圖片分支');
    await BAOStoryBranches.restore(branch._library.storyId,branch._library.chapterId);
    const branchImage=Chat.messages[1].storyImage.data;
    Chat.add('user','分支後的文字');Chat.add('assistant','只存在分支');App.saveStory(false);await BAOStorageWriteGuard.whenIdle();
    await BAOStoryBranches.restore(original._library.storyId,original._library.chapterId);
    const returned={image:Chat.messages[1].storyImage.data,length:Chat.messages.length};
    Chat.reset();GameState.create(App.activeCharacter,App.config);App.renderChatShell(false);
    return {image,branchImage,returned,otherDraft:BAOStoryImages.hasDraft(),otherImages:document.querySelectorAll('.story-message-image').length};
  });
  expect(result.branchImage).toBe(result.image);expect(result.returned).toEqual({image:result.image,length:3});expect(result.otherDraft).toBe(false);expect(result.otherImages).toBe(0);
});
test('IDB and quota failure retain image turn and backup, retry recovers',async({page})=>{
  await setup(page);await select(page);await send(page);
  const result=await page.evaluate(async()=>{
    const before=JSON.stringify(await Storage._getAllRecords());
    const idb=Storage._persistOperationIndexedDB,fallback=Storage._persistFallbackSnapshot,library=BAOStoryLibrary.persist;
    Storage._persistOperationIndexedDB=async()=>{throw new Error('fixture denied')};
    Storage._persistFallbackSnapshot=()=>{throw new DOMException('full','QuotaExceededError')};
    BAOStoryLibrary.persist=async()=>{throw new Error('fixture library denied')};
    Chat.add('user','後續文字');Chat.add('assistant','後續回覆');
    App.saveStory(false);const failed=await BAOStorageWriteGuard.whenIdle();
    const backup=Storage.buildStoryPayload();
    // The failure closes Storage._db; its cache-oriented helper now returns [].
    // Open a fresh read-only connection to assert the actual durable records.
    const db=await Storage._openDatabase();
    const durable=JSON.stringify(await new Promise((resolve,reject)=>{
      const read=db.transaction(Storage.dbStore,'readonly').objectStore(Storage.dbStore).getAll();
      read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);
    }));db.close();
    Storage._persistOperationIndexedDB=idb;Storage._persistFallbackSnapshot=fallback;BAOStoryLibrary.persist=library;
    await BAOStorageWriteGuard.retry();const retry=await BAOStorageWriteGuard.whenIdle();
    return {failed,retry,priorIntact:before===durable,image:backup.chat.messages[1].storyImage.data,reloaded:Storage.loadStory().chat.messages[1].storyImage.data,length:Chat.messages.length};
  });
  expect(result.failed).toBe(false);expect(result.priorIntact).toBe(true);expect(result.retry).toBe(true);expect(result.image).toBe(result.reloaded);expect(result.length).toBe(5);
});

const formatFixtures={"image/jpeg": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDziiiiuw9wKKKKAP/Z", "image/webp": "UklGRj4AAABXRUJQVlA4IDIAAACwAgCdASogABAAPm0skkWkIqGYBABABsSgC06C0kAA/vS+7natj7Pv9Xfnb9T544jQAA=="};
test('JPEG and WebP decode locally; huge dimensions and file size preserve drafts',async({page})=>{
  const requests=await setup(page);
  for (const [mime,data] of Object.entries(formatFixtures)) {
    await page.locator('#story-image-file').setInputFiles({name:'image.'+mime.split('/')[1],mimeType:mime,buffer:Buffer.from(data,'base64')});
    await expect(page.locator('#story-image-status')).toContainText('圖片已準備好');
  }
  const prior=await page.locator('#story-image-panel img').getAttribute('src');
  await page.locator('#user-input').fill('仍保留');
  await page.locator('#story-image-file').setInputFiles({name:'huge.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(8*1024*1024+1)});
  await expect(page.locator('#story-image-status')).toContainText('8 MB');
  await expect(page.locator('#user-input')).toHaveValue('仍保留');
  expect(await page.locator('#story-image-panel img').getAttribute('src')).toBe(prior);
  expect(requests).toHaveLength(0);
});
test('long story image turn keeps the player reading anchor',async({page})=>{
  // The existing reader deliberately releases its placeholder after completion;
  // short replies clamp naturally to the bottom. Exercise a genuinely long reply.
  await setup(page,390,('A 只向看過照片的人描述門邊的陰影，等候玩家回應。\n').repeat(40));
  await page.evaluate(()=>{
    for(let i=0;i<60;i++){Chat.add('user','歷史問題 '+i);Chat.add('assistant',('長篇正文與已知情節。\n').repeat(30))}
    App.renderChatShell(false);
    window.__imageReadingEvidence=[];
    const record=stage=>{
      const stream=document.getElementById('chat-stream'),player=[...stream.querySelectorAll(':scope > .message.user')].at(-1);
      const img=player?.querySelector('img');
      window.__imageReadingEvidence.push({stage,scroll:stream.scrollTop,height:stream.clientHeight,full:stream.scrollHeight,
        playerTop:player?.getBoundingClientRect().top-stream.getBoundingClientRect().top,imageHeight:img?.getBoundingClientRect().height,complete:img?.complete});
    };
    API.wrapSend('image-test:reading-evidence',async(next,config,...args)=>{
      if(config.__memoryTask||config.__stateTask||config.__storyTool)return next(config,...args);
      record('dispatch');try{return await next(config,...args)}finally{record('response')}
    });
  });
  await select(page);await send(page);
  await expect(page.locator('#chat-stream .story-message-image')).toHaveCount(1);
  const geometry=await page.evaluate(()=>{
    const stream=document.getElementById('chat-stream'),reader=stream.getBoundingClientRect();
    const player=[...stream.querySelectorAll(':scope > .message.user')].at(-1).getBoundingClientRect();
    return {top:player.top-reader.top,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  console.log('IMAGE_READING_EVIDENCE',JSON.stringify({stages:await page.evaluate(()=>window.__imageReadingEvidence),final:geometry}));
  expect(geometry.overflow).toBe(false);expect(geometry.top).toBeGreaterThanOrEqual(-1);expect(geometry.top).toBeLessThan(60);
});

test('offline preview and unconfirmed route never pretend to see a photo',async({page})=>{
  const requests=await setup(page);await select(page);
  await page.locator('#user-input').fill('看得到嗎？');
  await page.evaluate(()=>{App.config.demoMode=true});
  await page.locator('[data-send-message]').click();
  await expect(page.locator('#story-image-status')).toContainText('離線預覽無法理解圖片');
  await page.evaluate(()=>{App.config.demoMode=false;delete App.config.api.visionConfirmedRoute});
  await page.locator('[data-send-message]').click();
  await expect(page.locator('#story-image-status')).toContainText('尚未確認');
  await expect(page.locator('#story-image-panel input[type="checkbox"]')).toBeVisible();
  expect(requests).toHaveLength(0);
  expect(await page.evaluate(()=>Chat.messages.length)).toBe(1);
  await expect(page.locator('#user-input')).toHaveValue('看得到嗎？');
  await page.locator('#story-image-panel input[type="checkbox"]').check();
  await send(page,'只有 A 看照片');
  expect(requests.some(r=>Array.isArray(r.messages.at(-1).content))).toBe(true);
});

test('image preview leaves the composer usable in a short phone viewport',async({page})=>{
  await setup(page,390);await page.setViewportSize({width:390,height:420});
  await select(page);
  const geometry=await page.evaluate(()=>{
    const input=document.getElementById('user-input').getBoundingClientRect();
    const send=document.querySelector('[data-send-message]').getBoundingClientRect();
    const point=document.elementFromPoint(input.x+input.width/2,input.y+input.height/2);
    return {inputBottom:input.bottom,inputTop:input.top,sendBottom:send.bottom,hit:point===document.getElementById('user-input'),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  expect(geometry.inputTop).toBeGreaterThanOrEqual(0);expect(geometry.inputBottom).toBeLessThanOrEqual(422);expect(geometry.sendBottom).toBeLessThanOrEqual(422);expect(geometry.hit).toBe(true);expect(geometry.overflow).toBe(false);
});
