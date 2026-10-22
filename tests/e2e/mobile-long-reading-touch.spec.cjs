const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

async function startLocalPreview(page) {
  await page.goto('/');
  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: '下一步' }).click();
  }
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
  await expect(page.locator('#user-input')).toBeVisible();
  await expect(page.locator('#bao-mobile-composer-tools')).toBeVisible();
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 390, height: 844 }
]) {
  test(`mobile ${viewport.width}px maintains usable toolbar and reader with long copy`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await startLocalPreview(page);

    // Stress only the reader shell: no AI requests, saved-story mutation or authored CSS override.
    await page.evaluate(() => {
      const stream = document.getElementById('chat-stream');
      const template = document.createElement('div');
      template.className = 'message assistant';
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = '故事在巷弄間繼續。對話與敘事依照玩家選擇慢慢前進，時間、事件與角色互動應清晰可讀。'.repeat(8);
      template.append(bubble);
      for (let i = 0; i < 24; i++) stream.append(template.cloneNode(true));
      document.getElementById('chat-view').style.setProperty('--chat-font-size', '24px');
      stream.scrollTop = stream.scrollHeight;
    });

    const input = page.locator('#user-input');
    const draft = '我想仔細觀察接下來的情況，並且保留原本的故事進度。'.repeat(45);
    await input.fill(draft);
    await expect(input).toHaveValue(draft);

    const geometry = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const stream = document.getElementById('chat-stream');
      const text = document.querySelector('#chat-stream .message.assistant .bubble:not(.authored-rich-message)');
      const tools = rect('#bao-mobile-composer-tools');
      const inspire = rect('#bao-mobile-composer-inspire');
      const input = rect('#user-input');
      const send = rect('#chat-view .composer [data-send-message]');
      const composer = rect('#chat-view .composer');
      const reading = rect('#chat-stream');
      return {
        tools, inspire, input, send, composer, reading,
        bodyWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
        screenHeight: innerHeight,
        visualBottom: (window.visualViewport?.offsetTop || 0) + (window.visualViewport?.height || innerHeight),
        visualOffsetTop: window.visualViewport?.offsetTop || 0,
        scrollTop: stream.scrollTop,
        canScroll: stream.scrollHeight > stream.clientHeight,
        readerFontSize: parseFloat(getComputedStyle(text).fontSize)
      };
    });

    for (const [name, target] of Object.entries({tools:geometry.tools, inspire:geometry.inspire, send:geometry.send})) {
      expect(target.width, `${name} tap target at ${viewport.width}px`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${name} tap height at ${viewport.width}px`).toBeGreaterThanOrEqual(44);
    }
    expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.canScroll).toBe(true);
    expect(geometry.reading.height).toBeGreaterThan(130);
    expect(geometry.scrollTop).toBeGreaterThan(0);
    expect(geometry.input.width).toBeGreaterThan(95);
    expect(geometry.input.height).toBeLessThanOrEqual(169);
    // The existing shell retains a small bottom inset (7px in captured 320/360/390px
    // stress screenshots). Keep the controls fully visible, with no excessive gap.
    expect(geometry.composer.bottom,
      'composer must not extend past the visible viewport').toBeLessThanOrEqual(geometry.visualBottom + 2);
    expect(geometry.visualBottom - geometry.composer.bottom,
      'reader must not leave an excessive bottom gap').toBeLessThanOrEqual(12);
    // The existing status/action strip lives between the scrollable story and
    // composer (approximately 55px in these stress screenshots). Preserve it.
    const gap = geometry.composer.top - geometry.reading.bottom;
    expect(gap, 'story and composer must not overlap').toBeGreaterThanOrEqual(-4);
    expect(gap, 'intervening story-status rail must remain compact').toBeLessThanOrEqual(90);
    expect(geometry.send.height, 'send must not stretch to draft textarea height').toBeLessThanOrEqual(56);
    expect(geometry.readerFontSize).toBeGreaterThanOrEqual(20);

    fs.mkdirSync('test-results/mobile-long-reading-touch', { recursive: true });
    await page.screenshot({
      path: `test-results/mobile-long-reading-touch/reading-${viewport.width}.png`,
      animations: 'disabled',
      fullPage: false
    });

    await page.locator('#bao-mobile-composer-tools').click();
    await expect(page.getByRole('dialog', { name: '故事功能選單' })).toBeVisible();
    await expect(input).toHaveValue(draft);
  });
}
