const { test, expect } = require('@playwright/test');

// Reproduce the first chat frame while the optional enhancement chain is still absent.
// The rendering CSS must be available even without site-ui.js loading any modules.
for (const width of [390, 1280]) {
  test(`story first paint has final reading geometry at ${width}px before lazy JS`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/js/site-ui.js*', route => route.fulfill({
      status: 200, contentType: 'text/javascript', body: '/* deferred enhancement probe */'
    }));
    await page.goto('/', { waitUntil: 'load' });

    const firstPaint = await page.evaluate(() => {
      const names = ['story-reader', 'chat-tool-navigation', 'mobile-reading-layout'];
      const links = Object.fromEntries(names.map(name => {
        const path = `css/${name}.css`;
        const matches = [...document.querySelectorAll('link[rel="stylesheet"]')]
          .filter(link => link.getAttribute('href')?.split('?')[0] === path);
        return [name, { count: matches.length, loaded: Boolean(matches[0]?.sheet) }];
      }));
      document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
      const chat = document.getElementById('chat-view');
      chat.classList.add('active');
      return {
        links,
        chatPosition: getComputedStyle(chat).position,
        chatWidth: chat.getBoundingClientRect().width,
        headerDisplay: getComputedStyle(document.querySelector('.topbar')).display,
        mobileRootOverflow: getComputedStyle(document.body).overflow
      };
    });
    for (const name of ['story-reader', 'chat-tool-navigation', 'mobile-reading-layout']) {
      expect(firstPaint.links[name]).toEqual({ count: 1, loaded: true });
    }
    if (width <= 820) {
      expect(firstPaint.chatPosition).toBe('fixed');
      expect(firstPaint.chatWidth).toBeGreaterThanOrEqual(width - 2);
      expect(firstPaint.headerDisplay).toBe('none');
    }
  });
}

test('late story enhancements do not duplicate preloaded reading styles', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.BAOMobileReadingLayout), null, { timeout: 25000 });
  const duplicates = await page.evaluate(() =>
    ['story-reader', 'chat-tool-navigation', 'mobile-reading-layout']
      .map(name => [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter(link => link.getAttribute('href')?.split('?')[0] === `css/${name}.css`).length)
  );
  expect(duplicates).toEqual([1, 1, 1]);
});
