const { test, expect } = require('@playwright/test');

async function openDemoStory(page) {
  await page.goto('/');
  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.BAOMobileReadingLayout))).toBe(true);
  await expect(page.locator('#user-input')).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`mobile ${viewport.width}px reading remains usable with compact header controls`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDemoStory(page);
    const composerTools = page.locator('#bao-mobile-composer-tools');
    const exit = page.getByRole('button', { name: '離開故事' });
    const info = page.locator('#bao-play-status-toggle');
    const surfaceTools = page.locator('#bao-surface-mode-toggle');
    await expect(exit).toBeVisible();
    await expect(info).toBeVisible();
    await expect(surfaceTools).toBeHidden();
    await expect(composerTools).toBeVisible();
    await expect(page.locator('#bao-mobile-status')).toHaveCount(0);
    await expect(page.locator('#bao-mobile-memory')).toHaveCount(0);
    await expect(page.locator('#bao-mobile-support')).toHaveCount(0);
    await expect(page.locator('#bao-mobile-tools-tab')).toHaveCount(0);
    await expect(page.locator('#bao-chat-tool-shortcuts')).toBeHidden();
    await expect(page.locator('#bao-chat-api-toolbar')).toBeHidden();
    await page.waitForFunction(() => Boolean(window.BAOStorySurface));
    await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
    await expect(page.locator('#bao-scene-meta')).toBeVisible();
    await expect(page.locator('#bao-play-status-toggle')).toBeVisible();
    const boxes = await page.evaluate(() => {
      const stream = document.getElementById('chat-stream').getBoundingClientRect();
      const composer = document.querySelector('#chat-view .composer').getBoundingClientRect();
      const header = document.querySelector('#chat-view .chat-topline').getBoundingClientRect();
      const title = document.querySelector('#chat-view .chat-title-copy h2').getBoundingClientRect();
      const titleStyle = getComputedStyle(document.querySelector('#chat-view .chat-title-copy h2'));
      return { stream: stream.height, composerTop: composer.top, composerBottom: composer.bottom,
        headerHeight: header.height, titleHeight: title.height, titleWidth: title.width, titleWhiteSpace: titleStyle.whiteSpace,
        pageWidth: document.documentElement.scrollWidth, viewport: innerWidth, screenHeight: innerHeight };
    });
    expect(boxes.stream).toBeGreaterThan(150);
    expect(boxes.composerTop).toBeGreaterThan(0);
    expect(boxes.composerBottom).toBeLessThanOrEqual(boxes.screenHeight + 2);
    expect(boxes.headerHeight).toBeLessThan(90);
    expect(boxes.titleHeight).toBeLessThan(32);
    expect(boxes.titleWidth).toBeGreaterThan(0);
    expect(boxes.titleWhiteSpace).toBe('nowrap');
    expect(boxes.pageWidth).toBeLessThanOrEqual(boxes.viewport + 1);

    await info.click();
    await expect(page.locator('#chat-view')).toHaveClass(/bao-play-status-open/);
    await page.locator('#bao-play-status-close').click();
    await expect(page.locator('#chat-view')).not.toHaveClass(/bao-play-status-open/);

    await composerTools.click();
    const toolDialog = page.getByRole('dialog', { name: '故事功能選單' });
    await expect(toolDialog).toBeVisible();
    await toolDialog.locator('.bao-mobile-more > summary').click();
    const drawerSupport = toolDialog.getByRole('link', { name: /投餵肉包/ });
    await expect(drawerSupport).toBeVisible();
    await expect(drawerSupport.locator('img[src$="assets/bao-bun.svg"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '模型連線／切換' })).toBeVisible();
    await page.getByRole('button', { name: '模型連線／切換' }).click();
    await expect(page.getByRole('heading', { name: '目前故事的模型連線' })).toBeVisible();
    await page.locator('[data-api-close]').click();

    await composerTools.click();
    await page.locator('#bao-chat-tool-drawer .bao-mobile-more > summary').click();
    await page.getByRole('button', { name: '◈ 世界狀態' }).click();
    await expect(page.locator('#bao-reading-status')).toHaveClass(/is-open/);
    await page.locator('.bao-status-close').click();

    await composerTools.click();
    await page.getByRole('button', { name: '人物／事件' }).click();
    await expect(page.locator('#game-ui')).toBeVisible();
    await page.locator('#bao-mobile-panel-close').click();
    await expect(page.locator('#game-ui')).toBeHidden();

    await composerTools.click();
    await page.getByRole('button', { name: '🧠 記憶' }).click();
    await expect(page.locator('#game-ui')).toBeVisible();
    await expect(page.locator('#chat-view .ui-tab[data-panel="memory"]')).toHaveClass(/active/);

    await page.locator('#user-input').fill('手機版閱讀測試');
    await page.locator('#chat-view .composer [data-send-message]').click();
    await expect(page.locator('#chat-stream .message.assistant[data-message-index]').last()).toBeVisible();
    const actions = page.locator('#chat-stream .message.assistant[data-message-index]').last().locator('.story-message-tools');
    await expect(actions.locator('[data-edit]')).toBeVisible();
    await expect(actions.locator('[data-rewrite]')).toBeHidden();
    await expect(actions.locator('[data-copy]')).toBeVisible();
    const moreReply = actions.locator('details.bao-message-more');
    await expect(moreReply).toBeVisible();
    await moreReply.locator('summary').click();
    await expect(actions.locator('[data-rewrite]')).toBeVisible();
    await expect(actions.locator('[data-regenerate]')).toBeVisible();
    await expect(actions.locator('[data-create-branch]')).toHaveCount(1);
    await expect(actions.locator('[data-story-rollback]')).toHaveCount(1);
    const beforeEditScroll = await page.locator('#chat-stream').evaluate(node => node.scrollTop);
    await actions.locator('[data-edit]').click();
    await expect(page.locator('.story-inline-editor textarea')).toBeVisible();
    // Focusing a real textarea can move the mobile visual viewport a little.
    // Guard against the harmful regression (jumping far back / to the top)
    // instead of requiring pixel-identical scroll coordinates.
    await expect.poll(() => page.locator('#chat-stream').evaluate(node => node.scrollTop))
      .toBeGreaterThan(Math.max(0, beforeEditScroll - 420));
    await expect(page.locator('.story-inline-editor textarea')).toHaveCSS('position', 'static');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('desktop defaults to Play and one click reveals the full Studio controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStory(page);
  await page.waitForFunction(() => Boolean(window.BAOStorySurface));
  await expect(page.locator('#bao-mobile-tools-tab')).toHaveCount(0);
  await expect(page.locator('#bao-mobile-exit')).toHaveCount(0);
  await expect(page.locator('#bao-mobile-status')).toHaveCount(0);
  await expect(page.locator('#bao-mobile-memory')).toHaveCount(0);
  await expect(page.locator('#bao-mobile-support')).toHaveCount(0);
  const desktopSupport = page.locator('#bao-chat-floating-actions a[href*="ko-fi.com"]');
  await expect(desktopSupport).toBeVisible();
  await expect(desktopSupport.locator('img[src$="assets/bao-bun.svg"]')).toHaveCount(1);
  await expect(page.locator('#chat-view a[href*="ko-fi.com"]:visible')).toHaveCount(1);
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
  await expect(page.locator('#bao-chat-api-toolbar')).toBeHidden();
  await expect(page.locator('#bao-reading-status-toggle')).toBeHidden();
  await expect(page.locator('#user-input')).toBeVisible();
  await page.locator('#bao-surface-mode-toggle').click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'studio');
  await expect(page.locator('#bao-chat-api-toolbar')).toBeVisible();
  await expect(page.locator('#bao-reading-status-toggle')).toBeVisible();
});

test('mobile exit asks first, then leaves through the existing auto-save flow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemoStory(page);
  const exit = page.getByRole('button', { name: '離開故事' });
  page.once('dialog', dialog => dialog.dismiss());
  await exit.click();
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  page.once('dialog', dialog => dialog.accept());
  await exit.click();
  await expect(page.locator('#detail-view')).toHaveClass(/active/);
  await expect(page.locator('#bao-mobile-nav')).toBeVisible();
  await expect(page.locator('#bao-mobile-exit')).toHaveCount(0);
  await expect(page.locator('#bao-mobile-composer-tools')).toHaveCount(0);
  await expect(page.locator('#bao-chat-tool-drawer')).toHaveCount(0);
  await expect(page.locator('#bao-chat-cost-backdrop')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const chat = document.getElementById('chat-view');
    const detail = document.getElementById('detail-view');
    return {
      inactive: !chat?.classList.contains('active'),
      viewportCleared: !chat?.style.getPropertyValue('--bao-mobile-viewport-height'),
      detailVisible: (detail?.getBoundingClientRect().height || 0) > 100,
      bodyUnlocked: getComputedStyle(document.body).overflowY !== 'hidden'
    };
  })).toEqual({ inactive: true, viewportCleared: true, detailVisible: true, bodyUnlocked: true });
  await expect.poll(() => page.evaluate(() => Boolean(Storage.loadStory()))).toBe(true);
});


for (const theme of ['mist','rose']) {
  test('mobile reading chrome keeps ' + theme + ' palette across composer and tools', async ({page}) => {
    await page.setViewportSize({width:390,height:844});
    await openDemoStory(page);
    await page.waitForFunction(() => !!window.YoruExperience);
    const draft = page.locator('#user-input');
    await draft.fill('這段尚未送出的故事草稿，切換主題後必須保留。');
    const storyBefore = await page.locator('#chat-stream .message.assistant').first().textContent();
    await page.evaluate(selected => window.YoruExperience.choose({theme:selected}),theme);
    // Buttons animate background-color for 160ms. Assert the settled palette
    // rather than sampling the transition's old night-color first frame.
    await expect.poll(() => page.locator('#bao-mobile-composer-tools').evaluate(
      element => getComputedStyle(element).backgroundColor
    ), {timeout:3500}).toBe(theme === 'mist' ? 'rgb(240, 232, 223)' : 'rgb(75, 59, 67)');
    const current = await page.evaluate(() => {
      const bg = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
      const fg = selector => getComputedStyle(document.querySelector(selector)).color;
      return {
        header:bg('#chat-view .chat-topline'),
        composer:bg('#chat-view .composer'),
        textarea:bg('#user-input'),
        tools:bg('#bao-mobile-composer-tools'),
        inspiration:bg('#bao-mobile-composer-inspire'),
        send:bg('#chat-view .composer .primary'),
        text:fg('#user-input'),
        // Some works render an authored rich HTML message, not a plain bubble.
        // Do not force platform theme colors onto author-controlled markup.
        assistant:(() => {
          const plain = document.querySelector('#chat-view .message.assistant .bubble:not(.authored-rich-message)');
          return plain ? getComputedStyle(plain).color : null;
        })(),
        horizontalOverflow:document.documentElement.scrollWidth-innerWidth
      };
    });
    const expected = theme === 'mist'
      ? {tool:'rgb(243, 236, 227)',input:'rgb(255, 253, 248)',control:'rgb(240, 232, 223)',text:'rgb(69, 59, 52)',send:'rgb(157, 115, 88)'}
      : {tool:'rgb(59, 48, 54)',input:'rgb(52, 43, 48)',control:'rgb(75, 59, 67)',text:'rgb(243, 232, 230)',send:'rgb(214, 167, 159)'};
    if (current.tools !== expected.control) {
      const diagnosis = await page.evaluate(() => {
        const el=document.querySelector('#bao-mobile-composer-tools');
        const root=document.documentElement;
        const style=getComputedStyle(el);
        const selectors=[];
        const visit=(rule,href) => {
          if(rule.cssRules){try{[...rule.cssRules].forEach(r=>visit(r,href));}catch(_){};return;}
          if(!rule.selectorText?.includes('bao-mobile-composer-tools'))return;
          let matched=false;try{matched=el.matches(rule.selectorText);}catch(_){}
          selectors.push({href,selector:rule.selectorText.slice(0,300),matched,
            background:rule.style?.getPropertyValue('background'),
            priority:rule.style?.getPropertyPriority('background')});
        };
        for(const sheet of document.styleSheets){
          try{[...sheet.cssRules].forEach(rule=>visit(rule,sheet.href));}catch(_){}
        }
        return {theme:root.dataset.yoruTheme,surface:document.getElementById('chat-view')?.dataset.baoSurface,
          customValue:style.getPropertyValue('--yoru-control').trim(),
          rootValue:getComputedStyle(root).getPropertyValue('--yoru-control').trim(),
          computed:style.backgroundColor,selectors:selectors.slice(-20)};
      });
      console.log('MOBILE_THEME_ACTION_DIAGNOSTIC',JSON.stringify(diagnosis));
    }
    expect(current.header).toBe(expected.tool);
    expect(current.composer).toBe(expected.tool);
    expect(current.textarea).toBe(expected.input);
    expect(current.tools).toBe(expected.control);
    expect(current.inspiration).toBe(expected.control);
    expect(current.send).toBe(expected.send);
    expect(current.text).toBe(expected.text);
    if (current.assistant !== null) expect(current.assistant).toBe(expected.text);
    expect(current.horizontalOverflow).toBeLessThanOrEqual(1);
    await expect(draft).toHaveValue('這段尚未送出的故事草稿，切換主題後必須保留。');
    expect(await page.locator('#chat-stream .message.assistant').first().textContent()).toBe(storyBefore);
    await page.locator('#bao-mobile-composer-tools').click();
    await expect(page.getByRole('dialog',{name:'故事功能選單'})).toBeVisible();
    await expect(page.getByRole('searchbox',{name:'搜尋故事工具'})).toBeVisible();
  });
}


test('mobile reply tools preserve original buttons across easy, pro and desktop views', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await openDemoStory(page);
  await page.waitForFunction(() => !!window.YoruExperience && !!window.BAOMobileReadingLayout);
  await page.evaluate(() => {
    Chat.add('assistant','這段回覆用來檢查手機工具列分組與原始操作。');
    App.renderChatShell(false);
  });
  const message = page.locator('#chat-stream .message.assistant[data-message-index]').last();
  const tools = message.locator('.story-message-tools');
  const more = tools.locator('details.bao-message-more');
  await expect(more).toBeVisible();
  await expect(tools.locator('[data-copy]')).toBeVisible();
  await expect(tools.locator('[data-rewrite]')).toBeHidden();
  expect(await tools.locator('button').count()).toBeGreaterThanOrEqual(5);
  const prior = await message.locator('.bubble').textContent();

  await page.evaluate(() => YoruExperience.choose({level:'pro'}));
  await expect(more).toHaveAttribute('open','');
  await expect(tools.locator('[data-rewrite]')).toBeVisible();
  await page.evaluate(() => YoruExperience.choose({level:'easy'}));
  await expect(more).not.toHaveAttribute('open','');
  await expect(tools.locator('[data-rewrite]')).toBeHidden();

  await page.setViewportSize({width:1280,height:900});
  await expect(tools.locator('details.bao-message-more')).toHaveCount(0);
  await expect(tools.locator('[data-rewrite]')).toBeVisible();
  expect(await message.locator('.bubble').textContent()).toBe(prior);
});
