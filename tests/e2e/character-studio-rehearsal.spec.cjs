const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test('creator rehearsal reuses preview, Doctor and the exact local work at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./character-studio.html');
    await page.waitForFunction(() => Boolean(
      window.BAOStudioRehearsal && window.BAOCharacterStudio && window.BAOCharacterStudioFlow
    ));

    await page.locator('[name="name"]').fill('雨港試演作品');
    await page.locator('[name="id"]').fill('creator-rehearsal-' + width);
    await page.locator('[name="description"]').fill('驗證作者可從創作室精準前往本機作品。');
    await page.locator('[name="system_prompt"]').fill('角色依照自己的資訊、目標、關係和現場限制採取行動，不替玩家決定言語或選擇；每次改變都必須有故事證據。');
    await page.locator('[name="greeting"]').fill('深夜的雨落在港邊玻璃上。櫃檯後的人放下擦到一半的杯子，抬眼等你先開口。');
    await page.evaluate(() => BAOCharacterStudioFlow.go('finish', true));

    const rehearsal = page.locator('#studio-rehearsal');
    await expect(rehearsal).toBeVisible();
    await expect(rehearsal.locator('[data-rehearsal-card]')).toHaveCount(3);
    await rehearsal.locator('[data-rehearsal-preview]').click();
    await expect(page.locator('#studio-preview')).toBeVisible();
    await expect(page.locator('#studio-preview-greeting')).toContainText('深夜的雨');

    await rehearsal.locator('[data-rehearsal-doctor]').click();
    await expect(page.locator('#bao-doctor-modal')).toBeVisible();
    await expect(page.locator('#bao-doctor-modal')).toContainText('尚未讀取實際故事');
    await page.locator('#bao-doctor-modal [data-close]').click();

    await rehearsal.locator('[data-rehearsal-start]').click();
    await page.waitForURL(new RegExp('index\\.html\\?work=creator-rehearsal-' + width + '&rehearsal=1'));
    const preview = page.locator('#explore-work-preview');
    await expect(preview).toBeVisible({ timeout: 15000 });
    await expect(preview).toContainText('雨港試演作品');
    await expect(preview.locator('[data-explore-rehearsal-back]')).toBeVisible();
    await expect(preview.locator('[data-explore-preview-open]')).toHaveText('進入試演設定');
    await preview.locator('[data-explore-preview-open]').click();
    await expect(page.locator('#detail-view')).toHaveClass(/active/);
    await expect(page.locator('#character-detail h1')).toHaveText('雨港試演作品');
    await expect(page.locator('#detail-rehearsal-back')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });
}
