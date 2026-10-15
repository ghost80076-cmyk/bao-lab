const { test, expect } = require('@playwright/test');

for (const width of [320, 390, 1280]) {
  test(`worldbook text list keeps titles and controls within each row (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => window.YoruWorldbookLibrary);
    await page.evaluate(() => {
      const imported = (id, name) => ({
        schema: 'yorubay-worldbook-pack', version: 1,
        meta: { id, name, world: 'general', visibility: 'private' },
        entries: [{ id: 'background', mode: 'keyword', keywords: ['港口'], content: '港口的日常背景。' }]
      });
      GameState.current = { location: '', npcs: [], events: [], worldbookLibrary: {
        version: 1, enabled: [], pinned: {}, installed: [
          imported('personal-adventure', '我的奇幻冒險世界書'),
          imported('personal-life', '我的都市日常世界書')
        ]
      } };
      App.saveStory = () => {};
      YoruWorldbookLibrary.open();
    });
    const modal = page.locator('.ylb-modal');
    const collections = modal.locator('.ylb-collection');
    await expect(collections.first()).toBeVisible();
    await expect(modal.locator('img, picture, canvas')).toHaveCount(0);
    await expect(modal.locator('.ylb-collection-copy strong', { hasText: '我的奇幻冒險世界書' })).toBeVisible();
    await expect(modal.locator('.ylb-collection-copy strong', { hasText: '我的都市日常世界書' })).toBeVisible();
    await expect(modal.locator('.ylb-chapters[open]')).toHaveCount(0);
    await expect(modal.locator('select[aria-label="世界書召回模式"]')).not.toBeVisible();
    const geometry = await modal.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return {
        overflow: node.scrollWidth > node.clientWidth + 1,
        rows: [...node.querySelectorAll('.ylb-collection')].map(row => {
          const title = row.querySelector('.ylb-collection-copy strong').getBoundingClientRect();
          const control = row.querySelector('.ylb-collection-head input').getBoundingClientRect();
          return { height: row.getBoundingClientRect().height, titleWidth: title.width,
            titleInside: title.left >= bounds.left && title.right <= bounds.right,
            controlWidth: control.width, controlHeight: control.height };
        })
      };
    });
    expect(geometry.overflow).toBe(false);
    for (const row of geometry.rows) {
      expect(row.height).toBeLessThan(160);
      expect(row.titleWidth).toBeGreaterThan(140);
      expect(row.titleInside).toBe(true);
      expect(row.controlWidth).toBeLessThanOrEqual(40);
      expect(row.controlHeight).toBeLessThanOrEqual(24);
    }
    const book = modal.locator('.ylb-collection').filter({ hasText: '我的都市日常世界書' });
    await book.getByRole('checkbox', { name: '啟用 我的都市日常世界書', exact: true }).check();
    await expect(book).toContainText('已啟用');
    expect(await page.evaluate(() => GameState.current.worldbookLibrary.enabled)).toContain('personal-life');
    await book.locator('.ylb-chapters > summary').click();
    const chapter = book.locator('.ylb-row input[type="checkbox"]');
    await expect(chapter).toBeVisible();
    const chapterSize = await chapter.boundingBox();
    expect(chapterSize.width).toBeLessThanOrEqual(24);
    await chapter.uncheck();
    expect(await page.evaluate(() => GameState.current.worldbookLibrary.enabled)).not.toContain('personal-life');
    await modal.getByRole('button', { name: '關閉', exact: true }).click();
    await expect(modal).toHaveCount(0);
  });
}

for (const width of [1280, 390]) {
  test(`worldbook mode UI and story-local persistence (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => window.YoruWorldbookLibrary && window.BAOLorebook);
    await page.evaluate(() => {
      GameState.current = { location: '中央商業區', npcs: [], events: [], worldbookLibrary: {
        version: 1, enabled: ['sunrise-geography-demo'], installed: [], pinned: {}
      } };
      App.saveStory = () => { window.recallSaved = JSON.stringify(GameState.current); };
      YoruWorldbookLibrary.open();
    });
    const backdrop = page.locator('.ylb-backdrop').last();
    const modal = backdrop.locator('.ylb-modal');
    const mode = modal.locator('select[aria-label="世界書召回模式"]');
    await expect(mode).toHaveValue('auto');
    await expect(page.locator('.ylb-backdrop')).toHaveCount(1);

    const sunriseMaster = modal.locator('input[aria-label="啟用整本 曙光市"]');
    const realmsMaster = modal.locator('input[aria-label="啟用整本 三界九域"]');
    const simulatorMaster = modal.locator('input[aria-label="啟用整本 通用世界模擬器"]');
    await expect(sunriseMaster).toHaveCount(1);
    await expect(realmsMaster).toHaveCount(1);
    await expect(simulatorMaster).toHaveCount(1);

    const simulator = simulatorMaster.locator('xpath=ancestor::section[contains(@class,"ylb-collection")]');
    await expect(simulator).toContainText('未啟用');
    const simulatorDetails = simulator.locator('details.ylb-chapters');
    await simulatorDetails.evaluate(node => { node.open = true; });
    for (const chapter of ['冒險題材參考','都市與競技參考','人物與關係參考','戀愛與情感題材','身分與權謀題材','校園與成長題材']) {
      await expect(simulator.getByText(chapter, { exact: true })).toHaveCount(1);
    }
    for (const name of ['通用世界模擬器｜戀愛與情感題材','通用世界模擬器｜身分與權謀題材','通用世界模擬器｜校園與成長題材']) {
      await expect(modal.locator(`input[aria-label="${name}"]`)).not.toBeChecked();
    }
    const relationship = modal.locator('input[aria-label="通用世界模擬器｜人物與關係參考"]');
    await expect(relationship).not.toBeChecked();
    await relationship.check();
    expect(await page.evaluate(() => JSON.parse(window.recallSaved).worldbookLibrary.enabled))
      .toContain('world-simulator-relationship-reference');
    const adventure = modal.locator('input[aria-label="通用世界模擬器｜冒險題材參考"]');
    await expect(adventure).not.toBeChecked();
    await adventure.check();
    expect(await page.evaluate(() => JSON.parse(window.recallSaved).worldbookLibrary.pinned['world-simulator-adventure-reference'].entries.length)).toBe(9);
    const life = modal.locator('input[aria-label="通用世界模擬器｜都市與競技參考"]');
    await expect(life).not.toBeChecked();
    await life.check();
    expect(await page.evaluate(() => JSON.parse(window.recallSaved).worldbookLibrary.pinned['world-simulator-life-reference'].entries.length)).toBe(5);
    const romance = modal.locator('input[aria-label="通用世界模擬器｜戀愛與情感題材"]');
    await romance.check();
    expect(await page.evaluate(() => JSON.parse(window.recallSaved).worldbookLibrary.pinned['world-simulator-romance-reference'].entries.length)).toBe(13);
    await modal.locator('.ylb-recall-explain summary').click();
    await mode.selectOption('off');
    expect(await page.evaluate(() => JSON.parse(window.recallSaved).worldbookLibrary.recallMode)).toBe('off');
    await modal.locator('[data-close]').click();
    await page.evaluate(() => {
      const saved = JSON.parse(window.recallSaved);
      saved.worldbookLibrary = CharacterEngine.normalizeWorldbookLibrary(saved.worldbookLibrary);
      GameState.current = saved;
      YoruWorldbookLibrary.open();
    });
    await expect(mode).toHaveValue('off');
    await expect(relationship).toBeChecked();
    expect(await page.evaluate(() => GameState.current.worldbookLibrary.pinned['world-simulator-relationship-reference'].entries.length)).toBe(28);
    await modal.locator('.ylb-recall-explain summary').click();
    await mode.selectOption('scene');
    expect(await page.evaluate(() => GameState.current.worldbookLibrary.recallMode)).toBe('scene');
    expect(await page.evaluate(() => {
      const api = YoruWorldbookLibrary;
      const old = GameState.current;
      GameState.current = { location: '', npcs: [], events: [] };
      return { stale: api.setRecallMode('off', old), other: GameState.current.worldbookLibrary };
    })).toEqual({ stale: false, other: undefined });
    await modal.locator('[data-close]').click();
    await page.evaluate(() => YoruWorldbookLibrary.open());
    await expect(mode).toHaveValue('auto');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });
}


for (const width of [390,1280]) {
  test('worldbook discovery finds topics without changing collection apply scope ('+width+'px)', async ({page}) => {
    await page.setViewportSize({width,height:844});
    await page.goto('/');
    await page.waitForFunction(() => window.YoruWorldbookLibrary && window.BAOLorebook);
    await page.evaluate(() => {
      GameState.current = {
        location:'中央商業區',npcs:[],events:[],
        worldbookLibrary:{version:1,enabled:['sunrise-geography-demo'],installed:[],pinned:{}}
      };
      App.saveStory=()=>{};
      YoruWorldbookLibrary.open();
    });
    const modal=page.locator('.ylb-modal');
    const search=modal.getByRole('searchbox',{name:'搜尋世界書主題或章節'});
    await expect(search).toBeVisible();
    const collection=modal.locator('.ylb-collection');
    await expect(collection.first()).toBeVisible();
    const initial=await collection.count();
    expect(initial).toBeGreaterThan(2);

    await search.fill('人物與關係參考');
    await expect(modal.locator('.ylb-collection:visible')).toHaveCount(1);
    const visible=modal.locator('.ylb-collection:visible');
    await expect(visible).toContainText('通用世界模擬器');
    await expect(visible.locator('details.ylb-chapters')).toHaveAttribute('open','');
    await expect(modal.locator('.ylb-result-count')).toContainText('顯示 1 /');

    const master=visible.getByRole('checkbox',{name:'啟用整本 通用世界模擬器'});
    await master.check();
    await expect(modal.locator('.ylb-collection:visible')).toHaveCount(1);
    const enabled=await page.evaluate(()=>GameState.current.worldbookLibrary.enabled);
    expect(enabled).toContain('world-simulator-relationship-reference');
    expect(enabled).toContain('world-simulator-adventure-reference');

    await search.fill('沒有這個世界書');
    await expect(modal.locator('.ylb-collection:visible')).toHaveCount(0);
    await expect(modal.locator('.ylb-empty-results')).toBeVisible();
    await search.fill('');

    await modal.getByRole('button',{name:'已啟用',exact:true}).click();
    await expect(modal.locator('.ylb-collection:visible')).not.toHaveCount(0);
    await expect(modal.getByRole('button',{name:'已啟用'})).toHaveAttribute('aria-pressed','true');

    await modal.locator('button[data-ylb-filter="mine"]').click();
    await expect(modal.locator('.ylb-collection:visible')).toHaveCount(0);
    await expect(modal.locator('.ylb-empty-results')).toContainText('還沒有私人世界書');
    await modal.getByRole('button',{name:'全部',exact:true}).click();
    await expect(modal.locator('.ylb-collection:visible')).toHaveCount(initial);
    await expect(modal.locator('.ylb-recall-explain')).not.toHaveAttribute('open','');
    await modal.locator('.ylb-recall-explain summary').click();
    await expect(modal.locator('.ylb-recall-explain')).toHaveAttribute('open','');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  });
}
