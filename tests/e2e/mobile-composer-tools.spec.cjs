const { test, expect } = require('@playwright/test');

test('mobile composer keeps tools, input, AI assist and send in one row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.BAOMobileReadingLayout && window.BAOStoryReader && App.characters?.length));

  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], greeting: '夜灣仍亮著一盞燈。' };
    App.config = {
      persona: { name: '玩家', identity: '旅人', relationship: '舊識' },
      narrativeMode: 'immersive',
      displayMode: 'text',
      api: { model: 'mock-composer-model', baseUrl: 'https://example.invalid', key: 'EPHEMERAL_TEST_KEY' },
      memory: { maxRounds: 20, maxContext: 64000, mode: 'smart', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    Chat.add('user', '我推開港口邊的小店。');
    Chat.add('assistant', '店裡只剩下最後一桌燈光。');
    App.renderChatShell(false);
    App.showView('chat');
    window.BAOMobileReadingLayout.sync();

    API.send = async config => {
      if (config?.__memoryTask) {
        return { text: '["先觀察店內的人","主動詢問昨晚的消息","走到窗邊確認港口動靜","先坐下整理手上的線索"]' };
      }
      return { text: '測試回覆' };
    };
  });

  const plus = page.locator('#bao-mobile-composer-tools');
  const inspire = page.getByRole('button', { name: '行動靈感' });
  const input = page.locator('#user-input');
  const send = page.getByRole('button', { name: '送出訊息' });

  await expect(plus).toBeVisible();
  await expect(inspire).toBeVisible();
  await expect(inspire).toBeEnabled();
  await expect(input).toBeVisible();
  await expect(send).toBeVisible();
  await expect(page.locator('#bao-surface-mode-toggle')).toBeHidden();
  const messageInspire = page.locator('.story-message-tools [data-inspire]');
  await expect(messageInspire.first()).toBeHidden();

  const geometry = await page.evaluate(() => {
    const composer = document.querySelector('#chat-view .composer').getBoundingClientRect();
    const nodes = [
      document.getElementById('bao-mobile-composer-tools'),
      document.getElementById('user-input'),
      document.getElementById('bao-mobile-composer-inspire'),
      document.querySelector('#chat-view .composer [data-send-message]')
    ].map(node => node.getBoundingClientRect());
    return {
      composer: { left: composer.left, right: composer.right, top: composer.top, bottom: composer.bottom },
      nodes: nodes.map(box => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom })),
      viewport: innerWidth
    };
  });
  expect(geometry.nodes[0].left).toBeLessThan(geometry.nodes[1].left);
  expect(geometry.nodes[1].left).toBeLessThan(geometry.nodes[2].left);
  expect(geometry.nodes[2].left).toBeLessThan(geometry.nodes[3].left);
  for (const box of geometry.nodes) {
    expect(box.left).toBeGreaterThanOrEqual(geometry.composer.left - 1);
    expect(box.right).toBeLessThanOrEqual(geometry.composer.right + 1);
  }
  expect(geometry.composer.right).toBeLessThanOrEqual(geometry.viewport + 1);

  const initialHeight = await input.evaluate(node => node.getBoundingClientRect().height);
  await input.fill('第一行\n第二行\n第三行\n第四行\n第五行\n第六行');
  await expect.poll(() => input.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(initialHeight + 20);
  await expect(input).toHaveAttribute('data-bao-composer-expanded', 'true');

  await input.fill(Array.from({ length: 18 }, (_, index) => '長文第' + (index + 1) + '行').join('\n'));
  const capped = await input.evaluate(node => ({
    height: node.getBoundingClientRect().height,
    overflowY: getComputedStyle(node).overflowY
  }));
  expect(capped.height).toBeLessThanOrEqual(170);
  expect(capped.overflowY).toBe('auto');

  await input.fill('');
  await expect.poll(() => input.evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(initialHeight + 2);
  await expect(input).toHaveAttribute('data-bao-composer-expanded', 'false');

  await plus.click();
  const drawer = page.getByRole('dialog', { name: '故事功能選單' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: '☷ 故事控制台' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: '◔ 上下文狀態' })).toBeVisible();
  await drawer.getByRole('button', { name: '關閉 ×', exact: true }).click();

  await inspire.click();
  const inspiration = page.locator('.story-inspiration-panel');
  await expect(inspiration).toBeVisible();
  await expect(inspiration.locator('.story-inspiration-row')).toHaveCount(4);
  await inspiration.locator('.story-inspiration-chip').first().click();
  await expect(input).toHaveValue('先觀察店內的人');
});

test('mobile AI assist explains why it is unavailable in local preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.BAOMobileReadingLayout && window.BAOStoryReader && App.characters?.length));
  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], greeting: '本機預覽。' };
    App.config = {
      persona: { name: '玩家' },
      narrativeMode: 'immersive',
      displayMode: 'text',
      demoMode: true,
      api: { model: 'local-preview', baseUrl: '', key: '' },
      memory: { maxRounds: 20, maxContext: 64000, mode: 'smart', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    App.renderChatShell(false);
    App.showView('chat');
    window.BAOMobileReadingLayout.sync();
  });

  const inspire = page.getByRole('button', { name: '行動靈感' });
  await expect(inspire).toBeVisible();
  await expect(inspire).toBeDisabled();
  await expect(inspire).toHaveAttribute('title', /完成模型連線後即可使用/);
});
