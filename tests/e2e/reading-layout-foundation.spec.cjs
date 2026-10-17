const { test, expect } = require('@playwright/test');

// Exercise the real player entry so surface-mode and CSS lazy-loading match production.
async function openDemoStory(page, width, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.locator('#home-view button[data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let i = 0; i < 3; i += 1) await page.locator('#next-step').click();
  await page.locator('#bao-demo-mode').check();
  await page.locator('#next-step').click();
  await page.locator('#start-story').click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
  await page.waitForFunction(() => Boolean(
    document.querySelector('link[href^="css/bao-editorial-cinema.css"]')?.sheet &&
    document.querySelector('link[href^="css/chat-experience.css"]')?.sheet
  ));
}

for (const width of [1440, 1920]) {
  test(`desktop Play has an aligned frame and a single story scrollbar at ${width}px`, async ({ page }) => {
    await openDemoStory(page, width);
    const measure = await page.evaluate(() => {
      const header = document.querySelector('.topbar').getBoundingClientRect();
      const main = document.querySelector('#chat-view .chat-main').getBoundingClientRect();
      const story = document.getElementById('chat-stream');
      return {
        headerLeft: header.left, headerWidth: header.width,
        readerLeft: main.left, readerWidth: main.width,
        documentHeight: document.scrollingElement.scrollHeight,
        viewportHeight: innerHeight,
        storyHeight: story.clientHeight,
        storyOverflow: getComputedStyle(story).overflowY,
        footerHidden: getComputedStyle(document.querySelector('.app-shell>footer')).display === 'none',
      };
    });
    expect(Math.abs(measure.headerLeft - measure.readerLeft)).toBeLessThanOrEqual(2);
    expect(Math.abs(measure.headerWidth - measure.readerWidth)).toBeLessThanOrEqual(2);
    expect(measure.readerWidth).toBeGreaterThan(1080);
    expect(measure.readerWidth).toBeLessThanOrEqual(1280);
    expect(measure.documentHeight).toBeLessThanOrEqual(measure.viewportHeight + 2);
    expect(measure.storyHeight).toBeGreaterThan(300);
    expect(measure.storyOverflow).toBe('auto');
    expect(measure.footerHidden).toBe(true);

    // Long conversations stay in the story stream; the outer document does not scroll.
    const stream = page.locator('#chat-stream');
    const inner = await stream.evaluate(node => {
      const extra = document.createElement('div');
      extra.innerHTML = Array.from({ length: 55 }, (_, i) =>
        `<p>閱讀版面檢查 ${i}：保留長篇敘事捲動而不增加外層捲軸。</p>`).join('');
      node.appendChild(extra);
      node.scrollTop = 300;
      return { scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, scrollTop: node.scrollTop };
    });
    expect(inner.scrollHeight).toBeGreaterThan(inner.clientHeight);
    expect(inner.scrollTop).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.scrollingElement.scrollHeight)).toBeLessThanOrEqual(902);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });
}

test('the light and rose themes carry through the first-party reading chrome', async ({ page }) => {
  await openDemoStory(page, 1440);
  for (const [theme, expected] of [
    ['mist', { page: 'rgb(245, 240, 233)', reader: 'rgb(255, 252, 247)' }],
    ['rose', { page: 'rgb(48, 40, 44)', reader: 'rgb(52, 43, 48)' }],
  ]) {
    await page.evaluate(value => { document.documentElement.dataset.yoruTheme = value; }, theme);
    const colors = await page.evaluate(() => ({
      page: getComputedStyle(document.body).backgroundColor,
      reader: getComputedStyle(document.getElementById('chat-stream')).backgroundColor,
      heading: getComputedStyle(document.querySelector('#chat-view .chat-title-copy h2')).color,
    }));
    expect(colors.page).toBe(expected.page);
    expect(colors.reader).toBe(expected.reader);
    expect(colors.heading).not.toBe(colors.reader);
  }
});

test('mobile keeps its full-screen reader and visible composer', async ({ page }) => {
  await openDemoStory(page, 390, 844);
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('#user-input')).toBeVisible();
  const state = await page.evaluate(() => ({
    width: document.querySelector('#chat-view').getBoundingClientRect().width,
    client: document.getElementById('chat-stream').clientHeight,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(state.width).toBeGreaterThanOrEqual(380);
  expect(state.client).toBeGreaterThan(120);
  expect(state.pageWidth).toBeLessThanOrEqual(391);
});
