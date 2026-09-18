const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

for (const width of [390, 1440]) {
  test(`inspiration copy survives a replaced busy toolbar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('./');
    await page.waitForFunction(() => window.BAOInspirationCopy && window.BAOStoryReader && document.getElementById('chat-stream'));
    await page.evaluate(() => {
      // Reproduce generateInspirations: the old busy toolbar was detached by
      // decorateStream, leaving its .message with pointer-events:none.
      const stream = document.getElementById('chat-stream');
      const message = document.createElement('div');
      message.className = 'message assistant story-busy';
      message.innerHTML = '<div class="bubble">測試情境</div>';
      stream.append(message);
      const panel = document.createElement('div');
      panel.className = 'story-inspiration-panel';
      panel.innerHTML = '<div class="story-inspiration-head">✦ 行動靈感</div>' +
        ['保持在陰影中觀察', '從側門走出', '向對方詢問', '繼續巡邏'].map((text, i) =>
          `<div class="story-inspiration-row"><button type="button" class="story-inspiration-chip">${i + 1}. ${text}</button><button type="button" class="story-copy-chip" title="複製">⧉</button></div>`).join('');
      message.append(panel);
      document.execCommand = () => false;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async text => { window.__inspirationCopied = text; }
      }});
      window.__inspirationCopied = null;
      document.getElementById('user-input').value = '';
    });
    const message = page.locator('#chat-stream > .message').last();
    await expect(message).not.toHaveClass(/story-busy/);
    const buttons = message.locator('.story-inspiration-row > .story-copy-chip');
    await expect(buttons).toHaveCount(4);
    for (const [index, expected] of ['保持在陰影中觀察', '從側門走出', '向對方詢問', '繼續巡邏'].entries()) {
      await buttons.nth(index).click();
      await expect.poll(() => page.evaluate(() => window.__inspirationCopied)).toBe(expected);
      await expect(buttons.nth(index)).toHaveText('✓');
    }
    await expect(page.locator('#user-input')).toHaveValue('');
    // Permission-denied browsers must offer actual selectable text, not a fake ✓.
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('blocked'); }; });
    await buttons.first().click();
    await expect(message.locator('.story-copy-manual textarea')).toHaveValue('保持在陰影中觀察');
    await expect(buttons.first()).toHaveText('!');
  });
}
