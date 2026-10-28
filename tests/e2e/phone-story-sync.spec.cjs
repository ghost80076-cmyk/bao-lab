const {test,expect}=require('@playwright/test');
const OPEN='[[YORUBAY_PHONE_V1]]', CLOSE='[[/YORUBAY_PHONE_V1]]';
async function ready(page, phone=true){
  await page.goto('/');
  await page.waitForFunction(()=>window.BAOPhoneStoryBridge && window.BAOPhoneStoryCore && window.BAOPhoneUI && App.prompts?.world);
  await page.evaluate(phone=>{
    App.activeCharacter=CharacterEngine.normalize({
      id:'phone-sync-story', name:'手機故事',system_prompt:'故事',greeting:'開始。',
      supported_modes:{immersive:true,world:true},
      phone_ui:phone?{enabled:true,userName:'小夏',contactName:'林曼',chat:[{text:'開場原始訊息'}],tweets:['原始貼文']} : null
    });
    App.config={narrativeMode:'world',displayMode:'text',persona:{name:'玩家',gender:'未指定'},
      api:{model:'mock',baseUrl:'https://example.invalid',key:'test'},
      memory:{mode:'rounds',maxRounds:20,maxContext:32000,cache:true}};
    GameState.create(App.activeCharacter,App.config);
    Chat.reset();
    App.renderChatShell(false);App.showView('chat');
  },phone);
}
test('story-generated phone patches update the same save and do not leak JSON into prose',async({page})=>{
  await ready(page);
  const result=await page.evaluate(({OPEN,CLOSE})=>{
    const old=App.buildSystemPrompt();
    Chat.add('user','我想看看你的手機。');
    const raw='她的手機亮了一下。\n'+OPEN+JSON.stringify({
      chat:[{from:'them',time:'23:41',text:'晚安，明天見'}],
      tweets:[{text:'今天好累',date:'23:42'}],
      calls:[{group:'今天',items:[{name:'林曼',type:'未接',time:'23:43',count:'1'}]}]
    })+CLOSE;
    const message=Chat.add('assistant',raw);
    const rendered=App.renderStoryMessage(raw,'assistant',false);
    App.saveStory(false);
    return {old,stored:message.content,rendered,phone:GameState.current.phoneUI,saved:Storage.loadStory()?.state?.phoneUI};
  },{OPEN,CLOSE});
  expect(result.old).toContain('【作品手機動態');
  expect(result.stored).toBe('她的手機亮了一下。');
  expect(result.rendered).not.toContain(OPEN);
  expect(result.rendered).not.toContain('calls');
  expect(result.phone.chat[0].text).toBe('晚安，明天見');
  expect(result.saved.chat[0].text).toBe('晚安，明天見');
  await page.locator('#bao-phone-launch').click();
  await page.locator('.bp-home-handle').click();
  await page.locator('.bp-apps .bp-icon-kakao').click();
  await page.locator('.bp-friend').last().click();
  await expect(page.locator('.bp-thread')).toContainText('開場原始訊息');
  await expect(page.locator('.bp-thread')).toContainText('晚安，明天見');
  await page.locator('.bp-home-handle').click();
  await page.locator('.bp-apps .bp-icon-x').click();
  await expect(page.locator('.bp-tweet')).toHaveCount(2);
  await expect(page.locator('.bp-tweet').last()).toContainText('今天好累');
});
test('legacy cards and author greetings never interpret phone data',async({page})=>{
  await ready(page,false);
  const r=await page.evaluate(({OPEN,CLOSE})=>{
    const prompt=App.buildSystemPrompt();
    Chat.add('user','查看');
    const raw='正常劇情\n'+OPEN+'{"tweets":["不該解讀"]}'+CLOSE;
    const reply=Chat.add('assistant',raw);
    return {prompt,text:reply.content,hasUI:!!GameState.current.phoneUI};
  },{OPEN,CLOSE});
  expect(r.prompt).not.toContain('【作品手機動態');
  expect(r.text).toContain(OPEN);
  expect(r.hasUI).toBe(false);
  await expect(page.locator('#bao-phone-launch')).toHaveCount(0);
  await ready(page,true);
  const intro=await page.evaluate(({OPEN,CLOSE})=>{
    const message=Chat.add('assistant','開場'+OPEN+'{"tweets":["不要更新"]}'+CLOSE);
    return {text:message.content,phone:GameState.current.phoneUI};
  },{OPEN,CLOSE});
  expect(intro.text).toContain(OPEN);
  expect(intro.phone).toBeUndefined();
});

test('story updates persist group messages, notes and photos and retain IDs in the next prompt',async({page})=>{
  await ready(page);
  const result=await page.evaluate(({OPEN,CLOSE})=>{
    Chat.add('user','看看群裡的新動態');
    Chat.add('assistant','手機亮起。'+OPEN+JSON.stringify({
      contacts:[{id:'xia',name:'小夏'}],threads:[{id:'group',name:'朋友群',participants:['xia'],messages:[{senderId:'xia',text:'晚安'}]}],
      notes:[{id:'memo',title:'行程',text:'週六見面'}],photos:[{id:'rain',src:'assets/rain.jpg',title:'雨景'}],storyTime:'23:17'
    })+CLOSE);
    App.saveStory(false);
    const saved=Storage.loadStory();
    const display=BAOPhoneStoryCore.mergeDisplay(App.activeCharacter.phone_ui,saved.state.phoneUI);
    return {saved:saved.state.phoneUI,display,prompt:App.buildSystemPrompt(),prose:Chat.messages.at(-1).content};
  },{OPEN,CLOSE});
  expect(result.saved.threads[0].messages[0].senderId).toBe('xia');
  expect(result.display.notes[0].text).toBe('週六見面');
  expect(result.display.photos[0].id).toBe('rain');
  expect(result.display.storyTime).toBe('23:17');
  expect(result.prompt).toContain('"id":"group"');
  expect(result.prose).toBe('手機亮起。');
});

test('new phone activity jumps to the exact thread or note and preserves read state without sends',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await ready(page);
  await page.evaluate(({OPEN,CLOSE})=>{
    window.__notificationSends=0;App.sendMessage=()=>{window.__notificationSends++;};
    Chat.add('user','看看新訊息');
    Chat.add('assistant','手機亮了一下。'+OPEN+JSON.stringify({
      threads:[{id:'friends',name:'朋友群',participants:['xia'],messages:[{senderId:'xia',text:'今晚八點見'}]}],
      notes:[{id:'meeting',title:'見面地點',text:'在港口等你'}]
    })+CLOSE);
    App.saveStory(false);
  },{OPEN,CLOSE});
  await expect(page.locator('#bao-phone-launch')).toHaveAttribute('data-unread','2');
  await page.locator('#bao-phone-launch').click();
  await expect(page.locator('.bp-notification')).toHaveCount(2);
  await page.screenshot({path:'test-results/phone-activity-lock.png',animations:'disabled'});
  await page.locator('.bp-notification').filter({hasText:'聊天室有新訊息'}).click();
  await expect(page.locator('.bp-thread')).toContainText('今晚八點見');
  await expect(page.locator('.bp-app-header strong')).toHaveText('朋友群');
  await page.locator('.bp-home-handle').click();
  await page.locator('[data-phone-action="notifications"]').click();
  await page.locator('.bp-notification').filter({hasText:'筆記已更新'}).click();
  await expect(page.locator('.bp-document')).toHaveText('在港口等你');
  await page.screenshot({path:'test-results/phone-activity-note.png',animations:'disabled'});
  await page.keyboard.press('Escape');
  await expect(page.locator('#bao-phone-launch')).toHaveAttribute('data-unread','0');
  const saved=await page.evaluate(()=>Storage.loadStory());
  expect(saved.state.phoneUI.notifications.every(item=>item.read)).toBe(true);
  await page.evaluate(saved=>{Storage.restoreStory(saved);App.renderChatShell(false);App.showView('chat');},saved);
  await expect(page.locator('#bao-phone-launch')).toHaveAttribute('data-unread','0');
  expect(await page.evaluate(()=>window.__notificationSends)).toBe(0);
});

test('empty phone content returns to the story without replacing a draft',async({page})=>{
  await ready(page);
  await page.locator('#user-input').fill('尚未送出的故事行動');
  await page.locator('#bao-phone-launch').click();
  await page.locator('.bp-home-handle').click();
  await page.locator('.bp-apps .bp-icon-notes').click();
  await expect(page.locator('.bp-empty')).toContainText('尚無筆記');
  await page.locator('[data-phone-action="return-story"]').click();
  await expect(page.locator('#bao-phone-stage')).toHaveCount(0);
  await expect(page.locator('#user-input')).toBeFocused();
  await expect(page.locator('#user-input')).toHaveValue('尚未送出的故事行動');
});

test('failed save keeps an activity unread and does not navigate into its target',async({page})=>{
  await ready(page);
  await page.evaluate(({OPEN,CLOSE})=>{
    Chat.add('user','查看');Chat.add('assistant','手機亮了。'+OPEN+'{"notes":[{"id":"memo","text":"內容"}]}'+CLOSE);
  },{OPEN,CLOSE});
  await page.locator('#bao-phone-launch').click();
  await page.evaluate(()=>{App.saveStory=()=>false;});
  await page.locator('.bp-notification').click();
  await expect(page.locator('.bp-lock-clock')).toBeVisible();
  await expect(page.locator('.bp-document')).toHaveCount(0);
  expect(await page.evaluate(()=>GameState.current.phoneUI.notifications[0].read)).toBe(false);
});

test('notifications respect hidden content and leave locked items unread until unlocked',async({page})=>{
  await ready(page);
  await page.evaluate(({OPEN,CLOSE})=>{
    App.activeCharacter.phone_ui=BAOPhoneUICore.normalize({enabled:true,apps:['notes','kakao'],
      threads:[{id:'private',name:'不應顯示的聊天室',messages:[{text:'不應顯示的訊息'}]}],
      notes:[{id:'safe',title:'保密筆記',text:'不應提前看見'}],
      interactions:{version:1,locks:[{target:{app:'kakao',id:'private'},hidden:true},{target:{app:'notes',id:'safe'},code:'0427'}]}});
    Chat.add('user','查看');Chat.add('assistant','收到動態。'+OPEN+JSON.stringify({
      threads:[{id:'private',messages:[{text:'隱藏的新訊息'}]}],notes:[{id:'safe',text:'解鎖後的內容'}]
    })+CLOSE);
    App.saveStory(false);
  },{OPEN,CLOSE});
  await expect(page.locator('#bao-phone-launch')).toHaveAttribute('data-unread','1');
  await page.locator('#bao-phone-launch').click();
  await expect(page.locator('.bp-notification')).toHaveCount(1);
  await expect(page.locator('.bp-notifications')).not.toContainText('不應');
  await page.locator('.bp-notification').click();
  await expect(page.locator('.bp-unlock-form')).toBeVisible();
  await expect(page.locator('#bao-phone-stage')).not.toContainText('解鎖後的內容');
  expect(await page.evaluate(()=>GameState.current.phoneUI.notifications.find(n=>n.app==='notes').read)).toBe(false);
  await page.getByLabel('故事密碼',{exact:true}).fill('0427');
  await page.getByRole('button',{name:'解鎖',exact:true}).click();
  await expect(page.locator('.bp-document')).toContainText('解鎖後的內容');
  expect(await page.evaluate(()=>GameState.current.phoneUI.notifications.find(n=>n.app==='notes').read)).toBe(true);
});


test('an older cached phone core still opens existing content without a notification helper',async({page})=>{
  await ready(page);
  await page.evaluate(()=>{window.BAOPhoneStoryCore={...BAOPhoneStoryCore,notifications:undefined};});
  await page.locator('#bao-phone-launch').click();
  await page.locator('.bp-home-handle').click();
  await page.locator('.bp-apps .bp-icon-kakao').click();
  await page.locator('.bp-friend').last().click();
  await expect(page.locator('.bp-thread')).toContainText('開場原始訊息');
});
