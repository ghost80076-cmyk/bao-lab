const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const themes = ['mist', 'dawn', 'dusk', 'sunset'];
const allThemes = ['night', ...themes];
const visualWidth = [
  { label: 'phone', width: 390, height: 844 },
  { label: 'desktop', width: 1280, height: 900 }
];
function contrast(a, b) {
  const luminance = value => {
    let hex = value.trim().replace(/^#/, '');
    if (hex.length === 3) hex = [...hex].map(x => x + x).join('');
    if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error('Not an opaque RGB token: ' + value);
    return [0, 2, 4].map(n => parseInt(hex.slice(n, n + 2), 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((total, v, i) => total + v * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('four optional themes keep muted copy and control colors legible on their intended semantic surfaces', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    window.YoruExperience?.choose &&
    document.querySelector('link[href^="css/experience-preferences.css"]')?.sheet
  ));
  const pairs = [
    ['--yoru-night', '--yoru-muted', 'page hint'],
    ['--yoru-tool', '--yoru-muted', 'tool hint'],
    ['--yoru-card', '--yoru-muted', 'card hint'],
    ['--yoru-reading', '--yoru-story-muted', 'reader hint'],
    ['--yoru-control', '--yoru-purple', 'control accent'],
    ['--yoru-control', '--yoru-lantern', 'lantern accent']
  ];
  for (const theme of themes) {
    await page.evaluate(value => YoruExperience.choose({ theme: value }), theme);
    const values = await page.evaluate(keys => {
      const computed = getComputedStyle(document.documentElement);
      return Object.fromEntries(keys.map(key => [key, computed.getPropertyValue(key).trim()]));
    }, [...new Set(pairs.flatMap(pair => pair.slice(0, 2)))]);
    for (const [background, foreground, label] of pairs) {
      const value = contrast(values[background], values[foreground]);
      expect(value, `${theme} ${label}: ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

for (const viewport of visualWidth) {
  test(`theme matrix captures home and reader at ${viewport.width}px without document overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(
      window.App?.characters?.length && window.YoruExperience?.choose &&
      document.querySelector('link[href^="css/experience-preferences.css"]')?.sheet
    ));
    fs.mkdirSync('test-results/theme-design-audit', { recursive: true });
    for (const theme of allThemes) {
      await page.evaluate(value => {
        YoruExperience.choose({ theme: value });
        App.showView('home');
      }, theme);
      await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();
      let overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, `${theme} home at ${viewport.width}`).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: `test-results/theme-design-audit/home-${viewport.label}-${theme}.png`,
        animations: 'disabled',
        fullPage: false
      });

      await page.evaluate(() => {
        App.showView('chat');
        document.getElementById('chat-stream').innerHTML =
          '<div class="message assistant"><div class="bubble">夜色裡，故事依然可以安靜地繼續。<p>這是一段用來檢查主題閱讀舒適度的文字。</p></div></div>' +
          '<div class="message user"><div class="bubble">我想繼續這段旅程。</div></div>';
      });
      await expect(page.locator('#chat-view .chat-stream .message.assistant')).toBeVisible();
      overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, `${theme} reader at ${viewport.width}`).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: `test-results/theme-design-audit/reader-${viewport.label}-${theme}.png`,
        animations: 'disabled',
        fullPage: false
      });
    }
  });
}
