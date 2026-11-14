const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const baseline='f6d8983c0f9196f4b912c498f56eb09e4195798c';
const target='#character-list [data-character-id="unread-afterglow-seoul"]';
async function start(page,width=390){
  await page.setViewportSize({width,height:844});
  await page.goto('./');
  await page.waitForFunction(()=>window.BAOExploreDiscovery && App.characters.length && (App.characterCatalogReady===true || (App.characterCatalogReady===undefined && App.communityCatalogLoaded?.size>=1)));
  await page.evaluate(()=>App.showView('explore'));
  await expect(page.locator('#explore-search-input')).toBeVisible();
}
async function query(page,value){await page.locator('#explore-search-input').fill(value);}
async function settled(page){await expect(page.locator('#explore-view')).toHaveAttribute('aria-busy','false');await expect(page.locator('#explore-result-count')).toContainText('找到');}
for(const width of [320,390,1280]){
  for(const mode of ['before','after'])test(`paired full search ${mode} ${width}px`,async({page},info)=>{
    if(mode==='before')for(const file of ['js/app.js','js/character-ui.js','js/explore-discovery.js']){
      const body=execFileSync('git',['show',baseline+':'+file],{encoding:'utf8'});
      await page.route('**/'+file+'?*',route=>route.fulfill({contentType:'application/javascript',body}));
    }
    const responses=[];
    page.on('response',response=>{if(/\/data\/(characters\.json|character-catalog\/)/.test(response.url()))responses.push(response)});
    let fullLoads=0;page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/data/characters/'))fullLoads++});
    const startAt=Date.now();await start(page,width);
    const interactiveMs=Date.now()-startAt;
    const initialCards=await page.locator('#character-list .character-card:visible').count();
    const initialRequests=responses.length;
    const searchAt=Date.now();await query(page,'未讀餘溫');
    if(mode==='before'){
      await expect(page.locator('#explore-search-empty')).toBeVisible();
      await expect(page.locator(target)).toHaveCount(0);
    }else{await expect(page.locator(target)).toBeVisible();await settled(page);}
    const firstSearchMs=Date.now()-searchAt;
    const searchRequests=responses.length-initialRequests;
    const firstSearchResponses=responses.slice(initialRequests);
    if(mode==='before'){
      await page.locator('#character-load-more').click();
      await expect(page.locator(target)).toBeVisible();
    }
    const secondAt=Date.now();await query(page,'不存在的作品-xyz');
    await expect(page.locator('#explore-search-empty')).toBeVisible();
    const subsequentSearchMs=Date.now()-secondAt;
    await query(page,'未讀餘溫');await expect(page.locator(target)).toBeVisible();
    expect(fullLoads).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
    const metadataBytes=(await Promise.all(responses.map(async r=>(await r.body()).length))).reduce((a,b)=>a+b,0);
    const bytes=async list=>(await Promise.all(list.map(async r=>(await r.body()).length))).reduce((a,b)=>a+b,0);
    const initialMetadataBytes=await bytes(responses.slice(0,initialRequests));
    const firstSearchMetadataBytes=await bytes(firstSearchResponses);
    const heap=await page.evaluate(()=>performance.memory?.usedJSHeapSize || null);
    const evidence={mode,width,interactiveMs,initialCards,firstSearchMs,subsequentSearchMs,initialRequests,searchRequests,initialMetadataBytes,firstSearchMetadataBytes,metadataRequests:responses.length,metadataBytes,heap,fullLoads};
    console.log('SEARCH_EVIDENCE '+JSON.stringify(evidence));
    await info.attach('search-metrics',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
    await page.screenshot({path:info.outputPath('search.png'),animations:'disabled'});
    if(mode==='after'){
      await page.locator('#explore-search-input').press('Tab');
      await expect(page.locator('[data-explore-clear]')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#explore-search-input')).toHaveValue('');
      await expect(page.locator('#character-list .character-card:visible')).toHaveCount(24);
      await page.locator('#character-load-more').click();
      expect(await page.locator('#character-list .character-card:visible').count()).toBeGreaterThan(24);
      for(let batch=0;batch<5 && await page.locator('#character-load-more').count();batch++)await page.locator('#character-load-more').click();
      await expect(page.locator('#character-load-more')).toHaveCount(0);
      await expect(page.locator('#character-list [data-character-id]:focus')).toHaveCount(1);
    }
  });
}
test('slow catalog uses latest query, keeps partial state honest and retries failed page',async({page})=>{
  let release;let attempts=0;
  await page.route('**/data/character-catalog/community/page-0001.json',async route=>{
    attempts++;
    if(attempts===1){await new Promise(resolve=>release=resolve);await route.fulfill({status:503,body:'unavailable'})}
    else await route.continue();
  });
  await start(page);await query(page,'未讀餘溫');
  await expect(page.locator('#explore-result-count')).toContainText('正在搜尋');
  await expect(page.locator('#explore-search-empty')).toBeHidden();
  await query(page,'不存在的作品-xyz');
  await expect.poll(()=>typeof release).toBe('function');
  release();
  await expect(page.locator('[data-explore-retry]')).toBeVisible();
  await expect(page.locator('#explore-result-count')).toContainText('僅搜尋已載入');
  await page.locator('[data-explore-retry]').click();await settled(page);
  await expect(page.locator('#explore-search-empty')).toBeVisible();
  await expect(page.locator(target)).toHaveCount(0);
  await query(page,'未讀餘溫');await expect(page.locator(target)).toBeVisible();
  expect(attempts).toBe(2);
});
test('manifest failure has a working retry and reload repeats complete search',async({page})=>{
  let attempts=0;
  await page.route('**/data/character-catalog/community/manifest.json',route=>++attempts===1?route.fulfill({status:503,body:''}):route.continue());
  await start(page);await query(page,'未讀餘溫');await expect(page.locator(target)).toBeVisible();await settled(page);
  expect(attempts).toBe(2);
  await page.reload();await page.waitForFunction(()=>App.characterCatalogReady);await page.evaluate(()=>App.showView('explore'));await query(page,'未讀餘溫');await expect(page.locator(target)).toBeVisible();await settled(page);
});
test('complete metadata respects rating, local continuity and catalog-only publication boundary',async({page})=>{
  const seen=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/data/characters/'))seen.push(r.url())});
  await start(page);await query(page,'未讀餘溫');await expect(page.locator(target)).toBeVisible();await settled(page);
  await page.locator(target+' [data-explore-favorite]').click();
  await page.evaluate(()=>{BAOExploreDiscovery.markViewed('unread-afterglow-seoul',Date.now());BAOExploreDiscovery.state.scope='favorites';BAOExploreDiscovery.state.category='female';BAOExploreDiscovery.apply()});
  await expect(page.locator(target)).toBeVisible();
  await page.evaluate(()=>{BAOExploreDiscovery.state.query='KKT';BAOExploreDiscovery.state.scope='recent';BAOExploreDiscovery.apply()});
  await expect(page.locator(target)).toBeVisible();
  await page.evaluate(()=>{BAOExploreDiscovery.state.scope='all';BAOExploreDiscovery.state.category='all';BAOExploreDiscovery.state.query='慾望街區';BAOExploreDiscovery.apply()});
  await expect(page.locator('#character-list [data-character-id="desire-district"]')).toHaveCount(0);
  await page.evaluate(()=>{BAOContentPreferences.setAdultContentEnabled(true,{confirmAge:false});BAOExploreDiscovery.apply()});
  await expect(page.locator('#character-list [data-character-id="desire-district"]')).toBeVisible();
  await page.evaluate(()=>BAOContentPreferences.setAdultContentEnabled(false));
  await expect(page.locator('#character-list [data-character-id="desire-district"]')).toHaveCount(0);
  expect(seen).toHaveLength(0);
  await query(page,'未讀餘溫');await expect(page.locator(target)).toBeVisible();
  await page.locator(target).press('Enter');
  await expect(page.locator('#explore-work-preview')).toBeVisible();expect(seen).toHaveLength(0);
  await page.locator('#explore-work-preview').getByRole('button',{name:'查看作品',exact:true}).click();
  await expect(page.locator('#detail-view')).toHaveClass(/active/);expect(seen).toHaveLength(1);
  await page.locator('#detail-start').click();await expect(page.locator('#builder-view')).toHaveClass(/active/);
});

test('official catalog failure offers retry rather than a false empty result',async({page})=>{
  let attempts=0;
  await page.route('**/data/characters.json',route=>++attempts===1?route.fulfill({status:503,body:''}):route.continue());
  await page.goto('./');await page.waitForFunction(()=>window.BAOExploreDiscovery);
  await page.evaluate(()=>App.showView('explore'));
  await expect(page.locator('[data-explore-retry]')).toBeVisible();
  await expect(page.locator('#explore-search-empty')).toBeHidden();
  await query(page,'未讀餘溫');
  await page.locator('[data-explore-retry]').click();
  await expect(page.locator(target)).toBeVisible();await settled(page);expect(attempts).toBe(2);
});

// Release the actual outstanding response explicitly; no timing sleeps.
async function holdOlderPage(page) {
  let release;
  const requested = new Promise(resolve => {
    page.route('**/data/character-catalog/community/page-0001.json', async route => {
      await new Promise(done => { release = done; resolve(); });
      await route.continue();
    });
  });
  return { requested, release: () => release() };
}
test('first nonexistent search removes the exhausted pager', async ({page}) => {
  const hold = await holdOlderPage(page);
  await start(page);
  await query(page, '不存在的作品-xyz');
  await hold.requested;
  await expect(page.locator('#explore-search-empty')).toBeHidden();
  hold.release();
  await settled(page);
  await expect(page.locator('#explore-search-empty')).toBeVisible();
  await expect(page.locator('#character-load-more')).toHaveCount(0);
});
for (const change of ['keyword', 'clear', 'category', 'multiple']) {
  test(`pending pager cannot change new criteria or input focus: ${change}`, async ({page}) => {
    const hold = await holdOlderPage(page);
    await start(page);
    await expect(page.locator('#character-list .character-card')).toHaveCount(24);
    const click = page.locator('#character-load-more').click();
    await hold.requested;
    await click;
    await query(page, '未讀餘溫');
    if (change === 'clear' || change === 'multiple') {
      await page.locator('[data-explore-clear]').click();
    }
    if (change === 'category' || change === 'multiple') {
      await page.evaluate(() => { BAOExploreDiscovery.state.category = 'female'; BAOExploreDiscovery.apply(); });
    }
    if (change === 'multiple') {
      await query(page, '不存在的作品-xyz');
      await query(page, '未讀餘溫');
    }
    await page.locator('#explore-search-input').focus();
    hold.release();
    await expect.poll(() => page.evaluate(() => App.hasMoreCharacterCatalog())).toBe(false);
    await settled(page);
    await expect(page.locator('#explore-search-input')).toBeFocused();
    const gallery = await page.evaluate(() => BAOExploreDiscovery.gallery().characters.length);
    expect(gallery).toBeLessThanOrEqual(24);
    if (change === 'clear') await expect(page.locator('#character-list .character-card')).toHaveCount(24);
    else await expect(page.locator(target)).toBeVisible();
  });
}
test('same criteria pager preserves another control focus and still expands results', async ({page}) => {
  const hold = await holdOlderPage(page);
  await start(page);
  await page.locator('#character-load-more').click();
  await hold.requested;
  await page.locator('#explore-search-input').focus();
  hold.release();
  await expect.poll(() => page.locator('#character-list .character-card').count()).toBeGreaterThan(24);
  await expect(page.locator('#explore-search-input')).toBeFocused();
  await expect(page.locator('#character-load-more')).toBeVisible();
});
