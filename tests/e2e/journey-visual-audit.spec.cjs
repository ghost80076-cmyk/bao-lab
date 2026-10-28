const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const dir = 'test-results/journey-audit';
async function capture(page, label) {
  fs.mkdirSync(dir, { recursive:true });
  await page.screenshot({path:`${dir}/${label}.png`,animations:'disabled'});
  const geometry = await page.evaluate(() => ({
    viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,
    active:document.activeElement?.getAttribute('id'),
    headings:[...document.querySelectorAll('h1,h2,h3')].filter(n=>n.getClientRects().length).map(n=>n.textContent.trim()),
    controls:[...document.querySelectorAll('button,a,input,textarea,select,summary')].filter(n=>n.getClientRects().length).map(n=>{
      const r=n.getBoundingClientRect();return {label:(n.getAttribute('aria-label')||n.textContent||n.getAttribute('placeholder')||'').trim().slice(0,80),id:n.id,x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};
    }).filter(n=>n.y>=0&&n.y<innerHeight)
  }));
  fs.writeFileSync(`${dir}/${label}.json`,JSON.stringify(geometry,null,2));
}
async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(()=>window.App?.characters?.length && window.BAOStorySurface && window.BAOChatToolNavigation && window.BAOStoryTools && window.BAOPhoneUI && window.BAOGameplayUI);
}
async function fixture(page,preset='reader') {
  await page.evaluate(preset=>{
    const schema = preset==='reader'?undefined:{version:1,layout:{preset,left_panel:'status',right_panel:'world',primary_panel:'status'},panels:[
      {id:'status',label:'目前狀態',sections:[{type:'stats',title:'旅人狀態',items:[{label:'時間',path:'time'},{label:'地點',path:'location'}]},{type:'actions',items:[{label:'查看邀請',draft:'我查看這份邀請。'}]}]},
      {id:'world',label:'世界紀錄',sections:[{type:'stats',items:[{label:'地點',path:'location'}]}]}
    ]};
    App.activeCharacter=CharacterEngine.normalize({id:'journey-audit',name:'灰岸市｜夜行紀錄',system_prompt:'人物依自己的動機行動，不替玩家決定。',greeting:'凌晨 03:17，雨停在窗外。桌上的信封寫著你的名字，門外有人敲了兩下。\n\n「你可以先看信，也可以先問我是誰。」',initial_state:{time:'03:17',location:'灰岸市',modules:{},events:[],npcs:[]},gameplay_ui:schema,
      phone_ui:{enabled:true,userName:'旅人',contactName:'林晚',apps:['kakao','notes','photos'],threads:[{id:'lin',name:'林晚',messages:[{id:'m1',text:'到了嗎？我在雨棚下。',senderId:'lin',senderName:'林晚'}]}],notes:[],photos:[]}});
    App.config={persona:{name:'旅人',identity:'剛到港口的訪客'},narrativeMode:'immersive',displayMode:'ui',api:{type:'custom',model:'audit-mock',baseUrl:'https://example.invalid',key:'LOCAL_TEST_ONLY'},memory:{mode:'smart',maxRounds:20,maxContext:32000,cache:false}};
    GameState.create(App.activeCharacter,App.config);Chat.reset();Chat.add('assistant',App.activeCharacter.greeting);App.renderChatShell(false);App.showView('chat');BAOGameplayUI.syncGameplayLayout();BAOPhoneUI.refresh();BAOStorySurface.sync();BAOChatToolNavigation.sync();
  },preset);
  await expect(page.locator('#user-input')).toBeVisible();
}
for(const width of [390,1440]) {
 test(`player journey visual inventory ${width}`,async({page})=>{
  test.setTimeout(180000);
  await page.setViewportSize({width,height:900});await ready(page);
  await capture(page,`${width}-01-home`);
  await page.evaluate(()=>BAOStoryTools.openLibrary());
  await expect(page.locator('.story-library-empty').first()).toBeVisible();
  await capture(page,`${width}-02-empty-library`);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>App.showView('explore'));
  await expect(page.locator('#character-list .character-card').first()).toBeVisible();
  await capture(page,`${width}-03-explore`);
  await page.locator('#explore-search-input').fill('NO_RESULT_JOURNEY_0317');
  await capture(page,`${width}-04-search-empty`);
  await page.locator('#explore-search-input').fill('');
  await page.evaluate(async()=>{const c=App.characters.find(c=>c.id==='linchenfeng')||App.characters[0];await App.openCharacter(c.id);});
  await capture(page,`${width}-05-work-detail`);
  await page.evaluate(()=>App.openBuilder());
  await expect(page.locator('#builder-view')).toBeVisible();
  await capture(page,`${width}-06-quick-setup`);
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  await capture(page,`${width}-07-advanced-setup`);
  await fixture(page);
  const before=await page.evaluate(()=>JSON.stringify({state:GameState.current,messages:Chat.messages,config:App.config}));
  await capture(page,`${width}-08-story`);
  await page.locator('#bao-play-status-toggle').click();
  await capture(page,`${width}-09-reader-stage`);
  await page.evaluate(()=>BAOStorySurface.closeStatus());
  await page.evaluate(()=>BAOStoryControlCenter.open());
  await expect(page.locator('#bao-chat-tool-drawer')).toBeVisible();
  await capture(page,`${width}-10-control-settings`);
  await page.locator('#bao-chat-tool-drawer').getByRole('button',{name:'全部工具',exact:true}).click();
  await capture(page,`${width}-11-control-tools`);
  const search=page.getByRole('searchbox',{name:'搜尋故事工具'});
  await search.fill('NO_RESULT_JOURNEY');await capture(page,`${width}-12-tools-empty`);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>BAOMemoryWorkbench.open());
  await capture(page,`${width}-13-memory`);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>JSON.stringify({state:GameState.current,messages:Chat.messages,config:App.config}))).toBe(before);
  await page.evaluate(()=>BAOPhoneUI.open());
  await expect(page.locator('.bao-phone-overlay')).toBeVisible();
  await capture(page,`${width}-14-phone-lock`);
  await page.locator('.bp-home-handle').click();await capture(page,`${width}-15-phone-home`);
  await page.locator('.bp-apps .bp-icon-kakao').click();await capture(page,`${width}-16-phone-contacts`);
  await page.locator('.bp-friend').last().click();await capture(page,`${width}-17-phone-thread`);
  await page.locator('.bp-home-handle').click();
  await page.locator('.bp-apps .bp-icon-notes').click();await capture(page,`${width}-18-phone-empty-notes`);
  await page.evaluate(()=>BAOPhoneUI.close());
  // No send: test keyboard-like space using a short viewport, not a real device keyboard.
  await page.setViewportSize({width,height:480});
  await page.locator('#user-input').fill('我想先問問門外的人。');
  await capture(page,`${width}-19-short-composer`);
  await expect(page.locator('#user-input')).toHaveValue('我想先問問門外的人。');
  await page.setViewportSize({width,height:900});
  for(const preset of ['terminal','scene-rpg','rpg-dashboard']){
    await fixture(page,preset);
    if(width<=820)await page.locator('#bao-play-status-toggle').click();
    await capture(page,`${width}-20-stage-${preset}`);
    await page.evaluate(()=>BAOStorySurface.closeStatus());
  }
 });
 test(`author focused journey visual inventory ${width}`,async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width,height:900});
  await page.goto('/character-studio.html');
  await page.waitForFunction(()=>window.BAOCharacterStudioFlow && window.BAOCharacterStudioLifecycle);
  await capture(page,`${width}-30-studio-entry`);
  for(const step of ['core','opening','world','appearance','finish']){
    await page.locator(`[data-flow-step="${step}"]`).click();
    await capture(page,`${width}-31-studio-${step}`);
  }
  await page.locator('[data-flow-step="appearance"]').click();
  await page.locator('[name="phone_ui_enabled"]').check();
  await capture(page,`${width}-32-studio-phone`);
  await page.setViewportSize({width,height:480});
  await page.locator('[data-flow-step="core"]').click();
  await page.locator('[name="system_prompt"]').fill('雨港中的每個人物，都有自己的生活。');
  await capture(page,`${width}-33-studio-short-edit`);
 });
}
for(const path of ['about-bao-lab.html','quick-start.html','api-guide.html','lm-studio-guide.html','mcp-guide.html','account.html','author.html','lights.html','regex-manager.html','scene-module-gallery.html','policies.html','privacy.html','terms.html','creator-policy.html','age-content-policy.html','lights-refund-policy.html']) {
 test(`standalone visual inventory ${path}`,async({page})=>{
  test.setTimeout(60000);
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});await page.goto('/'+path);
    await capture(page,`${width}-40-${path.replace('.html','')}`);
  }
 });
}
