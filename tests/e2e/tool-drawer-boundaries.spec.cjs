const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

test('story drawer keeps phone, tablet and desktop geometry across five themes', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.BAOChatToolNavigation && window.BAOMobileReadingLayout &&
    window.BAOGalleryFocus && window.App?.characters?.length));
  await page.evaluate(async () => {
    await App.openCharacter(App.characters[0].id);
    App.config = {
      narrativeMode: 'immersive', displayMode: 'text',
      persona: { name: '測試玩家', gender: '未指定' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true); App.showView('chat');
  });
  await page.waitForFunction(() => ['chat-tool-navigation', 'chat-experience', 'mobile-reading-layout',
    'experience-preferences', 'bao-editorial-cinema'].every(name =>
      Boolean(document.querySelector(`link[href^="css/${name}.css"]`)?.sheet)));
  for (const width of [390, 820, 821, 1080, 1081, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['night', 'mist', 'dawn', 'dusk', 'sunset']) {
      await page.evaluate(theme => {
        BAOChatToolNavigation.closeDrawer();
        document.documentElement.dataset.yoruTheme = theme;
        BAOChatToolNavigation.openDrawer();
      }, theme);
      const drawer = page.getByRole('dialog', { name: '故事功能選單' });
      await expect(drawer).toBeVisible();
      const state = await drawer.evaluate(dialog => {
        const css = getComputedStyle(dialog), box = dialog.getBoundingClientRect();
        const header = dialog.querySelector('header h2');
        const token = document.createElement('span');
        token.style.background = 'var(--yoru-surface)'; dialog.append(token);
        const surface = getComputedStyle(token).backgroundColor; token.remove();
        return { top: css.borderTopLeftRadius, bottom: css.borderBottomLeftRadius,
          font: getComputedStyle(header).fontSize, background: css.backgroundColor, surface,
          left: box.left, right: box.right, bottomEdge: box.bottom, height: box.height,
          scroll: getComputedStyle(dialog.querySelector('.bao-chat-tool-dialog-body')).overflowY };
      });
      const label = `${width}px ${theme}`;
      expect(state.top, label).toBe(width <= 820 ? '24px' : '22px');
      expect(state.bottom, label).toBe(width <= 820 ? '0px' : '22px');
      expect(state.font, label).toBe(width <= 820 ? '18px' : '22px');
      expect(state.left, label).toBeGreaterThanOrEqual(-1);
      expect(state.right, label).toBeLessThanOrEqual(width + 1);
      expect(state.bottomEdge, label).toBeLessThanOrEqual(901);
      expect(state.height, label).toBeGreaterThan(100);
      expect(state.scroll, label).toBe('auto');
      if (theme !== 'night') expect(state.background, label).toBe(state.surface);
      if ([390, 821, 1440].includes(width) && ['night', 'mist'].includes(theme)) {
        fs.mkdirSync('test-results/tool-drawer', { recursive: true });
        await page.screenshot({ path: `test-results/tool-drawer/${width}-${theme}.png`, animations: 'disabled' });
      }
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
    }
  }
});
