const { test, expect } = require('@playwright/test');

const KEY = 'bao-lab:mascot:v1';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(key => {
    try {
      if (!sessionStorage.getItem('bao-mascot-test-cleared')) {
        localStorage.removeItem(key);
        sessionStorage.setItem('bao-mascot-test-cleared', 'yes');
      }
    } catch {}
  }, KEY);
});

test('native animated mascot opens, responds and switches the introduction in place', async ({ page }) => {
  await page.goto('/bao-mascot.html');
  const root = page.locator('#bao-mascot-root');
  const launcher = page.locator('#bao-mascot-launch');
  await expect(launcher).toBeVisible();
  await expect(root.locator('.bao-character').first()).toBeVisible();
  await expect(page.locator('#bao-page-character')).toHaveAttribute('data-bao-form', 'bun');
  await launcher.click();
  await expect(page.locator('#bao-mascot-panel')).toBeVisible();
  await page.locator('[data-bao-talk="pat"]').click();
  await expect(page.locator('#bao-mascot-count')).toContainText('4 次');
  const switcher = page.locator('#bao-mascot-transform');
  await switcher.click();
  await expect(root).toHaveClass(/bao-mascot--human/);
  await expect(root.locator('.bao-character').first()).toHaveAttribute('data-bao-form', 'human');
  await expect(page.locator('#bao-page-character')).toHaveAttribute('data-bao-form', 'human');
  await expect(page.locator('#bao-mascot-form-note')).toContainText('Live2D 尚未製作');
  await expect(switcher).toHaveAttribute('aria-pressed', 'true');
  await switcher.click();
  await expect(root).not.toHaveClass(/bao-mascot--human/);
  await expect(switcher).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#bao-mascot-close').click();
  await page.locator('[data-bao-page-form=human]').click();
  await expect(root.locator('.bao-character').first()).toHaveAttribute('data-bao-form', 'human');
  await page.reload();
  await expect(page.locator('#bao-page-character')).toHaveAttribute('data-bao-form', 'human');
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
  await expect(page.locator('body')).toHaveClass(/bao-mobile-nav-visible/);
  const launcherBounds = await page.locator('#bao-mascot-launch').boundingBox();
  const navBounds = await page.locator('#bao-mobile-nav').boundingBox();
  expect(launcherBounds.y + launcherBounds.height).toBeLessThanOrEqual(navBounds.y - 8);
  await page.locator('#bao-mascot-launch').click();
  await expect(page.locator('#bao-mascot-panel')).toBeVisible();
  const bounds = await page.locator('#bao-mascot-panel').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(navBounds.y - 8);
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
