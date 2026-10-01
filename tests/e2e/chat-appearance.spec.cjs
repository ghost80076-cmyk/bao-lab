const { test, expect } = require('@playwright/test');

async function openStory(page) {
  await page.goto('/');
  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect(page.locator('#user-input')).toBeVisible();
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: chat appearance can be opened, changed, saved and restored`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openStory(page);
    await page.locator('[data-bao-open="appearance"]:visible').click();
    await expect(page.getByRole('heading', { name: '聊天外觀' })).toBeVisible();
    const playerModal = page.getByRole('dialog', { name: '聊天外觀' });
    await expect(playerModal).toBeVisible();
    if (viewport.name === 'mobile') {
      const help = playerModal.getByRole('button', { name: '設定說明' });
      const backgroundCopy = playerModal.locator('.bao-setting-section').nth(1).locator(':scope > p');
      await expect(help).toBeVisible();
      await expect(backgroundCopy).toBeHidden();
      const mobileLayout = await playerModal.evaluate(node => {
        const grid = node.querySelector('.bao-choice-grid');
        const footer = node.querySelector('.bao-modal-footer');
        return {
          columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length,
          footerPosition: getComputedStyle(footer).position
        };
      });
      expect(mobileLayout).toEqual({ columns: 3, footerPosition: 'sticky' });
      await help.click();
      await expect(backgroundCopy).toBeVisible();
      await help.click();
      await expect(backgroundCopy).toBeHidden();
    }
    await expect(page.locator('[data-bg-mode="character"]')).toHaveClass(/active/);
    await expect(page.locator('#bao-bg-opacity')).toHaveValue('34');
    await expect(page.locator('#bao-bg-blur')).toHaveValue('6');
    await page.locator('[data-bg-preset="immersive"]').click();
    await expect(page.locator('#bao-bg-opacity')).toHaveValue('50');
    await expect(page.locator('#bao-bg-blur')).toHaveValue('3');
    await page.locator('[data-bg-preset="soft"]').click();
    await expect(page.locator('#bao-bg-opacity')).toHaveValue('34');
    await expect(page.locator('#bao-bg-blur')).toHaveValue('6');
    await page.locator('#bao-font-size').fill('20');
    await page.locator('[data-bg-mode="custom"]').click();
    await page.locator('#bao-custom-bg').fill('https://example.com/test-background.png');
    await page.locator('#bao-bg-opacity').fill('45');
    await page.locator('#bao-bg-blur').fill('5');
    await page.locator('#bao-assistant-color').fill('#123456');
    await page.locator('#bao-user-color').fill('#654321');
    await page.locator('#bao-bubble-opacity').fill('70');
    await page.locator('.bao-modal-save').click();
    const appearance = await page.locator('#chat-view').evaluate(node => ({
      font: node.style.getPropertyValue('--chat-font-size'),
      image: node.style.getPropertyValue('--chat-bg-image'),
      opacity: node.style.getPropertyValue('--chat-bg-opacity'),
      blur: node.style.getPropertyValue('--chat-bg-blur'),
      assistant: node.style.getPropertyValue('--chat-assistant'),
      user: node.style.getPropertyValue('--chat-user'),
      bubble: node.style.getPropertyValue('--chat-bubble-opacity')
    }));
    expect(appearance).toEqual({ font: '20px', image: 'url("https://example.com/test-background.png")', opacity: '0.45', blur: '5px', assistant: '#123456', user: '#654321', bubble: '0.7' });
    await page.reload();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bao-lab:player-settings')).appearance);
    expect(saved).toMatchObject({ fontSize: 20, bgMode: 'custom', customBg: 'https://example.com/test-background.png', bgOpacity: 45, bgBlur: 5, assistantColor: '#123456', userColor: '#654321', bubbleOpacity: 70 });
    await openStory(page);
    await page.locator('[data-bao-open="appearance"]:visible').click();
    await page.locator('[data-bg-mode="character"]').click();
    await page.locator('.bao-modal-save').click();
    const characterImage = await page.locator('#chat-view').evaluate(node => node.style.getPropertyValue('--chat-bg-image'));
    expect(characterImage).toContain('url(');
    expect(characterImage).not.toContain('example.com/test-background.png');
    await page.locator('[data-bao-open="appearance"]:visible').click();
    await page.locator('[data-bg-mode="solid"]').click();
    await page.locator('.bao-modal-save').click();
    await expect(page.locator('#chat-view')).toHaveCSS('--chat-bg-image', 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}


test('mobile: reply settings keeps choices ahead of explanatory copy', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page);
  await page.locator('[data-bao-open="reply"]:visible').click();

  const modal = page.getByRole('dialog', { name: '回覆設定' });
  await expect(modal).toBeVisible();
  const help = modal.getByRole('button', { name: '設定說明' });
  await expect(help).toBeVisible();
  await expect(modal.locator('.bao-setting-section').first().locator(':scope > p')).toBeHidden();

  const layout = await modal.evaluate(node => {
    const grids = [...node.querySelectorAll('.bao-choice-grid')];
    return {
      firstColumns: getComputedStyle(grids[0]).gridTemplateColumns.trim().split(/\s+/).length,
      secondColumns: getComputedStyle(grids[1]).gridTemplateColumns.trim().split(/\s+/).length,
      bodyPadding: getComputedStyle(node.querySelector('.bao-modal-body')).paddingTop
    };
  });
  expect(layout.firstColumns).toBe(3);
  expect(layout.secondColumns).toBe(2);
  expect(parseFloat(layout.bodyPadding)).toBeLessThanOrEqual(12);

  await help.click();
  await expect(modal.locator('.bao-setting-section').first().locator(':scope > p')).toBeVisible();
  await modal.locator('[data-setting="replyLength"][data-value="short"]').click();
  await modal.locator('.bao-modal-save').click();
  expect((await page.evaluate(() => BAOPlayerSettings.get())).replyLength).toBe('short');
});
