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
  await expect(page.locator('.bp-call-ringing')).toHaveText('來電中…');
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
  await page.getByRole('button',{name:'全部欄位'}).click();
  await page.locator('[name=phone_ui_enabled]').check();
  await page.locator('.studio-phone-raw > summary').click();
  await page.locator('[name=phone_ui_json]').fill(JSON.stringify({
    userName:'테스트',contactName:'친구',tweets:['기록'],spotify:{playlistName:'노래',tracks:[]},threads:[{id:'friends',name:'朋友群',messages:[{senderId:'xia',text:'群聊'}]}],notes:[{id:'memo',title:'筆記',text:'原文'}]
  }));
  const c=await page.evaluate(()=>{
    const card=BAOCharacterStudio.toExport();
    return {from:card.presentation.phone_ui, normalized:CharacterEngine.normalize(card).phone_ui};
  });
  expect(c.from.userName).toBe('테스트');
  expect(c.normalized.tweets[0].text).toBe('기록');
  expect(c.normalized.threads[0].messages[0].senderId).toBe('xia');
  expect(c.normalized.notes[0].text).toBe('原文');
});

test('studio simple phone fields and style advice survive draft reload and native export',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/character-studio.html');
  await page.waitForFunction(()=>window.BAOCharacterStudio && window.BAOPhoneUICore);
  await page.getByRole('button',{name:'全部欄位'}).click();
  await page.locator('[name=name]').fill('雨港手機');
  await page.locator('[name=id]').fill('phone-author-sync');
  await page.locator('[name=system_prompt]').fill('原作世界設定');
  await page.locator('[name=greeting]').fill('雨停了。');
  await page.locator('[name=phone_ui_enabled]').check();
  await page.locator('.studio-phone-raw > summary').click();
  await page.locator('[name=phone_ui_json]').fill(JSON.stringify({userName:'原主人',chat:[{text:'先前紀錄'}],weather:{place:'基隆'}}));
  await expect(page.locator('[name=phone_userName]')).toHaveValue('原主人');
  await page.locator('[name=phone_userName]').fill('林曼');
  await page.locator('[name=phone_contactName]').fill('小夏');
  await page.locator('[name=phone_storyTime]').fill('23:17');
  await page.locator('[name=phone_storyDate]').fill('雨港・週一');
  await page.locator('[name=phone_locale]').selectOption('ja-JP');
  expect(JSON.parse(await page.locator('[name=phone_ui_json]').inputValue()).userName).toBe('林曼');
  expect(JSON.parse(await page.locator('[name=phone_ui_json]').inputValue()).contactName).toBe('小夏');
  await page.locator('[name=recommended_styles]').fill('電影感, 自然口語, 電影感');
  await page.locator('#studio-save-draft').click();
  await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
  await page.reload();
  await page.waitForFunction(()=>window.BAOCharacterStudioFlow && window.BAOCharacterStudio);
  await page.getByRole('button',{name:'全部欄位'}).click();
  await page.locator('.studio-draft').filter({hasText:'雨港手機'}).click();
  await expect(page.locator('[name=phone_userName]')).toHaveValue('林曼');
  await expect(page.locator('[name=phone_contactName]')).toHaveValue('小夏');
  const card=await page.evaluate(()=>BAOCharacterStudio.toExport());
  expect(card.presentation.phone_ui.chat[0].text).toBe('先前紀錄');
  expect(card.presentation.phone_ui.weather.place).toBe('基隆');
  expect(card.presentation.phone_ui.storyTime).toBe('23:17');
  expect(card.presentation.phone_ui.storyDate).toBe('雨港・週一');
  expect(card.presentation.phone_ui.locale).toBe('ja-JP');
  expect(card.presentation.narrative.recommended_styles).toEqual(['電影感','自然口語']);
  expect(card.content.system_prompt).toBe('原作世界設定');
  expect(JSON.stringify(card)).not.toContain('playerPortrayal');
  await page.locator('[name=phone_ui_enabled]').uncheck();
  expect((await page.evaluate(()=>BAOCharacterStudio.toExport())).presentation.phone_ui).toBeUndefined();
});


test('studio phone builder works without JSON and expanded references stay inside the page',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/character-studio.html');
  await page.waitForFunction(()=>window.BAOCharacterStudio && window.BAOCharacterStudioFlow && window.BAOCharacterStudioPhoneBuilder);
  await page.locator('#studio-flow-shell [data-flow-step="appearance"]').click();
  await page.locator('[name=phone_ui_enabled]').check();
  await expect(page.locator('[data-phone-builder]')).toBeVisible();

  await page.locator('[name=phone_userName]').fill('林曼');
  await page.locator('[data-phone-contact-name]').fill('小夏');
  await page.locator('[data-phone-add-contact]').click();
  await expect(page.locator('[data-phone-contact-list]')).toContainText('小夏');

  await page.locator('.studio-phone-participant').filter({hasText:'小夏'}).locator('input').check();
  await page.locator('[data-phone-thread-message]').fill('晚點見。');
  await page.locator('[data-phone-thread-sender]').selectOption({label:'小夏'});
  await page.locator('[data-phone-add-thread]').click();
  await expect(page.locator('[data-phone-thread-list]')).toContainText('小夏');

  await page.locator('[data-phone-note-title]').fill('線索');
  await page.locator('[data-phone-note-text]').fill('碼頭的置物櫃編號是 0427。');
  await page.locator('[data-phone-add-note]').click();
  await page.locator('[data-phone-photo-src]').fill('https://example.com/rain-port.jpg');
  await page.locator('[data-phone-photo-title]').fill('雨夜碼頭');
  await page.locator('[data-phone-add-photo]').click();

  await page.locator('.studio-phone-mechanisms > summary').click();
  await page.locator('[data-phone-lock-target]').selectOption({label:'聊天室 · 小夏'});
  await page.locator('[data-phone-lock-code]').fill('0427');
  await page.locator('[data-phone-lock-hint]').fill('四位數故事密碼');
  await page.locator('[data-phone-add-lock]').click();
  await page.locator('[data-phone-event-source]').selectOption({label:'備忘錄 · 線索'});
  await page.locator('[data-phone-event-unlock]').selectOption({label:'聊天室 · 小夏'});
  await page.locator('[data-phone-event-notification]').fill('聊天室已解鎖');
  await page.locator('[data-phone-add-event]').click();

  const phone=await page.evaluate(()=>BAOCharacterStudio.toExport().presentation.phone_ui);
  expect(phone.userName).toBe('林曼');
  expect(phone.contacts[0].name).toBe('小夏');
  expect(phone.threads[0].messages[0].text).toBe('晚點見。');
  expect(phone.notes[0].title).toBe('線索');
  expect(phone.photos[0].title).toBe('雨夜碼頭');
  expect(phone.interactions.locks[0].code).toBe('0427');
  expect(phone.interactions.events[0].notification).toBe('聊天室已解鎖');

  await page.locator('.studio-phone-raw > summary').click();
  const referenceSummaries=page.locator('.studio-phone-raw details > summary');
  for(let i=0;i<await referenceSummaries.count();i++) await referenceSummaries.nth(i).click();
  const overflow=await page.evaluate(()=>({
    doc:document.documentElement.scrollWidth-innerWidth,
    editor:document.querySelector('.studio-editor').scrollWidth-document.querySelector('.studio-editor').clientWidth
  }));
  expect(overflow.doc).toBeLessThanOrEqual(1);
  expect(overflow.editor).toBeLessThanOrEqual(1);
});


test('studio author can create a multi-contact group chat without editing JSON',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/character-studio.html');
  await page.waitForFunction(()=>window.BAOCharacterStudio && window.BAOCharacterStudioFlow && window.BAOCharacterStudioPhoneBuilder);
  await page.locator('#studio-flow-shell [data-flow-step="appearance"]').click();
  await page.locator('[name=phone_ui_enabled]').check();
  await page.locator('[name=phone_userName]').fill('玩家');

  for(const name of ['小夏','林曼','曼曼']){
    await page.locator('[data-phone-contact-name]').fill(name);
    await page.locator('[data-phone-add-contact]').click();
  }
  await expect(page.locator('[data-phone-contact-list] li')).toHaveCount(3);

  for(const name of ['小夏','林曼','曼曼']){
    await page.locator('.studio-phone-participant').filter({hasText:name}).locator('input').check();
  }
  await expect(page.locator('[data-phone-thread-sender] option')).toHaveText(['手機主人 · 玩家','小夏','林曼','曼曼']);
  await page.locator('[data-phone-thread-name]').fill('今晚去哪？');
  await page.locator('[data-phone-thread-message]').fill('我到了，你們呢？');
  await page.locator('[data-phone-thread-sender]').selectOption({label:'林曼'});
  await page.locator('[data-phone-add-thread]').click();

  await expect(page.locator('[data-phone-thread-list]')).toContainText('今晚去哪？');
  await expect(page.locator('[data-phone-thread-list]')).toContainText('群組');
  await expect(page.locator('[data-phone-thread-list]')).toContainText('小夏、林曼、曼曼');

  const phone=await page.evaluate(()=>BAOCharacterStudio.toExport().presentation.phone_ui);
  expect(phone.contacts.map(contact=>contact.name)).toEqual(['小夏','林曼','曼曼']);
  expect(phone.threads).toHaveLength(1);
  expect(phone.threads[0].name).toBe('今晚去哪？');
  expect(phone.threads[0].participants).toHaveLength(3);
  const memberNames=phone.threads[0].participants.map(id=>phone.contacts.find(contact=>contact.id===id)?.name);
  expect(memberNames).toEqual(['小夏','林曼','曼曼']);
  const linMan=phone.contacts.find(contact=>contact.name==='林曼');
  expect(phone.threads[0].messages[0]).toMatchObject({
    from:'them',senderId:linMan.id,senderName:'林曼',text:'我到了，你們呢？'
  });

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

for (const width of [320,1280]) test(`multiple chat recipients, documents and story clock work at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await story(page,true);
  await page.evaluate(()=>{
    App.activeCharacter.phone_ui=BAOPhoneUICore.normalize({
      userName:'玩家',storyTime:'23:17',storyDate:'大燁三年・冬月',apps:['kakao','photos','notes'],
      contacts:[{id:'xia',name:'小夏'},{id:'man',name:'林曼'}],
      threads:[{id:'private',name:'小夏',participants:['xia'],messages:[{senderId:'xia',text:'私訊內容'}]},
        {id:'group',name:'雨港朋友群',participants:['xia','man'],messages:[{senderId:'man',text:'只有群裡看得到'}]}],
      photos:[{id:'rain',src:'assets/bao-mark.svg',title:'雨港照片',caption:'收到的雨景'}],
      notes:[{id:'memo',title:'待辦',text:'<script>window.__injected=1</script>\n下班買牛奶'}]
    });
    // Invalid media is removed by the adapter; use a valid inline bitmap for the actual picture.
    App.activeCharacter.phone_ui.photos=[{id:'rain',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6e7sAAAAASUVORK5CYII=',title:'雨港照片',caption:'收到的雨景'}];
    window.__phoneSendText='';App.sendMessage=()=>{window.__phoneSendText=document.getElementById('user-input').value;};
  });
  await page.locator('#bao-phone-launch').click();
  await expect(page.locator('.bp-lock-clock')).toHaveText('23:17');
  await expect(page.locator('.bp-lock-date')).toHaveText('大燁三年・冬月');
  await page.locator('.bp-home-handle').click();
  await expect(page.locator('.bp-apps .bp-icon')).toHaveCount(3);
  await expect(page.locator('.bp-dock .bp-icon')).toHaveCount(3);
  await page.locator('.bp-apps .bp-icon-photos').click();
  await page.locator('.bp-photo-item').click();
  await expect(page.locator('.bp-photo-full')).toBeVisible();
  await expect(page.locator('.bp-document')).toHaveText('收到的雨景');
  await page.locator('.bp-back').click();
  await expect(page.locator('.bp-photo-item')).toHaveCount(1);
  await page.locator('.bp-home-handle').click();
  await page.locator('.bp-apps .bp-icon-notes').click();
  await page.locator('.bp-note-item').click();
  await expect(page.locator('.bp-document')).toContainText('下班買牛奶');
  expect(await page.evaluate(()=>window.__injected)).toBeUndefined();
  await page.locator('.bp-home-handle').click();
  await page.locator('.bp-apps .bp-icon-kakao').click();
  await page.locator('[data-phone-action="thread:0"]').click();
  await expect(page.locator('.bp-thread')).toContainText('私訊內容');
  await expect(page.locator('.bp-thread')).not.toContainText('只有群裡看得到');
  await page.locator('.bp-back').click();
  await page.locator('[data-phone-action="thread:1"]').click();
  await expect(page.locator('.bp-thread')).toContainText('林曼');
  await expect(page.locator('.bp-thread')).toContainText('只有群裡看得到');
  await page.locator('.bp-composer input').fill('大家晚安');
  const box=await page.locator('.bp-composer input').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
  await page.locator('.bp-composer button').click();
  expect(await page.evaluate(()=>window.__phoneSendText)).toContain('雨港朋友群 發送訊息｜聊天室 ID：group');
});
