const { test, expect } = require('@playwright/test');

// Exercise the real player entry so surface-mode and CSS lazy-loading match production.
async function openDemoStory(page, width, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.locator('#home-view button[data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let i = 0; i < 3; i += 1) await page.locator('#next-step').click();
  await page.locator('#bao-demo-mode').check();
  await page.locator('#next-step').click();
  await page.locator('#start-story').click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
  await page.waitForFunction(() => Boolean(
    document.querySelector('link[href^="css/bao-editorial-cinema.css"]')?.sheet &&
    document.querySelector('link[href^="css/chat-experience.css"]')?.sheet
  ));
}

for (const width of [1440, 1920]) {
  test(`desktop Play has an aligned frame and a single story scrollbar at ${width}px`, async ({ page }) => {
    await openDemoStory(page, width);
    const measure = await page.evaluate(() => {
      const header = document.querySelector('.topbar').getBoundingClientRect();
      const main = document.querySelector('#chat-view .chat-main').getBoundingClientRect();
      const story = document.getElementById('chat-stream');
      return {
        headerLeft: header.left, headerWidth: header.width,
        readerLeft: main.left, readerWidth: main.width,
        documentHeight: document.scrollingElement.scrollHeight,
        viewportHeight: innerHeight,
        storyHeight: story.clientHeight,
        storyOverflow: getComputedStyle(story).overflowY,
        footerHidden: getComputedStyle(document.querySelector('.app-shell>footer')).display === 'none',
      };
    });
    expect(Math.abs(measure.headerLeft - measure.readerLeft)).toBeLessThanOrEqual(2);
    expect(Math.abs(measure.headerWidth - measure.readerWidth)).toBeLessThanOrEqual(2);
    expect(measure.readerWidth).toBeGreaterThan(1080);
    expect(measure.readerWidth).toBeLessThanOrEqual(1280);
    expect(measure.documentHeight).toBeLessThanOrEqual(measure.viewportHeight + 2);
    expect(measure.storyHeight).toBeGreaterThan(300);
    expect(measure.storyOverflow).toBe('auto');
    expect(measure.footerHidden).toBe(true);

    // Long conversations stay in the story stream; the outer document does not scroll.
    const stream = page.locator('#chat-stream');
    const inner = await stream.evaluate(node => {
      const extra = document.createElement('div');
      extra.innerHTML = Array.from({ length: 55 }, (_, i) =>
        `<p>閱讀版面檢查 ${i}：保留長篇敘事捲動而不增加外層捲軸。</p>`).join('');
      node.appendChild(extra);
      node.scrollTop = 300;
      return { scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, scrollTop: node.scrollTop };
    });
    expect(inner.scrollHeight).toBeGreaterThan(inner.clientHeight);
    expect(inner.scrollTop).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.scrollingElement.scrollHeight)).toBeLessThanOrEqual(902);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });
}

test('the light and dusk themes carry through the first-party reading chrome', async ({ page }) => {
  await openDemoStory(page, 1440);
  for (const [theme, expected] of [
    ['mist', { page: 'rgb(245, 240, 233)', reader: 'rgb(255, 252, 247)' }],
    ['dusk', { page: 'rgb(48, 44, 60)', reader: 'rgb(52, 47, 66)' }],
  ]) {
    await page.evaluate(value => { document.documentElement.dataset.yoruTheme = value; }, theme);
    const colors = await page.evaluate(() => ({
      page: getComputedStyle(document.body).backgroundColor,
      reader: getComputedStyle(document.getElementById('chat-stream')).backgroundColor,
      heading: getComputedStyle(document.querySelector('#chat-view .chat-title-copy h2')).color,
    }));
    expect(colors.page).toBe(expected.page);
    expect(colors.reader).toBe(expected.reader);
    expect(colors.heading).not.toBe(colors.reader);
  }
});

test('mobile keeps its full-screen reader and visible composer', async ({ page }) => {
  await openDemoStory(page, 390, 844);
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('#user-input')).toBeVisible();
  const state = await page.evaluate(() => ({
    width: document.querySelector('#chat-view').getBoundingClientRect().width,
    client: document.getElementById('chat-stream').clientHeight,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(state.width).toBeGreaterThanOrEqual(380);
  expect(state.client).toBeGreaterThan(120);
  expect(state.pageWidth).toBeLessThanOrEqual(391);
});


test('Play does not create a second expanded status scroller; author status remains accessible', async ({ page }) => {
  await openDemoStory(page, 1440);
  const details = page.locator('#bao-inline-story-status');
  await expect(details).toHaveCount(1);
  await expect(details).toHaveAttribute('data-status-mode', 'native');
  // Native and author state both retain a visible, compact disclosure.
  await expect(details).toBeVisible();
  await expect(details).not.toHaveAttribute('open', '');
  await expect(page.locator('#bao-play-status-toggle')).toBeVisible();

  await page.evaluate(() => {
    BAOSceneHTML.prefs.status = 'author';
    BAOSceneHTML.refresh();
  });
  await expect(details).toHaveAttribute('data-status-mode', 'author');
  await expect(details).toBeVisible();
  await expect(details).not.toHaveAttribute('open', '');
  const collapsed = await details.evaluate(node => ({
    panelHeight: node.getBoundingClientRect().height,
    panelScroll: node.scrollHeight,
  }));
  expect(collapsed.panelHeight).toBeLessThan(65);
  expect(collapsed.panelScroll).toBeLessThan(70);
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('.bao-inline-story-status-body')).toBeVisible();
  // Closing author state returns all room to the story without losing the content.
  await details.locator('summary').click();
  await expect(details).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.scrollingElement.scrollHeight)).toBeLessThanOrEqual(902);
});

test('Play respects light/dusk composer surfaces instead of forcing night colors', async ({ page }) => {
  await openDemoStory(page, 1440);
  for (const theme of ['mist', 'dawn', 'dusk', 'sunset']) {
    await page.evaluate(value => { document.documentElement.dataset.yoruTheme = value; }, theme);
    const measurements = await page.evaluate(() => {
      const value = key => getComputedStyle(document.documentElement).getPropertyValue(key).trim();
      const probe = document.createElement('div');
      probe.style.background = value('--yoru-input');
      document.body.appendChild(probe);
      const expectedInput = getComputedStyle(probe).backgroundColor;
      probe.style.background = value('--yoru-tool');
      const expectedComposer = getComputedStyle(probe).backgroundColor;
      probe.style.color = value('--yoru-story-text');
      const expectedText = getComputedStyle(probe).color;
      probe.remove();
      return {
        expectedInput, expectedComposer, expectedText,
        input: getComputedStyle(document.getElementById('user-input')).backgroundColor,
        inputText: getComputedStyle(document.getElementById('user-input')).color,
        composer: getComputedStyle(document.querySelector('#chat-view .composer')).backgroundColor,
        statusVisible: getComputedStyle(document.querySelector('#bao-inline-story-status')).display !== 'none',
      };
    });
    expect(measurements.input).toBe(measurements.expectedInput);
    expect(measurements.composer).toBe(measurements.expectedComposer);
    expect(measurements.inputText).toBe(measurements.expectedText);
    expect(measurements.statusVisible).toBe(true);
  }
});


test.describe('touch-capable Story / Stage breakpoint polish', () => {
  test.use({ hasTouch:true });

  test('touch-capable Story keeps Stage and message actions discoverable across breakpoints', async ({ page }) => {
    await openDemoStory(page, 821);
    await expect(page.locator('link[href="css/player-shell-v2.css?v=10"]')).toHaveCount(1);
    await page.waitForFunction(() => Boolean(
      document.querySelector('link[href="css/player-shell-v2.css?v=10"]')?.sheet
    ));
    // A first-party toolbar styling probe rather than a fabricated working
    // command. Actual Stage handlers have their own stage-capability E2E suite.
    await page.evaluate(() => {
      const message = document.querySelector('#chat-stream .message.assistant');
      if (!message) throw Error('reader message missing');
      const bar = document.createElement('div');
      bar.className = 'story-message-tools';
      bar.dataset.touchReaderProbe = 'true';
      const action = document.createElement('button');
      action.type = 'button';
      action.textContent = '操作';
      bar.append(action);
      message.append(bar);
    });

    const probes = [820,821,1080,1081,1279,1280,1429,1430];
    const fs = require('node:fs');
    fs.mkdirSync('test-results/touch-stage-reading', { recursive:true });
    for(const width of probes) {
      await page.setViewportSize({ width, height:900 });
      const viewportKind = width <= 820 ? 'mobile' : width <= 1080 ? 'compact' : 'desktop';
      // This is the real Linchenfeng work, not the bare Reader fixture.
      // A work with gameplay_ui can intentionally remain a panel at 1081+.
      // Check that the actual DOM stays aligned with Stage Capability's
      // canonical resolver instead of hard-coding the Reader-only "sheet".
      await expect.poll(() => page.evaluate(() => {
        const root = document.querySelector('#chat-view');
        const resolved = BAOStageCapabilities.resolve();
        return root.dataset.baoStagePresentation === resolved.presentation &&
          root.dataset.baoStageShell === resolved.shell &&
          root.dataset.baoStageRenderer === resolved.renderer ? resolved.viewport : 'out-of-sync';
      })).toBe(viewportKind);
      await expect(page.locator('#user-input')).toBeVisible();
      const measure = await page.evaluate(() => {
        const rect = node => {
          const b = node.getBoundingClientRect();
          return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};
        };
        const activeControls = [...document.querySelectorAll(
          '#chat-view #bao-surface-controls button[data-bao-surface-role]'
        )].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
        const toolbar = document.querySelector('[data-touch-reader-probe]');
        const stream = document.getElementById('chat-stream');
        const header = document.querySelector('#chat-view .chat-topline');
        const avatar = document.querySelector('#chat-view .chat-title-avatar');
        const search = document.getElementById('bao-conversation-search-open');
        return {
          coarse: matchMedia('(pointer:coarse)').matches,
          noHover: matchMedia('(hover:none)').matches,
          buttons:activeControls.map(rect),
          messageOpacity:parseFloat(getComputedStyle(toolbar).opacity),
          action:rect(toolbar.querySelector('button')),
          header:rect(header),
          avatar:rect(avatar),
          search:search ? { width:search.clientWidth, scrollWidth:search.scrollWidth, iconFont:getComputedStyle(search,'::before').fontSize } : null,
          stream:rect(stream),
          scrollWidth:document.documentElement.scrollWidth,
          width:innerWidth
        };
      });
      expect(measure.scrollWidth, `horizontal overflow at ${width}px`)
        .toBeLessThanOrEqual(width + 1);
      expect(measure.stream.height, `reading stream at ${width}px`).toBeGreaterThan(180);
      expect(measure.coarse).toBe(true);
      expect(measure.noHover).toBe(true);
      if(width >= 821 && width <= 1080) {
        expect(measure.avatar.bottom, `avatar must stay within compact header at ${width}px`)
          .toBeLessThanOrEqual(measure.header.bottom + 2);
      }
      if(width >= 821) {
        expect(measure.buttons.length).toBeGreaterThanOrEqual(1);
        for(const button of measure.buttons) {
          expect(button.height, `Stage control at ${width}px`).toBeGreaterThanOrEqual(44);
          expect(button.right).toBeLessThanOrEqual(width + 1);
        }
        expect(measure.messageOpacity, `tool visibility at ${width}px`).toBe(1);
        expect(measure.action.height, `message action at ${width}px`).toBeGreaterThanOrEqual(44);
      } else {
        // The existing mobile shell owns <=820; this PR must not force its
        // desktop controls or reply-tool presentation onto phones.
        await expect(page.locator('.topbar')).toBeHidden();
        await expect(page.locator('#bao-mobile-composer-tools')).toBeVisible();
        expect(measure.search?.scrollWidth, `mobile search label overflow at ${width}px`)
          .toBeLessThanOrEqual((measure.search?.width || 0) + 1);
        expect(parseFloat(measure.search?.iconFont || '0')).toBeGreaterThanOrEqual(20);
      }
      if([820,821,1080,1081].includes(width)) {
        await page.screenshot({
          path:`test-results/touch-stage-reading/story-${width}.png`,
          animations:'disabled'
        });
      }
    }
    // Existing story draft and data stay intact after Stage responsive changes.
    await expect(page.locator('#user-input')).toBeVisible();
  });
});
