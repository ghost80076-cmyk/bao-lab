const { test, expect } = require('@playwright/test');
async function setup(page, order='phone-first') {
  await page.goto('/');
  await page.waitForFunction(() => window.BAOStoryRevisionState && window.BAOSameModelStateMerge && window.BAOPhoneStoryBridge && window.BAOMobileReadingLayout && App.characters.length);
  await page.evaluate(order => {
    App.activeCharacter = CharacterEngine.normalize({ id:'site-state-audit',name:'整合測試',system_prompt:'依據已發生事件延續。',greeting:'開始。',
      world_modules:[{id:'economy',label:'資產',kind:'object',tracking:'high',context:'core',fields:[{key:'gold',type:'number'}]}],
      initial_state:{time:'15:00',location:'商店',modules:{economy:{gold:100}}},phone_ui:{enabled:true,userName:'旅人',contactName:'小夏',chat:[]} });
    App.config={narrativeMode:'world',displayMode:'text',persona:{name:'旅人'},cost:{stateApiMode:'same'},memory:{mode:'rounds',maxRounds:10,cache:false},
      api:{type:'lmstudio',route:'local',protocol:'openai',model:'mock',key:'BAO_LOCAL_NO_AUTH',baseUrl:'http://localhost:1234/v1',maxOutputTokens:4096}};
    Chat.reset(); GameState.create(App.activeCharacter,App.config); App.renderChatShell(true); App.showView('chat');
    window.__siteCalls=[];
    const original=fetch.bind(window);
    window.fetch=(input,init={})=>{
      if(!String(input?.url||input).startsWith('http://localhost:1234/v1')) return original(input,init);
      const body=JSON.parse(init.body);__siteCalls.push(body);const i=__siteCalls.length;
      const prose=i===1?'原文：已到車旁，金幣剩八十。':i===2?'新版：已到旅館，金幣剩六十。':'改寫：你已抵達旅館，身上還剩六十金幣。';
      const phone='[[YORUBAY_PHONE_V1]]'+JSON.stringify({storyTime:i===1?'16:00':'17:00',chat:[{from:'them',text:i===1?'原文訊息':i===2?'新版訊息':'改寫訊息'}]})+'[[/YORUBAY_PHONE_V1]]';
      const patch={time:i===1?'16:00':'17:00',location:i===1?'車旁':'旅館',modules:{economy:{gold:i===1?80:60}}};
      const state=JSON.stringify(body).includes('BAO_STATE_V1')?'<BAO_STATE>'+JSON.stringify(patch)+'</BAO_STATE>':'';
      const content=prose+'\n'+(order==='phone-first'?phone+'\n'+state:state+'\n'+phone);
      return Promise.resolve(new Response(JSON.stringify({choices:[{message:{content},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}}));
    };
  },order);
}
for (const width of [390, 1440]) test.describe(`shared-state flows at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
for(const order of ['phone-first','state-first']) test(`phone and state appendices reconcile together: ${order}`,async({page})=>{
  await setup(page,order);await page.locator('#user-input').fill('出發');await page.evaluate(()=>App.sendMessage());
  expect(await page.evaluate(()=>({phase:GameState.current.stateTracker.phase,gold:GameState.current.modules.economy.gold,
    location:GameState.current.location,phone:GameState.current.phoneUI?.chat.map(x=>x.text),pending:GameState.current.pendingStateTurns.length,
    text:Chat.messages.at(-1).content,calls:__siteCalls.length}))).toMatchObject({phase:'updated',gold:80,location:'車旁',phone:['原文訊息'],pending:0,text:'原文：已到車旁，金幣剩八十。',calls:1});
});
test('regenerate, rewrite, cached variants and reload share the matching world and phone state',async({page})=>{
  await setup(page);await page.locator('#user-input').fill('出發');await page.evaluate(()=>App.sendMessage());
  await page.evaluate(()=>document.querySelector('[data-regenerate]').click());
  await expect.poll(()=>page.evaluate(()=>Chat.messages.at(-1).content)).toBe('新版：已到旅館，金幣剩六十。');
  await page.evaluate(()=>BAOStoryRevisionState.whenIdle());
  expect(await page.evaluate(()=>({gold:GameState.current.modules.economy.gold,phone:GameState.current.phoneUI.chat.map(x=>x.text),phase:GameState.current.stateTracker.phase,calls:__siteCalls.length}))).toEqual({gold:60,phone:['新版訊息'],phase:'updated',calls:2});
  page.once('dialog',d=>d.accept('保留事件結果，改寫文字。'));
  await page.evaluate(()=>document.querySelector('[data-rewrite]').click());
  await expect.poll(()=>page.evaluate(()=>Chat.messages.at(-1).content)).toBe('改寫：你已抵達旅館，身上還剩六十金幣。');
  await page.evaluate(()=>BAOStoryRevisionState.whenIdle());
  expect(await page.evaluate(()=>({gold:GameState.current.modules.economy.gold,phone:GameState.current.phoneUI.chat.map(x=>x.text),phase:GameState.current.stateTracker.phase,calls:__siteCalls.length}))).toEqual({gold:60,phone:['改寫訊息'],phase:'updated',calls:3});
  await page.evaluate(async()=>{const m=Chat.messages.at(-1);m.activeVariant=0;m.content=m.variants[0].content;App.saveStory(false);await BAOStoryRevisionState.whenIdle();await Storage.flush();});
  expect(await page.evaluate(()=>({gold:GameState.current.modules.economy.gold,phone:GameState.current.phoneUI.chat.map(x=>x.text),calls:__siteCalls.length}))).toEqual({gold:80,phone:['原文訊息'],calls:3});
  await page.reload();await page.waitForFunction(()=>window.BAOStoryRevisionState&&Storage.status().ready);
  expect(await page.evaluate(()=>{Storage.restoreStory(Storage.loadStory());return {gold:GameState.current.modules.economy.gold,phone:GameState.current.phoneUI.chat.map(x=>x.text),text:Chat.messages.at(-1).content};})).toEqual({gold:80,phone:['原文訊息'],text:'原文：已到車旁，金幣剩八十。'});
});

});

test('every published work offers all automatic module schemas to one merged request', async ({page}) => {
  test.setTimeout(120000);
  await setup(page);
  const results = await page.evaluate(async () => {
    const manifest=await(await fetch('data/character-catalog/community/manifest.json')).json();
    const pages=await Promise.all(manifest.pages.map(async page=>await(await fetch(page.file)).json()));
    const entries=[...await(await fetch('data/characters.json')).json(),...pages.flat()];
    const catalog=[...new Map(entries.map(card=>[card.id,card])).values()];
    const result=[];let calls=0;
    const original=fetch.bind(window);let transportPatch={};let requestBody;
    window.fetch=(input,init={})=>{
      if(!String(input?.url||input).startsWith('http://localhost:1234/v1')) return original(input,init);
      calls++;requestBody=JSON.parse(init.body);
      return Promise.resolve(new Response(JSON.stringify({choices:[{message:{content:'全站稽核正文。<BAO_STATE>'+JSON.stringify(transportPatch)+'</BAO_STATE>'},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}}));
    };
    for(const entry of catalog){
      const card=await App.loadCharacter(entry.id);
      if(!card)throw new Error('missing card '+entry.id);
      App.activeCharacter=card;Chat.reset();GameState.create(card,App.config);Chat.add('user','全站狀態核對');
      const defs=GameState.current.moduleDefinitions.filter(def=>def.tracking!=='manual');
      const schemas=BAOHelperData.moduleSchemas(defs);
      transportPatch={scene_checks:['time','location'],module_checks:Object.fromEntries(defs.map(def=>[def.id,def.kind==='collection'?true:schemas[def.id].fields.map(f=>f.key)]))};
      const response=await API.send(App.config.api,[{role:'system',content:'稽核'},{role:'user',content:'全站狀態核對'}]);
      const message=Chat.add('assistant',response.text);
      await WorldStateEngine.update(App.config,'全站狀態核對',message.content);
      const content=requestBody.messages.at(-1).content;
      const actual=JSON.parse(content.split('【可更新世界模組】\n')[1].split('\n\n')[0]);
      const snapshot=JSON.parse(content.split('【目前狀態】\n')[1].split('\n\n')[0]);
      result.push({id:entry.id,offered:Object.keys(actual).sort(),expected:defs.map(d=>d.id).sort(),
        phase:GameState.current.stateTracker.phase,body:message.content,hasScene:typeof snapshot.time==='string'&&typeof snapshot.location==='string'});
    }
    return {cards:result,calls,expectedCount:catalog.length,pages:manifest.pages.length};
  });
  expect(results.expectedCount).toBeGreaterThanOrEqual(74);expect(results.pages).toBeGreaterThanOrEqual(2);
  expect(results.cards).toHaveLength(results.expectedCount);expect(results.calls).toBe(results.expectedCount);
  for(const row of results.cards){expect(row.offered,row.id).toEqual(row.expected);expect(row.phase,row.id).not.toBe('failed');expect(row.body,row.id).toBe('全站稽核正文。');expect(row.hasScene,row.id).toBe(true);}
});

test('player character fields beyond the author 24-field limit are offered and checked',async({page})=>{
  await setup(page);
  const result=await page.evaluate(async()=>{
    App.activeCharacter=CharacterEngine.normalize({id:'field-audit',name:'小夏',greeting:'開始。',initial_state:{npcs:[{name:'小夏',presence:'present'}]},character_status:{enabled:true,allow_player_customize:true,primary_character_name:'小夏',
      fields:Array.from({length:24},(_,i)=>({key:'base_'+i,type:'number',track:true,default:10}))}});
    Chat.reset();GameState.create(App.activeCharacter,App.config);
    BAOCharacterStatus.applyCustomization({customFields:Array.from({length:24},(_,i)=>({key:'player_'+i,label:'玩家欄位'+i,type:'number',track:true,default:5}))},App.activeCharacter);
    BAOCharacterStatus.ensureState(App.activeCharacter);
    let body;const original=fetch.bind(window);
    window.fetch=(input,init={})=>{
      if(!String(input?.url||input).startsWith('http://localhost:1234/v1'))return original(input,init);
      body=JSON.parse(init.body);
      return Promise.resolve(new Response(JSON.stringify({choices:[{message:{content:'小夏的數值已變動。<BAO_STATE>'+JSON.stringify({time:'16:00',location:'車旁',character_statuses:{小夏:{player_23:77}}})+'</BAO_STATE>'},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}}));
    };
    Chat.add('user','查看小夏');const reply=await API.send(App.config.api,[{role:'user',content:'查看小夏'}]);const m=Chat.add('assistant',reply.text);
    await WorldStateEngine.update(App.config,'查看小夏',m.content);
    const offered=JSON.parse(body.messages.at(-1).content.split('【可更新人物狀態欄位】\n')[1].split('\n\n')[0]);
    return {fields:offered.map(f=>f.key),value:GameState.current.characterStatuses.小夏.player_23,phase:GameState.current.stateTracker.phase,pending:GameState.current.pendingStateTurns.length};
  });
  expect(result.fields).toHaveLength(48);expect(result.fields).toContain('player_23');expect(result.value).toBe(77);
  expect(result.phase).toBe('partial');expect(result.pending).toBe(1);
});

test('manual rebuild replays saved phone evidence and discloses legacy gaps',async({page})=>{
  await setup(page);await page.locator('#user-input').fill('出發');await page.evaluate(()=>App.sendMessage());
  const result=await page.evaluate(async()=>{
    GameState.current.phoneUI.chat[0].text='過期手機資料';
    GameState.current.phoneUI.notifications[0].read=true;
    let calls=0;const original=fetch.bind(window);
    window.fetch=(input,init={})=>{
      if(!String(input?.url||input).startsWith('http://localhost:1234/v1'))return original(input,init);
      calls++;return Promise.resolve(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({time:'16:00',location:'車旁',npcs:[],character_statuses:{},modules:{economy:{gold:80}}})},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}}));
    };
    await WorldStateEngine.rebuild(App.config,'deep');
    const rebuilt={chat:GameState.current.phoneUI.chat.map(x=>x.text),read:GameState.current.phoneUI.notifications[0].read,report:GameState.current.stateRebuildReport.phone};
    delete Chat.messages.at(-1).phonePatch;for(const variant of Chat.messages.at(-1).variants)delete variant.phonePatch;
    await WorldStateEngine.rebuild(App.config,'deep');
    return {rebuilt,legacyReport:GameState.current.stateRebuildReport.phone,legacyPhase:GameState.current.stateTracker.phase,calls};
  });
  expect(result.rebuilt).toEqual({chat:['原文訊息'],read:true,report:{applied:true,unconfirmed:false}});
  expect(result.legacyReport).toEqual({applied:false,unconfirmed:true});expect(result.legacyPhase).toBe('partial');expect(result.calls).toBe(2);
});

test('rollback restores matching currency and phone checkpoint without resending a model request',async({page})=>{
  await setup(page);await page.waitForFunction(()=>window.BAOStoryRollback&&window.BAOStoryLibrary);
  for(const input of ['出發','繼續']){await page.locator('#user-input').fill(input);await page.evaluate(()=>App.sendMessage());await page.evaluate(async()=>{await Storage.flush();await BAOStoryLibrary.flush();});}
  const original=await page.evaluate(()=>({refs:BAOStoryLibrary.refs(),gold:GameState.current.modules.economy.gold,phone:GameState.current.phoneUI.chat.map(x=>x.text)}));
  expect(original).toMatchObject({gold:60,phone:['原文訊息','新版訊息']});
  page.once('dialog',d=>d.accept());await page.evaluate(()=>BAOStoryRollback.rewind(1));
  expect(await page.evaluate(()=>({gold:GameState.current.modules.economy.gold,phone:GameState.current.phoneUI.chat.map(x=>x.text),calls:__siteCalls.length,location:GameState.current.location}))).toEqual({gold:80,phone:['原文訊息'],calls:2,location:'車旁'});
});

test('explicit separate state route updates phone and resources and rejects truncated helper data',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    App.config.cost={stateApiMode:'separate',stateInterval:1,stateApi:{type:'lmstudio',protocol:'openai',model:'state-mock',baseUrl:'http://localhost:1234/v1',key:'BAO_LOCAL_NO_AUTH'}};
    const original=fetch.bind(window);window.__helperCalls=0;
    window.fetch=(input,init={})=>{
      if(!String(input?.url||input).startsWith('http://localhost:1234/v1'))return original(input,init);
      const body=JSON.parse(init.body);
      if(body.model!=='state-mock')return original(input,init);
      __helperCalls++;
      return Promise.resolve(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({time:'16:00',location:'車旁',modules:{economy:{gold:__helperCalls===1?80:999}}})},finish_reason:__helperCalls===1?'stop':'length'}]}),{headers:{'Content-Type':'application/json'}}));
    };
  });
  await page.locator('#user-input').fill('出發');await page.evaluate(()=>App.sendMessage());
  expect(await page.evaluate(()=>({main:__siteCalls.length,helper:__helperCalls,gold:GameState.current.modules.economy.gold,phase:GameState.current.stateTracker.phase,phone:GameState.current.phoneUI.chat.map(x=>x.text)}))).toEqual({main:1,helper:1,gold:80,phase:'updated',phone:['原文訊息']});
  await page.locator('#user-input').fill('繼續');await page.evaluate(()=>App.sendMessage());
  expect(await page.evaluate(()=>({main:__siteCalls.length,helper:__helperCalls,gold:GameState.current.modules.economy.gold,phase:GameState.current.stateTracker.phase}))).toEqual({main:2,helper:2,gold:80,phase:'failed'});
  expect(await page.evaluate(async()=>JSON.stringify(await App.buildMessages(App.config)))).toContain('狀態尚未完整同步');
});

test('trusted internal-echo cleanup does not invalidate a matching state appendix',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    const original=fetch.bind(window);
    window.fetch=(input,init={})=>{
      if(!String(input?.url||input).startsWith('http://localhost:1234/v1'))return original(input,init);
      const content='真正正文。\n【目前核心狀態】\n{"資產":{"gold":100}}\n<BAO_STATE>'+JSON.stringify({time:'16:00',location:'車旁',modules:{economy:{gold:80}}})+'</BAO_STATE>';
      return Promise.resolve(new Response(JSON.stringify({choices:[{message:{content},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}}));
    };
  });
  await page.locator('#user-input').fill('出發');await page.evaluate(()=>App.sendMessage());
  expect(await page.evaluate(()=>({text:Chat.messages.at(-1).content,phase:GameState.current.stateTracker.phase,gold:GameState.current.modules.economy.gold}))).toEqual({text:'真正正文。',phase:'updated',gold:80});
});

test('identical regenerated prose still reconciles the new state receipt once',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    const original=fetch.bind(window);window.__identicalCalls=0;
    window.fetch=(input,init={})=>{
      if(!String(input?.url||input).startsWith('http://localhost:1234/v1'))return original(input,init);
      __identicalCalls++;
      const patch=__identicalCalls===1?{time:'16:00',location:'車旁',modules:{economy:{gold:80}}}:{time:'16:00',location:'車旁',modules:{economy:{gold:60}}};
      return Promise.resolve(new Response(JSON.stringify({choices:[{message:{content:'你確認了目前的餘額。<BAO_STATE>'+JSON.stringify(patch)+'</BAO_STATE>'},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}}));
    };
  });
  await page.locator('#user-input').fill('核對餘額');await page.evaluate(()=>App.sendMessage());
  expect(await page.evaluate(()=>GameState.current.modules.economy.gold)).toBe(80);
  await page.evaluate(()=>document.querySelector('[data-regenerate]').click());
  await expect.poll(()=>page.evaluate(()=>Chat.messages.at(-1).variants.length)).toBe(2);
  await page.evaluate(()=>BAOStoryRevisionState.whenIdle());
  expect(await page.evaluate(()=>({text:Chat.messages.at(-1).content,gold:GameState.current.modules.economy.gold,calls:__identicalCalls,phase:GameState.current.stateTracker.phase}))).toEqual({text:'你確認了目前的餘額。',gold:60,calls:2,phase:'updated'});
});
