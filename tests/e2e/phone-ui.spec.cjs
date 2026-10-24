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
  await page.locator('.bp-seek').fill('5');
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
