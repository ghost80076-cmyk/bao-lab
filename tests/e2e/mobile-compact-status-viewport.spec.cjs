const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

async function openDemoStory(page, size) {
  await page.setViewportSize(size);
  await page.goto('/');
  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let step = 0; step < 3; step++) await page.locator('#next-step').click();
  await page.locator('#bao-demo-mode').check();
  await page.locator('#next-step').click();
  await page.locator('#start-story').click();
  await expect(page.locator('#user-input')).toBeVisible();
  await page.waitForFunction(() =>
    Boolean(window.BAOMobileReadingLayout && document.querySelector('link[href^="css/mobile-reading-layout.css"]')?.sheet)
  );
  await expect(page.locator('#bao-inline-story-status')).toBeVisible();
}

async function createLongStatus(page) {
  await page.evaluate(() => {
    const body = document.querySelector('#bao-inline-story-status .bao-inline-story-status-body');
    for (let i = 0; i < 24; i++) {
      const section = document.createElement('section');
      section.textContent = '世界事件 ' + i + '：' + '時間與角色的狀態應保持連續。'.repeat(3);
      body.append(section);
    }
    const stream = document.getElementById('chat-stream');
    for (let i = 0; i < 25; i++) {
      const message = document.createElement('div');
      message.className = 'message assistant';
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = '夜灣長篇閱讀場景 ' + i + '：玩家仍在同一個世界，文字繼續往下流動。';
      message.append(bubble);
      stream.append(message);
    }
    stream.scrollTop = stream.scrollHeight;
  });
  const status = page.locator('#bao-inline-story-status');
  await status.locator('summary').click();
  await expect(status).toHaveAttribute('open', '');
  await status.evaluate(node => { node.scrollTop = node.scrollHeight; });
  return status;
}
async function inspect(page) {
  return page.evaluate(() => {
    const r = selector => document.querySelector(selector).getBoundingClientRect();
    const status = document.getElementById('bao-inline-story-status');
    const stream = document.getElementById('chat-stream');
    return {
      statusHeight: status.getBoundingClientRect().height,
      statusScrollable: status.scrollHeight > status.clientHeight + 10,
      summary: r('#bao-inline-story-status summary'),
      panel: r('#bao-inline-story-status'),
      streamHeight: stream.getBoundingClientRect().height,
      streamScrollable: stream.scrollHeight > stream.clientHeight,
      composer: r('#chat-view .composer'),
      input: r('#user-input'),
      screenBottom: (visualViewport?.offsetTop || 0) + (visualViewport?.height || innerHeight),
      widthOverflow: document.documentElement.scrollWidth - innerWidth
    };
  });
}

for (const size of [
  {width:320,height:568},
  {width:390,height:844},
  // CSS reflow proxy for 1600x900 at browser zoom 200%; NOT actual browser zoom.
  {width:800,height:450}
]) {
  test(`opened story status stays compact and independently scrollable at ${size.width}x${size.height}`, async ({ page }) => {
    await openDemoStory(page,size);
    const status = await createLongStatus(page);
    const state = await inspect(page);
    expect(state.statusHeight).toBeLessThanOrEqual(Math.min(180, size.height * .28) + 4);
    expect(state.statusScrollable).toBe(true);
    expect(state.summary.top).toBeGreaterThanOrEqual(state.panel.top - 3);
    expect(state.summary.bottom).toBeLessThanOrEqual(state.panel.bottom + 3);
    expect(state.streamHeight).toBeGreaterThan(110);
    expect(state.streamScrollable).toBe(true);
    expect(state.composer.bottom).toBeLessThanOrEqual(size.height+3);
    expect(state.input.width).toBeGreaterThan(80);
    expect(state.widthOverflow).toBeLessThanOrEqual(1);
    fs.mkdirSync('test-results/mobile-compact-status-viewport',{recursive:true});
    await page.screenshot({path:`test-results/mobile-compact-status-viewport/open-${size.width}.png`,animations:'disabled'});
    await status.locator('summary').click();
    await expect(status).not.toHaveAttribute('open','');
    expect((await inspect(page)).streamHeight).toBeGreaterThan(state.streamHeight);
  });
}

test('simulated panned keyboard viewport preserves opened story status, draft, and visible composer', async ({page}) => {
  await openDemoStory(page,{width:390,height:844});
  const status = await createLongStatus(page);
  await page.locator('#user-input').fill('玩家尚未送出的內容，不能因鍵盤或狀態欄而遺失');
  await page.locator('#user-input').focus();
  await page.evaluate(() => {
    Object.defineProperty(window,'visualViewport',{
      configurable:true,
      value:{width:390,height:430,offsetTop:300,offsetLeft:0}
    });
    BAOMobileReadingLayout.sync();
  });
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-keyboard-open','true');
  const state = await inspect(page);
  expect(state.statusHeight).toBeLessThanOrEqual(105);
  expect(state.statusScrollable).toBe(true);
  expect(state.summary.top).toBeGreaterThanOrEqual(state.panel.top - 3);
  expect(state.summary.bottom).toBeLessThanOrEqual(state.panel.bottom + 3);
  expect(state.streamHeight).toBeGreaterThan(95);
  expect(state.composer.bottom).toBeLessThanOrEqual(state.screenBottom + 3);
  expect(state.widthOverflow).toBeLessThanOrEqual(1);
  await expect(page.locator('#user-input')).toHaveValue('玩家尚未送出的內容，不能因鍵盤或狀態欄而遺失');
  fs.mkdirSync('test-results/mobile-compact-status-viewport',{recursive:true});
  await page.screenshot({path:'test-results/mobile-compact-status-viewport/keyboard-simulated.png',animations:'disabled'});
  // Release keyboard and verify the old reading surface returns.
  await page.locator('#user-input').blur();
  await page.evaluate(() => {
    Object.defineProperty(window,'visualViewport',{
      configurable:true,
      value:{width:390,height:844,offsetTop:0,offsetLeft:0}
    });
    BAOMobileReadingLayout.sync();
  });
  await expect(page.locator('#chat-view')).not.toHaveAttribute('data-bao-keyboard-open','true');
  expect((await inspect(page)).statusHeight).toBeGreaterThan(state.statusHeight);
  await expect(status).toHaveAttribute('open','');
});
