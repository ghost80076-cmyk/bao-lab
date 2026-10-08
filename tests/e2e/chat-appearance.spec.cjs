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
  test(`${viewport.name}: chat appearance previews, applies and restores bubble styling`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openStory(page);
    await page.locator('[data-bao-open="appearance"]:visible').click();
    const playerModal = page.getByRole('dialog', { name: '聊天外觀' });
    await expect(playerModal).toBeVisible();
    await expect(playerModal.locator('.bao-bubble-preview')).toBeVisible();
    await expect(playerModal.locator('[data-appearance-tab="bubble"]')).toHaveClass(/active/);

    await playerModal.locator('[data-bubble-preset="lamplight"]').click();
    await expect(playerModal.locator('#bao-assistant-color')).toHaveValue('#211b18');
    await expect(playerModal.locator('#bao-user-color')).toHaveValue('#3a2c24');
    await playerModal.locator('[data-bubble-role-tab="user"]').click();
    await expect(playerModal.locator('[data-bubble-role-panel="user"]')).toBeVisible();

    await playerModal.locator('#bao-assistant-color').fill('#123456');
    await playerModal.locator('#bao-assistant-text-color').fill('#abcdef');
    await playerModal.locator('#bao-assistant-opacity').fill('64');
    await playerModal.locator('#bao-user-color').fill('#654321');
    await playerModal.locator('#bao-user-text-color').fill('#fedcba');
    await playerModal.locator('#bao-user-opacity').fill('86');
    await playerModal.locator('#bao-bubble-radius').fill('23');

    await playerModal.locator('[data-appearance-tab="text"]').click();
    await playerModal.locator('#bao-font-size').fill('24');
    await playerModal.locator('#bao-font-family').selectOption('serif');

    await playerModal.locator('[data-appearance-tab="background"]').click();
    if (viewport.name === 'mobile') {
      const help = playerModal.getByRole('button', { name: '設定說明' });
      await expect(help).toBeVisible();
      const backgroundGrid = playerModal.locator('[data-appearance-panel="background"] .bao-choice-grid').first();
      const mobileLayout = await playerModal.evaluate(node => {
        const grid = node.querySelector('[data-appearance-panel="background"] .bao-choice-grid');
        const footer = node.querySelector('.bao-modal-footer');
        return {
          columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length,
          footerPosition: getComputedStyle(footer).position
        };
      });
      expect(mobileLayout).toEqual({ columns: 3, footerPosition: 'sticky' });
      await expect(backgroundGrid).toBeVisible();
    }
    await expect(playerModal.locator('[data-bg-mode="character"]')).toHaveClass(/active/);
    await playerModal.locator('[data-bg-preset="immersive"]').click();
    await expect(playerModal.locator('#bao-bg-opacity')).toHaveValue('50');
    await expect(playerModal.locator('#bao-bg-blur')).toHaveValue('3');
    await playerModal.locator('[data-bg-mode="custom"]').click();
    await playerModal.locator('#bao-custom-bg').fill('https://example.com/test-background.png');
    await playerModal.locator('#bao-bg-opacity').fill('45');
    await playerModal.locator('#bao-bg-blur').fill('5');
    await playerModal.getByRole('button', { name: '儲存外觀' }).click();

    const appearance = await page.locator('#chat-view').evaluate(node => ({
      font: node.style.getPropertyValue('--chat-font-size'),
      fontFamily: node.style.getPropertyValue('--chat-font-family'),
      image: node.style.getPropertyValue('--chat-bg-image'),
      opacity: node.style.getPropertyValue('--chat-bg-opacity'),
      blur: node.style.getPropertyValue('--chat-bg-blur'),
      assistant: node.style.getPropertyValue('--chat-assistant'),
      assistantText: node.style.getPropertyValue('--chat-assistant-text'),
      assistantOpacity: node.style.getPropertyValue('--chat-assistant-opacity'),
      user: node.style.getPropertyValue('--chat-user'),
      userText: node.style.getPropertyValue('--chat-user-text'),
      userOpacity: node.style.getPropertyValue('--chat-user-opacity'),
      radius: node.style.getPropertyValue('--chat-bubble-radius')
    }));
    expect(appearance).toMatchObject({
      font: '24px',
      image: 'url("https://example.com/test-background.png")',
      opacity: '0.45',
      blur: '5px',
      assistant: '#123456',
      assistantText: '#abcdef',
      assistantOpacity: '0.64',
      user: '#654321',
      userText: '#fedcba',
      userOpacity: '0.86',
      radius: '23px'
    });
    expect(appearance.fontFamily).toContain('Georgia');

    const rendered = await page.evaluate(() => {
      Chat.add('user', '測試玩家氣泡');
      App.renderChatShell(false);
      const assistant = document.querySelector('#chat-stream .message.assistant .bubble:not(.authored-rich-message)');
      const user = document.querySelector('#chat-stream .message.user .bubble');
      const platformMessage = document.createElement('div');
      platformMessage.className = 'message assistant';
      platformMessage.innerHTML = '<div class="bubble authored-rich-message"><section class="bao-scene-card"><div>平台場景正文</div></section></div>';
      document.querySelector('#chat-stream').append(platformMessage);
      const platformScene = platformMessage.querySelector('.bao-scene-card');

      const authorMessage = document.createElement('div');
      authorMessage.className = 'message assistant';
      authorMessage.innerHTML = '<div class="bubble authored-rich-message"><p style="font-size:13px">作者固定字級</p></div>';
      document.querySelector('#chat-stream').append(authorMessage);
      const authorText = authorMessage.querySelector('p');

      return {
        assistantBg: getComputedStyle(assistant).backgroundColor,
        assistantText: getComputedStyle(assistant).color,
        assistantFontSize: getComputedStyle(assistant).fontSize,
        userBg: getComputedStyle(user).backgroundColor,
        userText: getComputedStyle(user).color,
        userFontSize: getComputedStyle(user).fontSize,
        platformSceneFontSize: getComputedStyle(platformScene).fontSize,
        authorTextFontSize: getComputedStyle(authorText).fontSize,
        radius: getComputedStyle(user).borderRadius
      };
    });
    expect(rendered.assistantBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(rendered.userBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(rendered.assistantText).toBe('rgb(171, 205, 239)');
    expect(rendered.userText).toBe('rgb(254, 220, 186)');
    expect(rendered.assistantFontSize).toBe('24px');
    expect(rendered.userFontSize).toBe('24px');
    expect(rendered.platformSceneFontSize).toBe('24px');
    expect(rendered.authorTextFontSize).toBe('13px');
    expect(rendered.radius).toBe('23px');

    await page.reload();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bao-lab:player-settings')).appearance);
    expect(saved).toMatchObject({
      fontSize: 24,
      fontFamily: 'serif',
      bgMode: 'custom',
      customBg: 'https://example.com/test-background.png',
      bgOpacity: 45,
      bgBlur: 5,
      bubblePreset: 'custom',
      assistantColor: '#123456',
      assistantTextColor: '#abcdef',
      assistantOpacity: 64,
      userColor: '#654321',
      userTextColor: '#fedcba',
      userOpacity: 86,
      bubbleRadius: 23
    });

    await openStory(page);
    await page.locator('[data-bao-open="appearance"]:visible').click();
    const reopened = page.getByRole('dialog', { name: '聊天外觀' });
    await reopened.locator('[data-appearance-tab="background"]').click();
    await reopened.locator('[data-bg-mode="solid"]').click();
    await reopened.getByRole('button', { name: '儲存外觀' }).click();
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
