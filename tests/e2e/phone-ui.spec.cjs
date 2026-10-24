const { test, expect } = require('@playwright/test');
async function story(page, enabled = true) {
  await page.goto('/');
  await page.waitForFunction(() => window.BAOPhoneUI && App.characters?.length);
  await page.evaluate(enabled => {
    App.activeCharacter = CharacterEngine.normalize({
      id:'phone-e2e',name:'Phone E2E',system_prompt:'test',greeting:'start',
      phone_ui:enabled ? {
        enabled:true,userName:'유나',contactName:'지연',twitterHandle:'@private',
        weather:{place:'서울',temp:'23°',desc:'맑음',high:'26°',low:'19°'},
        events:[{time:'10:00',title:'커피'}],
        chat:[{time:'12:30',text:'안녕 <script>alert(1)</script>'},{time:'12:31',text:'네',from:'me'}],
        tweets:['오늘은 맑음'],
        calls:[{group:'오늘',items:[{type:'未接',time:'12:20',count:'2'}]}],
        instagram:{callerName:'지연',messages:[{from:'them',text:'안녕',delay:0}]},
        spotify:{playlistName:'비 오는 날',tracks:[{title:'한 곡',artist:'가수',duration:12}]}
      } : null
    });
    App.config = {narrativeMode:'world',displayMode:'text',persona:{name:'Player'},api:{model:'mock',baseUrl:'https://example.invalid',key:'test'},memory:{maxRounds:20,maxContext:32000,mode:'rounds',cache:false}};
    GameState.create(App.activeCharacter,App.config);
    Chat.reset();
    App.renderChatShell(false);
    App.showView('chat');
  },enabled);
}
test('opt-in launcher isolates existing stories and renders configurable phone apps',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await story(page,false);
  await expect(page.locator('#bao-phone-launch')).toHaveCount(0);
  await story(page,true);
  await expect(page.locator('#bao-phone-launch')).toHaveCount(1);
  await page.locator('#bao-phone-launch').click();
  await expect(page.locator('.bp-lock-clock')).toBeVisible();
  await page.locator('.bp-home-handle').click();
  await expect(page.locator('.bp-widget')).toContainText(['서울','커피']);
  await page.locator('.bp-apps .bp-icon-kakao').click();
  await expect(page.locator('.bp-friend')).toHaveCount(2);
  await page.locator('.bp-friend').last().click();
  await expect(page.locator('.bp-thread')).toContainText('안녕 <script>alert(1)</script>');
  await expect(page.locator('.bp-thread script')).toHaveCount(0);
  await page.evaluate(()=>{window.__phoneSendText='';App.sendMessage=()=>{window.__phoneSendText=document.getElementById('user-input').value;};});
  await page.locator('.bp-composer input').fill('오늘 밤에 봐');
  await page.locator('.bp-composer button').click();
  await expect(page.locator('.bao-phone-overlay')).toHaveCount(0);
  const text=await page.evaluate(()=>window.__phoneSendText);
  expect(text).toContain('오늘 밤에 봐');
  expect(text).toContain('KakaoTalk');
});
test('X, video call and Spotify remain purely optional interactive surfaces',async({page})=>{
  await story(page,true);
  await page.locator('#bao-phone-launch').click();
  await page.locator('.bp-home-handle').click();
  await page.locator('.bp-apps .bp-icon-x').click();
  await expect(page.locator('.bp-tweet')).toContainText('오늘은 맑음');
  await page.locator('.bp-home-handle').click();
  await page.locator('.bp-apps .bp-icon-instagram').click();
  await expect(page.locator('.bp-call-ringing')).toHaveText('전화 오는 중…');
  await page.locator('[data-phone-action="accept"]').click();
  await expect(page.locator('[data-phone-duration]')).toBeVisible();
  await page.locator('[data-phone-action="hangup"]').click();
  await expect(page.locator('.bp-apps')).toBeVisible();
  await page.locator('.bp-apps .bp-icon-spotify').click();
  await expect(page.locator('.bp-track')).toHaveCount(1);
  await page.locator('.bp-track').click();
  await expect(page.locator('.bp-mini')).toBeVisible();
  await page.locator('.bp-mini-open').click();
  await expect(page.locator('.bp-seek')).toBeVisible();
  await page.locator('.bp-seek').evaluate(node=>{node.value='5';node.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(page.locator('.bp-current-time')).toHaveText('0:05');
  await page.keyboard.press('Escape');
  await expect(page.locator('.bao-phone-overlay')).toHaveCount(0);
});
test('local studio keeps phone presentation data on JSON round trip',async({page})=>{
  await page.goto('/character-studio.html');
  await page.waitForFunction(()=>window.BAOCharacterStudio && window.BAOPhoneUICore);
  await page.locator('[name=phone_ui_enabled]').check();
  await page.locator('[name=phone_ui_json]').fill(JSON.stringify({
    userName:'테스트',contactName:'친구',tweets:['기록'],spotify:{playlistName:'노래',tracks:[]}
  }));
  const c=await page.evaluate(()=>{
    const card=BAOCharacterStudio.toExport();
    return {from:card.presentation.phone_ui, normalized:CharacterEngine.normalize(card).phone_ui};
  });
  expect(c.from.userName).toBe('테스트');
  expect(c.normalized.tweets[0].text).toBe('기록');
});

test('studio simple phone fields and style advice survive draft reload and native export',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/character-studio.html');
  await page.waitForFunction(()=>window.BAOCharacterStudio && window.BAOPhoneUICore);
  await page.locator('[name=name]').fill('雨港手機');
  await page.locator('[name=id]').fill('phone-author-sync');
  await page.locator('[name=system_prompt]').fill('原作世界設定');
  await page.locator('[name=greeting]').fill('雨停了。');
  await page.locator('[name=phone_ui_enabled]').check();
  await page.locator('[name=phone_ui_json]').fill(JSON.stringify({userName:'原主人',chat:[{text:'先前紀錄'}],weather:{place:'基隆'}}));
  await expect(page.locator('[name=phone_userName]')).toHaveValue('原主人');
  await page.locator('[name=phone_userName]').fill('林曼');
  await page.locator('[name=phone_contactName]').fill('小夏');
  await page.locator('[name=recommended_styles]').fill('電影感, 自然口語, 電影感');
  await page.locator('#studio-save-draft').click();
  await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
  await page.reload();
  await page.locator('.studio-draft').filter({hasText:'雨港手機'}).click();
  await expect(page.locator('[name=phone_userName]')).toHaveValue('林曼');
  await expect(page.locator('[name=phone_contactName]')).toHaveValue('小夏');
  const card=await page.evaluate(()=>BAOCharacterStudio.toExport());
  expect(card.presentation.phone_ui.chat[0].text).toBe('先前紀錄');
  expect(card.presentation.phone_ui.weather.place).toBe('基隆');
  expect(card.presentation.narrative.recommended_styles).toEqual(['電影感','自然口語']);
  expect(card.content.system_prompt).toBe('原作世界設定');
  expect(JSON.stringify(card)).not.toContain('playerPortrayal');
  await page.locator('[name=phone_ui_enabled]').uncheck();
  expect((await page.evaluate(()=>BAOCharacterStudio.toExport())).presentation.phone_ui).toBeUndefined();
});
