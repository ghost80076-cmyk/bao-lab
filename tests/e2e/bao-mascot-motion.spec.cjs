const { test, expect } = require('@playwright/test');

const KEY = 'bao-lab:mascot:v1';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(key => { try { localStorage.removeItem(key); } catch {} }, KEY);
});

test('animated bun opens, responds, and toggles to a clearly labeled static human preview', async ({ page }) => {
  await page.goto('/bao-mascot.html');
  const root = page.locator('#bao-mascot-root');
  const launcher = page.locator('#bao-mascot-launch');
  await expect(launcher).toBeVisible();
  await expect(root.locator('.bao-bun-art').first()).toBeVisible();
  await expect(root.locator('.bao-bun-eyes').first()).toHaveCount(1);
  await launcher.click();
  await expect(page.locator('#bao-mascot-panel')).toBeVisible();
  await page.locator('[data-bao-talk="pat"]').click();
  await expect(page.locator('#bao-mascot-count')).toContainText('4 次');
  const switcher = page.locator('#bao-mascot-transform');
  await switcher.click();
  await expect(root).toHaveClass(/bao-mascot--human/);
  await expect(page.locator('#bao-mascot-form-note')).toContainText('Live2D 尚未製作');
  await expect(switcher).toHaveAttribute('aria-pressed', 'true');
  await switcher.click();
  await expect(root).not.toHaveClass(/bao-mascot--human/);
  await expect(switcher).toHaveAttribute('aria-pressed', 'false');
});

test('motion preference persists locally and follows system reduced-motion setting', async ({ page }) => {
  await page.goto('/bao-mascot.html');
  await page.locator('#bao-mascot-launch').click();
  const motion = page.locator('#bao-mascot-motion');
  await motion.click();
  await expect(page.locator('#bao-mascot-root')).toHaveClass(/bao-mascot--still/);
  await expect(motion).toContainText('開啟動畫');
  await page.reload();
  await expect(page.locator('#bao-mascot-root')).toHaveClass(/bao-mascot--still/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#bao-mascot-launch').click();
  await expect(motion).toBeDisabled();
  await expect(motion).toContainText('系統已關閉動畫');
});

test('mobile mascot stays on screen and hides rather than covering story', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const root = page.locator('#bao-mascot-root');
  await expect(root).toBeVisible();
  await page.locator('#bao-mascot-launch').click();
  await expect(page.locator('#bao-mascot-panel')).toBeVisible();
  const bounds = await page.locator('#bao-mascot-panel').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.evaluate(() => {
    document.getElementById('home-view').classList.remove('active');
    document.getElementById('chat-view').classList.add('active');
  });
  await expect(root).toBeHidden();
  await page.evaluate(() => {
    document.getElementById('chat-view').classList.remove('active');
    document.getElementById('home-view').classList.add('active');
  });
  await expect(root).toBeVisible();
  await expect(page.locator('#bao-mascot-panel')).toBeHidden();
});
