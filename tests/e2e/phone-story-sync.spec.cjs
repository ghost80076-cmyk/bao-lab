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
