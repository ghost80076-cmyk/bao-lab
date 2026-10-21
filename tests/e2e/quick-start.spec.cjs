const { test, expect } = require('@playwright/test');

const openBuilder = async (page, predicate = 'c.id !== "autonomous-npc-world"') => {
  await page.goto('./');
  await page.waitForFunction(() => window.BAOQuickSetup && window.BAOStoryStartReadiness && App.characters.length && window.Storage && window.GameState);
  await page.evaluate(async condition => {
    const character = App.characters.find(c => condition === 'world' ? c.id === 'autonomous-npc-world' : c.id !== 'autonomous-npc-world');
    if (!character) throw new Error('Missing a suitable test character');
    await App.openCharacter(character.id);
    App.openBuilder();
  }, predicate === 'world' ? 'world' : 'ordinary');
  await expect(page.locator('#bao-setup-choice')).toBeVisible();
};

for (const width of [390, 1440]) {
  test(`quick start validates Key and starts a story at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openBuilder(page);
    await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-setup', 'quick');
    await expect(page.locator('#bao-setup-choice .bao-first-run-progress')).toBeVisible();
    await expect(page.locator('#bao-setup-choice .bao-first-run-progress li')).toHaveCount(3);
    await expect(page.locator('#bao-setup-choice .bao-first-run-progress')).toContainText('作品已選好');
    await expect(page.locator('#bao-setup-choice .bao-first-run-progress')).toContainText('模型連線');
    await expect(page.locator('#bao-setup-choice .bao-first-run-progress')).toContainText('開始故事');
    await expect(page.locator('#bao-setup-story-name')).not.toHaveText('目前作品');
    await expect(page.locator('#bao-setup-choice [data-bao-setup="quick"]')).toHaveText('快速開始（推薦）');
    await expect(page.locator('[data-step-panel="4"]')).toBeVisible();
    await expect(page.locator('.builder-step[data-step-panel="5"]')).toBeHidden();
    await expect(page.locator('#start-story')).toBeVisible();
    await expect(page.locator('#model-id').locator('..')).toBeHidden();
    await expect(page.locator('#bao-quick-technical-toggle')).toBeVisible();
    await page.locator('#bao-quick-technical-toggle').click();
    await expect(page.locator('#model-id')).toBeVisible();
    await page.locator('#bao-quick-technical-toggle').click();
    await expect(page.locator('#model-id')).toBeHidden();

    const dialogs = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    await page.locator('#start-story').click();
    expect(dialogs.some(message => message.includes('模型連線設定'))).toBe(true);
    await expect(page.locator('#builder-view')).toHaveClass(/active/);
    await expect(page.locator('[data-step-panel="4"]')).toBeVisible();
    await page.locator('#api-key').fill('quick-start-e2e-secret');
    await page.locator('#start-story').click();
    await expect(page.locator('#chat-view')).toHaveClass(/active/);
    expect(await page.evaluate(() => App.config.memory.maxRounds)).toBeGreaterThan(0);
    expect(await page.evaluate(() => JSON.stringify(Storage.buildStoryPayload('test')))).not.toContain('quick-start-e2e-secret');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test(`quick and advanced settings remain reversible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openBuilder(page);
    await page.locator('[data-bao-setup="advanced"]').click();
    await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-setup', 'advanced');
    await expect(page.locator('#bao-setup-choice .bao-first-run-progress')).toBeHidden();
    await expect(page.locator('[data-step-panel="1"]')).toBeVisible();
    await page.evaluate(() => App.setStep(5));
    await expect(page.locator('[data-step-panel="5"]')).toBeVisible();
    await page.locator('[name="memory-strength"][value="economy"]').check();
    const rounds = await page.evaluate(() => Number(document.getElementById('max-rounds').value));
    await page.locator('#bao-setup-choice [data-bao-setup="quick"]').click();
    await expect(page.locator('#bao-setup-choice .bao-first-run-progress')).toBeVisible();
    await expect(page.locator('[data-step-panel="4"]')).toBeVisible();
    expect(await page.evaluate(() => Number(document.getElementById('max-rounds').value))).toBe(rounds);
    await page.locator('#api-type').selectOption('custom');
    const technicalToggle = page.locator('#bao-quick-technical-toggle');
    if (await technicalToggle.isVisible()) await technicalToggle.click();
    await expect(page.locator('#model-id')).toBeVisible();
    await expect(page.locator('#base-url')).toBeVisible();
    await expect(page.locator('#start-story')).toBeVisible();
  });
}

test('quick start shows the exact missing item and becomes ready live', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openBuilder(page);

  await page.evaluate(() => {
    const preset = App.modelPresets.find(item =>
      !['bao-credits', 'lmstudio'].includes(item.provider) && item.model && item.base_url
    );
    if (!preset) throw new Error('Missing a complete BYOK preset');
    const provider = document.getElementById('api-type');
    provider.value = preset.provider;
    provider.dispatchEvent(new Event('change', { bubbles: true }));
    const index = App.modelPresets.indexOf(preset);
    const model = document.getElementById('model-select');
    model.value = String(index);
    model.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('api-key').value = '';
    document.getElementById('api-key').dispatchEvent(new Event('input', { bubbles: true }));
    BAOStoryStartReadiness.sync();
  });

  const readiness = page.locator('#bao-start-readiness');
  await expect(readiness).toBeVisible();
  await expect(readiness).toHaveAttribute('data-ready', 'false');
  await expect(readiness.locator('[data-start-ready-summary]')).toHaveText('還差 1 項');
  await expect(readiness.locator('[data-start-ready-message]')).toContainText('還缺連線金鑰');
  await expect(readiness.locator('[data-start-ready-action]')).toHaveText('貼上連線金鑰');

  const steps = page.locator('#bao-setup-choice .bao-first-run-progress li');
  await expect(steps.nth(0)).toHaveClass(/is-done/);
  await expect(steps.nth(0).locator('small')).toContainText('已選：');
  await expect(steps.nth(1)).toHaveClass(/is-current/);
  await expect(steps.nth(1).locator('small')).toContainText('還缺連線金鑰');
  await expect(steps.nth(2)).toHaveClass(/is-pending/);
  await expect(steps.nth(2).locator('small')).toContainText('還缺連線金鑰');

  await readiness.locator('[data-start-ready-action]').click();
  await expect(page.locator('#api-key')).toBeFocused();
  await page.locator('#api-key').fill('readiness-only-test-key');

  await expect(readiness).toHaveAttribute('data-ready', 'true');
  await expect(readiness.locator('[data-start-ready-summary]')).toHaveText('可以開始故事');
  await expect(steps.nth(1)).toHaveClass(/is-done/);
  await expect(steps.nth(1).locator('small')).toContainText('已完成：');
  await expect(steps.nth(2)).toHaveClass(/is-ready/);
  await expect(steps.nth(2).locator('small')).toHaveText('可以開始故事');
  await expect(page.locator('#start-story')).toHaveAttribute('data-bao-ready', 'true');
});

test('hosted quick start points to login instead of asking for an API key', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openBuilder(page);
  await page.evaluate(() => {
    localStorage.removeItem('yorubay:session');
    const provider = document.getElementById('api-type');
    if (![...provider.options].some(option => option.value === 'bao-credits')) throw new Error('Hosted route missing');
    provider.value = 'bao-credits';
    provider.dispatchEvent(new Event('change', { bubbles: true }));
    BAOStoryStartReadiness.sync();
  });

  const readiness = page.locator('#bao-start-readiness');
  await expect(readiness).toHaveAttribute('data-ready', 'false');
  await expect(readiness.locator('[data-start-ready-message]')).toContainText('還缺夜灣帳號登入');
  const link = readiness.locator('[data-start-ready-link]');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'account.html');
  await expect(link).toContainText('登入／查看帳號');
  await expect(readiness.locator('[data-start-ready-action]')).toBeHidden();
});

test('world-specific setup stays available rather than being skipped', async ({ page }) => {
  await openBuilder(page, 'world');
  await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-setup', 'advanced');
  await expect(page.locator('[data-step-panel="1"]')).toBeVisible();
  await expect(page.locator('#bao-setup-choice [data-bao-setup="quick"]')).toBeDisabled();
});

test('explicit step navigation keeps older builder workflows usable', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.BAOQuickSetup && App.characters.length);
  await page.evaluate(async () => {
    const character = App.characters.find(c => c.id !== 'autonomous-npc-world');
    if (!character) throw new Error('Missing a suitable test character');
    await App.openCharacter(character.id);
    App.openBuilder();
    App.setStep(5);
  });
  await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-setup', 'advanced');
  await expect(page.locator('[data-step-panel="5"]')).toBeVisible();
  const interval = page.locator('#state-interval-field');
  const summary = page.locator('#state-generation-mode');
  await expect(page.locator('#state-route-choice')).toHaveValue('same');
  await expect(interval).toBeHidden();
  await expect(summary).toContainText('每輪同次生成');
  // The legacy step-5 navigation keeps its helper panel collapsed; dispatch
  // the same change event rather than requiring its hidden controls to be clickable.
  const separate = await page.evaluate(() => {
    const choice = document.getElementById('state-route-choice');
    choice.value = 'separate';
    choice.dispatchEvent(new Event('change', { bubbles: true }));
    const field = document.getElementById('state-interval-field');
    return { hidden: field.hidden, cssHidden: field.classList.contains('hidden') };
  });
  expect(separate).toEqual({ hidden: false, cssHidden: false });
  await expect(summary).toContainText('另外送出狀態 API');
  await page.evaluate(() => {
    document.getElementById('state-interval').value = '7';
    const choice = document.getElementById('state-route-choice');
    choice.value = 'same';
    choice.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(interval).toBeHidden();
  await expect(page.locator('#state-interval')).toHaveValue('7', 'hidden value remains for a later separate route');
});


test('mobile quick setup is one horizontal three-step strip and keeps connections reachable', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await openBuilder(page);
  await page.waitForFunction(() => !!window.YoruExperience);
  const progress = page.locator('#bao-setup-choice .bao-first-run-progress');
  await expect(progress).toBeVisible();
  const metrics = await page.evaluate(() => {
    const progress = document.querySelector('#bao-setup-choice .bao-first-run-progress');
    const cards = [...progress.querySelectorAll('li')].map(node => node.getBoundingClientRect());
    const buttons = [...document.querySelectorAll('#bao-setup-choice [data-bao-setup]')].map(node=>node.getBoundingClientRect());
    return {
      columns: getComputedStyle(progress).gridTemplateColumns.trim().split(/\s+/).length,
      first: cards[0].top,
      last: cards[2].top,
      buttonsSameRow: Math.abs(buttons[0].top-buttons[1].top)<2,
      viewport:innerWidth,content:document.documentElement.scrollWidth
    };
  });
  expect(metrics.columns).toBe(3);
  expect(metrics.last).toBeCloseTo(metrics.first,0);
  expect(metrics.buttonsSameRow).toBe(true);
  expect(metrics.content).toBeLessThanOrEqual(metrics.viewport+1);
  await expect(page.locator('#bao-start-readiness')).toBeVisible();
  await expect(page.locator('#bao-connection-mode')).toBeVisible();
  await expect(page.locator('#api-type')).toBeVisible();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-setup','advanced');
  await expect(page.locator('.builder-step[data-step-panel="1"]')).toBeVisible();
});

for (const theme of ['mist','dawn','dusk','sunset']) {
  test('quick setup colors follow selected ' + theme + ' theme', async ({page}) => {
    await page.setViewportSize({width:390,height:844});
    await openBuilder(page);
    await page.waitForFunction(() => !!window.YoruExperience);
    await page.evaluate(theme => window.YoruExperience.choose({theme}),theme);
    const state = await page.evaluate(() => {
      const section=document.getElementById('bao-setup-choice');
      const connection=document.getElementById('bao-connection-mode');
      const card=document.querySelector('#bao-connection-mode .bao-connection-mode-grid button');
      return {
        section:getComputedStyle(section).backgroundColor,
        connection:getComputedStyle(connection).backgroundColor,
        card:getComputedStyle(card).backgroundColor,
        text:getComputedStyle(card).color,
        expectedSurface:(() => {
          const probe=document.createElement('span');
          probe.style.backgroundColor=getComputedStyle(document.documentElement).getPropertyValue('--yoru-card');
          document.body.append(probe);
          const value=getComputedStyle(probe).backgroundColor;
          probe.remove();return value;
        })(),
        expectedText:(() => {
          const probe=document.createElement('span');
          probe.style.color=getComputedStyle(document.documentElement).getPropertyValue('--yoru-text');
          document.body.append(probe);
          const value=getComputedStyle(probe).color;
          probe.remove();return value;
        })(),
        overflow:document.documentElement.scrollWidth-innerWidth
      };
    });
    expect(state.section).toBe(state.expectedSurface);
    expect(state.connection).toBe(state.section);
    expect(state.text).toBe(state.expectedText);
    expect(state.overflow).toBeLessThanOrEqual(1);
  });
}


test('model connection keeps optional discovery secondary and support clear of primary actions', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await openBuilder(page);
  await page.waitForFunction(() => !!window.BAOModelDiscovery && !!document.getElementById('bao-support-float'));

  await page.evaluate(() => {
    const provider = document.getElementById('api-type');
    const byok = [...provider.options].find(option => !['bao-credits','lmstudio'].includes(option.value));
    if (!byok) throw new Error('Missing BYOK provider');
    provider.value = byok.value;
    provider.dispatchEvent(new Event('change', {bubbles:true}));
    window.BAOModelDiscovery?.syncBuilderControls?.();
  });

  await expect(page.locator('#bao-support-float')).toBeHidden();
  const more = page.locator('#bao-builder-model-discovery-more');
  await expect(more).toBeVisible();
  await expect(more.locator('summary')).toHaveText('找不到模型？');
  await expect(more).not.toHaveAttribute('open', '');
  await more.locator('summary').click();
  await expect(more.locator('button')).toHaveText('從帳號取得模型');
  await expect(more.locator('.note')).toContainText('只有找不到想用的模型時才需要');

  const order = await page.evaluate(() => [...document.querySelectorAll('#api-advanced-settings [data-api-advanced-grid] label')].map(label =>
    label.querySelector('select,input')?.id || ''
  ));
  expect(order.slice(0,3)).toEqual(['bao-builder-discovery-protocol','base-url','model-id']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
