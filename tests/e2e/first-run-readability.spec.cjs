const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

for (const width of [320, 390, 820, 1280]) {
  test(`quick-start missing API key remains readable and actionable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
    await page.goto('/');
    await page.waitForFunction(() =>
      Boolean(window.App?.characters?.length && window.BAOQuickSetup &&
      window.BAOStoryStartReadiness && window.BAOPlayerBuilderV2 &&
      document.querySelector('link[href^="css/story-start-readiness.css"]')?.sheet)
    );
    await page.evaluate(async () => {
      const character = App.characters.find(item => item.id !== 'autonomous-npc-world');
      if (!character) throw new Error('Test work unavailable');
      await App.openCharacter(character.id);
      App.openBuilder();
    });
    await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-setup', 'quick');
    await page.locator('#bao-connection-mode [data-bao-connection="byok"]').click();

    await page.evaluate(() => {
      const preset = App.modelPresets.find(item =>
        item.model && item.base_url && !['bao-credits', 'lmstudio'].includes(item.provider)
      );
      if (!preset) throw new Error('No complete BYOK preset available');
      const provider = document.getElementById('api-type');
      provider.value = preset.provider;
      provider.dispatchEvent(new Event('change', { bubbles: true }));
      const select = document.getElementById('model-select');
      select.value = String(App.modelPresets.indexOf(preset));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const key = document.getElementById('api-key');
      key.value = '';
      key.dispatchEvent(new Event('input', { bubbles: true }));
      BAOStoryStartReadiness.sync();
    });

    const panel = page.locator('#bao-start-readiness');
    const action = panel.locator('[data-start-ready-action]');
    await expect(panel).toHaveAttribute('data-ready', 'false');
    await expect(panel.locator('[data-start-ready-message]')).toContainText('還缺連線金鑰');
    await expect(action).toBeVisible();
    await expect(action).toHaveText('貼上連線金鑰');

    const sizes = await panel.evaluate(node => {
      const select = selector => node.querySelector(selector);
      const read = selector => {
        const element = select(selector), computed = getComputedStyle(element);
        return { size: parseFloat(computed.fontSize), height: element.getBoundingClientRect().height };
      };
      return {
        kicker: read('.bao-start-readiness-head span'),
        title: read('.bao-start-readiness-head b'),
        summary: read('[data-start-ready-summary]'),
        message: read('[data-start-ready-message]'),
        action: read('[data-start-ready-action]'),
        width: document.documentElement.scrollWidth, viewport: innerWidth
      };
    });
    expect(sizes.kicker.size).toBeGreaterThanOrEqual(11);
    for (const key of ['title', 'summary', 'message', 'action']) {
      expect(sizes[key].size, key + ' text at ' + width).toBeGreaterThanOrEqual(13);
    }
    expect(sizes.action.height).toBeGreaterThanOrEqual(44);
    expect(sizes.width).toBeLessThanOrEqual(sizes.viewport + 1);

    fs.mkdirSync('test-results/first-run-readability', { recursive: true });
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/first-run-readability/builder-${width}.png`,
      animations: 'disabled',
      fullPage: false
    });

    await action.click();
    await expect(page.locator('#api-key')).toBeFocused();
    await page.locator('#api-key').fill('ui-readability-test-only');
    await expect(panel).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#builder-view')).toHaveClass(/active/);
  });
}
