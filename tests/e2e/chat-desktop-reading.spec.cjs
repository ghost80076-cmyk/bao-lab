const { test, expect } = require('@playwright/test');

test('desktop story uses a readable viewport and larger assistant text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(document.querySelector('link[href="css/chat-desktop-reading.css"]')?.sheet));
  await page.evaluate(() => {
    App.showView('chat');
    document.getElementById('chat-stream').innerHTML = '<div class="message assistant"><div class="bubble">閱讀測試文字</div></div>';
  });
  const measure = await page.locator('#chat-view').evaluate(root => {
    const stream = root.querySelector('.chat-stream');
    const bubble = root.querySelector('.message.assistant .bubble');
    return {
      fontSize: parseFloat(getComputedStyle(bubble).fontSize),
      lineHeight: parseFloat(getComputedStyle(bubble).lineHeight),
      streamHeight: stream.getBoundingClientRect().height,
      streamClientWidth: stream.clientWidth,
      scrollWidth: stream.scrollWidth,
      bubbleWidth: bubble.getBoundingClientRect().width
    };
  });
  expect(measure.fontSize).toBe(16);
  expect(measure.lineHeight).toBeGreaterThanOrEqual(30);
  expect(measure.streamHeight).toBeGreaterThan(500);
  expect(measure.streamHeight).toBeLessThanOrEqual(900);
  expect(measure.scrollWidth).toBeLessThanOrEqual(measure.streamClientWidth + 1);
  expect(measure.bubbleWidth).toBeLessThanOrEqual(850);
});

test('phone retains its existing compact text and viewport layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(document.querySelector('link[href="css/chat-desktop-reading.css"]')?.sheet));
  await page.evaluate(() => {
    App.showView('chat');
    document.getElementById('chat-stream').innerHTML = '<div class="message assistant"><div class="bubble">手機閱讀測試</div></div>';
  });
  const font = await page.locator('#chat-view .message.assistant .bubble').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
  expect(font).toBeLessThanOrEqual(16);
  await expect(page.locator('#bao-mobile-tools-tab')).toBeVisible();
});
