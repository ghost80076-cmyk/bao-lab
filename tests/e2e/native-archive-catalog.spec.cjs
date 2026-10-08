const { test, expect } = require('@playwright/test');
const audit = require('../../docs/native-archive-catalog-audit.json');
const works = audit.works.filter(w => w.changed);
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`formal native archives open and update at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize(viewport);
    if (process.env.BAO_LIVE_URL) {
      // A push may start this workflow before Pages has finished publishing it.
      await expect.poll(async () => {
        const r = await page.request.get('docs/native-archive-catalog-audit.json?archive-smoke=' + Date.now());
        if (!r.ok()) return false;
        try { return (await r.json()).works.filter(w => w.changed).length === 44; } catch { return false; }
      }, { timeout: 180000, intervals: [5000] }).toBe(true);
    }
    await page.goto('./');
    await page.waitForFunction(() => typeof App !== 'undefined' && window.BAOGameplayUI && window.BAOWorldModules && window.BAOAuthorInline && App.characters?.length);
    for (const work of works) {
      const result = await page.evaluate(async ({ work }) => {
        const raw = await (await fetch(work.file + '?archive-smoke=' + Date.now())).json();
        localStorage.removeItem('bao-lab:author-regex:v1:' + encodeURIComponent(work.id));
        const character = await App.loadCharacter(work.id);
        if (!character) throw new Error(work.id + ': catalog load failed');
        const schema = BAOGameplayUICore.normalize(character.gameplay_ui);
        if (schema?.panels[0]?.sections[0]?.type !== 'tabs') throw new Error(work.id + ': production archive missing');
        App.activeCharacter = character;
        App.openBuilder();
        App.config = { narrativeMode: 'world', displayMode: 'ui', persona: {name:'測試玩家'}, memory:{mode:'smart'}, api:{type:'custom',key:'',model:'offline-test'} };
        Chat.reset();
        GameState.create(character, App.config);
        App.renderChatShell(true);
        App.showView('chat');
        BAOGameplayUI.syncTabs();
        BAOGameplayUI.activateInitialPanel();
        const tabs = schema.panels[0].sections[0];
        const watch = tabs.tabs.find(t => t.id === 'changes').sections[0].items[0];
        const before = BAOGameplayUICore.getPath(GameState.current, watch.path);
        const after = typeof before === 'number' ? before + 1 : typeof before === 'boolean' ? !before : before + ' · 測試更新';
        const update = {}; let target = update;
        const parts = watch.path.split('.');
        parts.slice(0,-1).forEach(k => target = target[k] = {});
        target[parts.at(-1)] = after;
        GameState.applyUpdate(update);
        await Promise.resolve(); await Promise.resolve();
        BAOGameplayUI.renderPanel(schema.panels[0].id);
        return { before: String(before), after: String(after), panel: schema.panels[0].id, greeting: raw.content.greeting };
      }, {work});
      // Play keeps status closed by default. Exercise the real player entry point.
      const info = page.locator('#bao-play-status-toggle');
      if (await info.getAttribute('aria-expanded') !== 'true') await info.click();
      await page.locator('#game-ui .ui-tab[data-panel="' + result.panel + '"]').click();
      const archive = page.locator('#ui-panel .gameplay-tabbed-archive').first();
      await expect(archive).toBeVisible();
      await archive.locator('[data-gameplay-archive-tab="changes"]').click();
      const diff = archive.locator('[data-timeline-mode="round_diff"]');
      await expect(diff).toContainText(result.before);
      await expect(diff).toContainText(result.after);
      await expect(page.locator('#builder-author-link')).toHaveAttribute('href', /author\.html\?id=banzhang/);
      const overflow = await archive.evaluate(el => el.scrollWidth > el.clientWidth + 2);
      expect(overflow, work.id + ': no narrow archive overflow').toBe(false);
      // The new renderer remains independent from author Regex and text mode.
      await page.evaluate(() => { App.config.displayMode = 'text'; App.renderChatShell(false); });
      await expect.poll(() => page.locator('#chat-stream').innerText()).not.toContain('【YB:');
      for (const frame of page.frames().filter(f => f !== page.mainFrame())) {
        const body = await frame.locator('body').innerText();
        expect(body || '', work.id + ': sidecar consumed greeting markers').not.toContain('【YB:');
      }
    }
  });
}
