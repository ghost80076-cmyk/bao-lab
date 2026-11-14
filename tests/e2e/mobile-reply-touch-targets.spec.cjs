const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function prepare(page, baseline) {
  if (baseline) await page.route('**/css/mobile-reading-layout.css*', route => route.fulfill({contentType:'text/css',body:fs.readFileSync(process.env.REPLY_TOUCH_BASELINE_CSS,'utf8')}));
  await page.goto('/');
  await page.waitForFunction(() => window.App?.characters?.length && window.BAOMobileReadingLayout && window.YoruExperience && window.BAOStorySurface);
  await page.evaluate(() => {
    App.activeCharacter=CharacterEngine.normalize({id:'reply-touch-fixture',name:'雨港',system_prompt:'獨立回應玩家。',greeting:'雨停了。'});
    App.config={persona:{name:'旅人'},narrativeMode:'immersive',displayMode:'text',api:{type:'custom',model:'test-only',key:'TEST_ONLY',baseUrl:'https://example.invalid'},memory:{mode:'rounds',maxRounds:20}};
    GameState.create(App.activeCharacter,App.config);Chat.reset();Chat.add('user','我看看窗外。');Chat.add('assistant','港口的燈還亮著。');
    App.renderChatShell(false);App.showView('chat');YoruExperience.choose({level:'standard'});BAOStorySurface.sync();
    // Exercise the existing regeneration handler, without any external model call.
    API.send=async()=>({text:'重新生成的港口回覆。'});
    window.touchCopy='';navigator.clipboard.writeText=async text=>{window.touchCopy=text;};
  });
}
async function record(page, info, label) {
  const tools=page.locator('#chat-stream .message.assistant .story-message-tools').last();
  const data=await tools.evaluate(root=>({
    viewport:{width:innerWidth,height:innerHeight},pageWidth:document.documentElement.scrollWidth,
    controls:[...root.querySelectorAll('button,summary')].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>{
      const r=n.getBoundingClientRect(),s=getComputedStyle(n);
      const pseudo=p=>{const t=getComputedStyle(n,p);return {content:t.content,position:t.position,inset:t.inset,width:t.width,height:t.height,pointerEvents:t.pointerEvents};};
      const hit=(x,y)=>{const e=document.elementFromPoint(x,y);return !!e&&(e===n||n.contains(e));};
      return {label:n.textContent.trim(),width:r.width,height:r.height,minWidth:s.minWidth,minHeight:s.minHeight,
        before:pseudo('::before'),after:pseudo('::after'),
        outsideHits:[hit(r.left+r.width/2,r.top-1),hit(r.left+r.width/2,r.bottom+1)],
        centerHit:hit(r.left+r.width/2,r.top+r.height/2)};
    })
  }));
  fs.mkdirSync(info.outputPath('evidence'),{recursive:true});
  fs.writeFileSync(info.outputPath('evidence',label+'.json'),JSON.stringify(data,null,2));
  await page.screenshot({path:info.outputPath('evidence',label+'.png')});
  expect(data.pageWidth).toBeLessThanOrEqual(data.viewport.width+1);
  return data;
}
for(const viewport of [{width:320,height:568},{width:390,height:844},{width:390,height:480},{width:1280,height:900}]) {
  test(`reply controls geometry and interactions ${viewport.width}x${viewport.height}`,async({page},info)=>{
    test.setTimeout(90000);await page.setViewportSize(viewport);
    let before;
    if(process.env.REPLY_TOUCH_BASELINE_CSS){
      await prepare(page,true);before=await record(page,info,'before');
      await page.unroute('**/css/mobile-reading-layout.css*');
    }
    await prepare(page,false);
    const toolbar=page.locator('#chat-stream .message.assistant .story-message-tools').last();
    const more=toolbar.locator('details.bao-message-more');
    await expect(more).toBeVisible();
    const after=await record(page,info,'after');
    if(viewport.width<=820){
      for(const c of after.controls){expect(c.width,c.label).toBeGreaterThanOrEqual(44);expect(c.height,c.label).toBeGreaterThanOrEqual(44);expect(c.centerHit,c.label).toBe(true);}
      if(before) expect(before.controls.some(c=>c.height<44)).toBe(true);
    }else if(before){expect(after.controls.map(c=>[c.label,c.width,c.height])).toEqual(before.controls.map(c=>[c.label,c.width,c.height]));}
    const summary=more.locator('summary');await summary.focus();await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');await expect(more).toHaveAttribute('open','');
    const expanded=await record(page,info,'expanded');
    if(viewport.width<=820)for(const c of expanded.controls){expect(c.width,c.label).toBeGreaterThanOrEqual(44);expect(c.height,c.label).toBeGreaterThanOrEqual(44);}
    await summary.press('Enter');await expect(more).not.toHaveAttribute('open','');
    await toolbar.locator('[data-edit]').click();
    await expect(page.getByRole('textbox',{name:'編輯 AI 回覆'})).toBeVisible();
    await page.locator('.story-inline-actions [data-cancel]').click();
    await toolbar.locator('[data-copy]').click();await expect.poll(()=>page.evaluate(()=>window.touchCopy)).toContain('港口的燈');
    await toolbar.locator('[data-regenerate]').click();
    await expect(page.locator('#chat-stream .message.assistant .bubble').last()).toContainText('重新生成的港口回覆');
    await expect(page.locator('#user-input')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
}
