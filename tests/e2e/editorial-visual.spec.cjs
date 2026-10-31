const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const capture = async (page, name, fullPage = true) => {
  fs.mkdirSync('test-results/editorial', { recursive: true });
  await page.screenshot({ path: `test-results/editorial/${name}.png`, fullPage, animations: 'disabled' });
};

for (const width of [390, 1280]) {
  test(`editorial home, gallery disclosure and character detail work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.App?.characters?.length &&
      document.querySelector('#home-view .brand-hero') && window.BAOGalleryFocus));
    const stylesheetOrder = await page.locator('link[rel="stylesheet"]').evaluateAll(links =>
      links.map(link => new URL(link.href).pathname));
    for (const path of ['bao-brand-v2.css', 'bao-editorial.css', 'bao-image-quality.css']) {
      expect(stylesheetOrder.filter(href => href.endsWith('/' + path))).toHaveLength(1);
    }
    expect(stylesheetOrder.findIndex(href => href.endsWith('/bao-brand-v2.css')))
      .toBeLessThan(stylesheetOrder.findIndex(href => href.endsWith('/bao-editorial.css')));
    expect(stylesheetOrder.findIndex(href => href.endsWith('/bao-editorial.css')))
      .toBeLessThan(stylesheetOrder.findIndex(href => href.endsWith('/gameplay-ui.css')));
    await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();
    await expect(page.locator('#home-feature-stage .brand-feature-copy small')).toHaveText('今晚推薦');
    await expect(page.locator('#home-explore-title')).toContainText('更多作品');
    await expect(page.locator('#home-local-story')).toBeHidden();
    await expect(page.locator('#home-view #bao-home-portrait')).toBeVisible();
    await expect(page.locator('#home-view #bao-home-portrait .bao-portrait-bun')).toHaveCount(0);
    await expect(page.locator('#bao-mascot-launch')).toBeVisible();
    await expect(page.locator('#bao-mascot-launch .bao-mascot-launch-label')).toBeHidden();
    await expect(page.locator('link[href="css/bao-editorial-polish.css?v=3"]')).toHaveCount(1);
    await expect(page.locator('link[href="css/bao-editorial-cinema.css?v=16"]')).toHaveCount(1);
    await expect.poll(() => page.locator('#home-view .brand-hero h1').evaluate(node => getComputedStyle(node).whiteSpace)).toBe('normal');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    const featureImage = await page.locator('#home-feature-stage > img').boundingBox();
    const featureCaption = await page.locator('#home-feature-stage .brand-feature-copy').boundingBox();
    expect(featureCaption.y).toBeGreaterThanOrEqual(featureImage.y + featureImage.height - 1);
    const homeCard = page.locator('.home-character-card').first();
    const homeImage = await homeCard.locator('img').boundingBox();
    const homeCaption = await homeCard.locator('span').boundingBox();
    expect(homeCaption.y).toBeGreaterThanOrEqual(homeImage.y + homeImage.height - 1);
    await capture(page, `home-${width}`);
    await page.locator('#home-view button[data-view="explore"]').click();
    const card = page.locator('#character-list .character-card').first();
    await expect(card).toBeVisible();
    const more = page.locator('#explore-view .bao-gallery-more');
    await expect(more).toBeVisible();
    await expect(more).not.toHaveAttribute('open', '');
    await expect(page.locator('#explore-view a[href="character-studio.html"]')).toBeHidden();
    await expect(page.locator('#explore-view a[download]')).toHaveCount(2);
    await expect(page.locator('#explore-view a[download]').first()).toBeHidden();
    await expect(page.locator('#import-character-button')).toBeHidden();
    const image = card.locator('.character-image-wrap img');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => getComputedStyle(node).aspectRatio)).toBe(width <= 820 ? '3 / 4' : '4 / 5');
    await expect(card.locator('.character-content > .tags')).toBeHidden();
    const imageBox = await image.boundingBox();
    const coverBox = await card.locator('.character-image-wrap').boundingBox();
    const captionBox = await card.locator('.character-content').boundingBox();
    expect(captionBox.y).toBeGreaterThanOrEqual(coverBox.y + coverBox.height - 1);

    expect(imageBox.height / imageBox.width).toBeGreaterThan(width <= 820 ? 1.3 : 1.2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await capture(page, `characters-${width}`);
    await more.locator('summary').click();
    await expect(page.locator('#explore-view a[href="character-studio.html"]')).toBeVisible();
    await expect(page.locator('#explore-view a[download]').first()).toBeVisible();
    await expect(page.locator('#import-character-button')).toBeVisible();
    await page.locator('#manage-character-button').click();
    await expect(page.locator('#custom-character-list')).toContainText('目前沒有本機匯入角色');
    await more.locator('summary').click();
    await card.click();
    const preview = page.locator('#explore-work-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.explore-work-preview-tags .tag').first()).toBeVisible();
    await preview.getByRole('button', { name: '查看作品', exact: true }).click();
    await expect(page.locator('#detail-view .detail-theme-shell')).toBeVisible();
    await expect(page.locator('#detail-start')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    if (width <= 700) {
      const visual = await page.locator('#detail-view .detail-visual').boundingBox();
      const copy = await page.locator('#detail-view .detail-copy').boundingBox();
      expect(copy.y).toBeGreaterThanOrEqual(visual.y + visual.height - 1);
    }
    await capture(page, `character-detail-${width}`);
  });

  test(`bookshelf covers and the existing continue action work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.locator('#home-view button[data-view="explore"]').click();
    await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
    await page.getByRole('button', { name: '查看作品', exact: true }).click();
    await page.getByRole('button', { name: '開始故事' }).click();
    await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
    await page.evaluate(() => {
      const input = document.querySelector('input[name="display-mode"][value="ui"]');
      if (!input) throw new Error('display-mode UI option missing');
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    for (let i = 0; i < 3; i += 1) await page.locator('#next-step').click();
    await page.locator('#bao-demo-mode').check();
    await page.locator('#next-step').click();
    await page.locator('#start-story').click();
    await expect(page.locator('#user-input')).toBeVisible();
    await page.evaluate(async () => { App.saveStory(false); await BAOStoryLibrary.flush(); });
    await page.evaluate(() => BAOStoryTools.openLibrary());
    const shelf = page.locator('.story-library-story.bao-shelf-enhanced');
    await expect(shelf).toBeVisible();
    await expect(shelf.locator('.bao-shelf-cover')).toBeVisible();
    await expect(shelf.locator('.story-library-chapter')).toHaveCount(1);
    await expect.poll(() => shelf.evaluate(node => getComputedStyle(node).borderTopWidth)).toBe('0px');
    await expect(shelf.getByRole('button', { name: '繼續閱讀 →' })).toBeVisible();
    await expect(shelf.locator('.bao-shelf-progress')).toContainText('上次閱讀');
    await capture(page, `bookshelf-${width}`);
    await shelf.getByRole('button', { name: '繼續閱讀 →' }).click();
    await expect(page.locator('#chat-view')).toHaveClass(/active/);
    await expect(page.locator('#user-input')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.BAOStorySurface));
    await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
    await expect(page.locator('#chat-view .chat-topline')).toBeVisible();
    // Header deduplication leaves enough room for confirmed scene context
    // beside the story title on both mobile and desktop.
    await expect(page.locator('#bao-scene-meta')).toBeVisible();
    if (width <= 820) {
      await expect(page.locator('#bao-surface-mode-toggle')).toBeHidden();
      await expect(page.locator('#bao-mobile-composer-tools')).toBeVisible();
    } else {
      await expect(page.locator('#bao-surface-mode-toggle')).toBeVisible();
    }
    await expect(page.locator('#bao-play-status-toggle')).toBeVisible();
    await expect(page.locator('#bao-immersive-toggle')).toHaveCount(0);
    await expect(page.locator('#chat-view .usage-bar')).toBeHidden();
    await expect.poll(() => page.locator('#chat-view .message.assistant .bubble').first()
      .evaluate(node => getComputedStyle(node).borderLeftWidth)).toBe('0px');
    const opening = page.locator('#chat-view .bao-structured-opening');
    await expect(opening).toBeVisible();
    await expect(opening.locator('.bao-opening-choice')).toHaveCount(4);
    expect(await opening.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe('rgb(255, 255, 255)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await capture(page, `chat-play-${width}`);

    await page.locator('#bao-play-status-toggle').click();
    const nativeArchive = await page.evaluate(() => Boolean(App.activeCharacter?.gameplay_ui?.panels?.length));
    if (width >= 1081 && !nativeArchive) {
      const reader = page.getByRole('dialog', { name: '故事資訊' });
      await expect(reader).toBeVisible();
      await expect(page.locator('#game-ui')).toBeHidden();
      // Fixed status sheets are captured in the real viewport; full-page capture
      // temporarily resizes the page and can close responsive overlays.
      await capture(page, `chat-status-${width}`, false);
      // Reader Context close behavior is covered in its focused E2E. The
      // subsequent Play -> Studio transition is the integration contract here.

    } else {
      await expect(page.locator('#game-ui')).toBeVisible();
      if (nativeArchive) {
        await page.locator('#game-ui .gameplay-ui-tab').first().click();
        await expect(page.locator('#ui-panel .gameplay-tabbed-archive')).toBeVisible();
      }
      await page.locator('.ui-tab[data-panel="status"]').click();
      await expect(page.locator('#ui-panel .state-grid')).toBeVisible();
      // Fixed status sheets are captured in the real viewport; full-page capture
      // temporarily resizes the page and can close responsive overlays.
      await capture(page, `chat-status-${width}`, false);
      if (width <= 820) await page.locator('#bao-mobile-panel-close').click();
      else await page.locator('#bao-play-status-close').click();
      await expect(page.locator('#game-ui')).toBeHidden();
    }

    if (width > 820) {
      await page.locator('#bao-surface-mode-toggle').click();
      await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'studio');
      if (width >= 1081) await expect(page.locator('#bao-reader-context')).toHaveCount(0);
      const drawer = page.getByRole('dialog', { name: '故事總覽' });
      await expect(drawer).toBeVisible();
      await expect(drawer.locator('header h2')).toHaveText('控制中心');
      await expect(page.locator('#user-input')).toHaveAttribute('placeholder', '寫下你的下一句…');
      await capture(page, `chat-studio-${width}`, false);
      await drawer.getByRole('button', { name: /關閉/ }).click();
      await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
    }
  });
}


test('nightly recommendation stays stable for the same local day', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.App?.characters?.length && document.querySelector('#home-feature-name')?.textContent?.trim()));
  const first = await page.locator('#home-feature-name').textContent();
  await page.reload();
  await page.waitForFunction(() => Boolean(window.App?.characters?.length && document.querySelector('#home-feature-name')?.textContent?.trim()));
  await expect(page.locator('#home-feature-name')).toHaveText(first.trim());
  const visibleMore = await page.locator('#home-character-preview [data-home-character]').count();
  expect(visibleMore).toBeGreaterThan(0);
  const ids = await page.locator('#home-character-preview [data-home-character]').evaluateAll(nodes => nodes.map(node => node.dataset.homeCharacter));
  const featuredId = await page.locator('#home-feature-stage').getAttribute('data-home-character');
  expect(featuredId).toBeTruthy();
  expect(ids).not.toContain(featuredId);
});

for (const viewport of [
  { width:320, height:568 },
  { width:390, height:844 },
  { width:1280, height:900 }
]) {
  test(`home resume and detail first-action hierarchy at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.App?.characters?.length && window.BAOGalleryFocus));
    await page.waitForFunction(() => [...document.styleSheets].some(sheet =>
      sheet.href?.includes('bao-editorial-cinema.css?v=16')));
    const home = page.locator('#home-view .brand-cinematic-hero');
    const explore = home.locator('.brand-actions > .primary');
    const resume = home.locator('#home-continue');
    await expect(explore).toBeVisible();
    await expect(resume).toBeHidden();
    // Simulate the display state only. The real resume click handler and
    // persisted story bookkeeping remain untouched by these CSS changes.
    await resume.evaluate(node => node.classList.remove('hidden'));
    await expect(resume).toBeVisible();
    expect(await resume.evaluate(node => getComputedStyle(node).order)).toBe('-1');
    const activeBackground = await resume.evaluate(node => getComputedStyle(node).backgroundImage);
    expect(activeBackground).toContain('gradient');
    const resumeRect = await resume.boundingBox();
    const exploreRect = await explore.boundingBox();
    if (viewport.width <= 700) {
      expect(resumeRect.y).toBeLessThan(exploreRect.y);
      expect(resumeRect.height).toBeGreaterThanOrEqual(44);
    } else {
      expect(resumeRect.y).toBeLessThanOrEqual(exploreRect.y + 1);
    }
    await resume.evaluate(node => node.classList.add('hidden'));
    await explore.click();
    await expect(page.locator('#explore-view')).toHaveClass(/active/);
    const work = await page.evaluate(() =>
      App.characters.find(character => character.id === 'linchenfeng') || App.characters[0]);
    await page.evaluate(id => App.openCharacter(id), work.id);
    await expect(page.locator('#detail-view')).toHaveClass(/active/);
    const cover = page.locator('#detail-view .detail-visual');
    const title = page.locator('#detail-view .detail-copy h1');
    const start = page.locator('#detail-start');
    const description = page.locator('#detail-view .detail-description');
    await expect(cover).toBeVisible();
    await expect(title).toBeVisible();
    await expect(start).toBeVisible();
    const coverRect = await cover.boundingBox();
    const titleRect = await title.boundingBox();
    const startRect = await start.boundingBox();
    const descriptionRect = await description.boundingBox();
    if (viewport.width <= 700) {
      expect(coverRect.height).toBeLessThanOrEqual(261);
      expect(titleRect.y).toBeGreaterThanOrEqual(coverRect.y + coverRect.height - 1);
      expect(startRect.y).toBeGreaterThanOrEqual(titleRect.y + titleRect.height - 1);
      expect(startRect.y + startRect.height).toBeLessThan(descriptionRect.y + 1);
      if (viewport.width === 390) expect(startRect.y).toBeLessThan(viewport.height - 48);
      const back = await page.locator('#detail-back').boundingBox();
      expect(back.height).toBeGreaterThanOrEqual(44);
    } else {
      expect(await start.evaluate(node => getComputedStyle(node).order)).toBe('0');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(viewport.width + 1);
    await capture(page, `home-detail-entry-${viewport.width}`, false);
    await start.click();
    await expect(page.locator('#builder-view')).toHaveClass(/active/);
  });
}
