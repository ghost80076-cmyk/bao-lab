const { test, expect } = require('@playwright/test');

const HARNESS = '/tests/fixtures/gameplay-ui-preview-harness.html';

const meterSchema = () => ({
  version: 1,
  panels: [{
    id: 'status',
    label: '狀態',
    sections: [{ type: 'meters', title: '狀態條', items: [
      { label: 'HP', value_path: 'modules.player.hp', max_path: 'modules.player.max_hp' }
    ] }]
  }]
});
const hpState = (hp, max = 50) => ({ modules: { player: { hp, max_hp: max } } });

async function openHarness(page) {
  await page.goto(HARNESS);
  await page.waitForFunction(() => window.harness && window.harness.messages.some(m => m.type === 'ready'));
  return page.frameLocator('#preview');
}
const lastRendered = page => page.evaluate(() => [...window.harness.messages].reverse().find(m => m.type === 'rendered') || null);
const renderedCount = page => page.evaluate(() => window.harness.messages.filter(m => m.type === 'rendered').length);
async function waitForNewRender(page, before) {
  await page.waitForFunction(n => window.harness.messages.filter(m => m.type === 'rendered').length > n, before);
}

test('a meter renders through the real renderer inside the preview iframe', async ({ page }) => {
  const frame = await openHarness(page);
  await page.evaluate(([schema, state]) => window.client.render(schema, state, 'status'), [meterSchema(), hpState(30)]);
  const meter = frame.locator('.gameplay-meter');
  await expect(meter).toHaveCount(1);
  await expect(meter).toContainText('HP');
  await expect(meter).toContainText('30 / 50');
  await expect(meter.locator('em')).toHaveCSS('width', /^\d/);
  expect(await meter.locator('em').evaluate(el => el.style.width)).toBe('60%');
  const rendered = await lastRendered(page);
  expect(rendered).toMatchObject({ ok: true, panelId: 'status', panels: ['status'] });
});

test('updating the test value redraws the meter without reloading the preview', async ({ page }) => {
  const frame = await openHarness(page);
  await page.evaluate(([schema, state]) => window.client.render(schema, state, 'status'), [meterSchema(), hpState(30)]);
  await expect(frame.locator('.gameplay-meter')).toContainText('30 / 50');
  const before = await renderedCount(page);
  await page.evaluate(state => window.client.setState(state), hpState(10));
  await expect(frame.locator('.gameplay-meter')).toContainText('10 / 50');
  expect(await frame.locator('.gameplay-meter em').evaluate(el => el.style.width)).toBe('20%');
  await waitForNewRender(page, before);
  // reset restores the state sent with render()
  await page.evaluate(() => window.client.reset());
  await expect(frame.locator('.gameplay-meter')).toContainText('30 / 50');
});

test('an unknown or missing value is shown as unknown, not as a made-up number', async ({ page }) => {
  const frame = await openHarness(page);
  await page.evaluate(schema => window.client.render(schema, {}, 'status'), meterSchema());
  await expect(frame.locator('.gameplay-meter')).toContainText('未知');
});

test('resizing the iframe changes the real viewport, the Stage tier and the production CSS', async ({ page }) => {
  const dashboard = {
    version: 1,
    layout: { preset: 'rpg-dashboard', left_panel: 'status', right_panel: 'world' },
    panels: [
      meterSchema().panels[0],
      { id: 'world', label: '世界', sections: [{ type: 'stats', items: [{ label: '地點', path: 'location' }] }] }
    ]
  };
  const frame = await openHarness(page);
  await page.evaluate(([schema, state]) => window.client.render(schema, state, 'status'), [dashboard, hpState(30)]);
  await expect(frame.locator('.gameplay-meter')).toHaveCount(1);

  const expectTier = async (width, viewport, presentation) => {
    const before = await renderedCount(page);
    await page.evaluate(w => window.client.setViewport(w, 700), width);
    await waitForNewRender(page, before);
    await expect.poll(async () => (await lastRendered(page)).width).toBe(width);
    const rendered = await lastRendered(page);
    expect(rendered.viewport).toBe(viewport);
    expect(rendered.shell).toBe('rpg-dashboard');
    expect(rendered.presentation).toBe('panel');
    expect(rendered.previewScope).toBe('panel');
    expect(rendered.resolvedPresentation).toBe(presentation);
    // The iframe document itself reports the same width, i.e. media queries use the iframe viewport.
    expect(await page.frames().find(f => f !== page.mainFrame()).evaluate(() => window.innerWidth)).toBe(width);
  };
  await expectTier(390, 'mobile', 'panel');
  await expectTier(900, 'compact', 'panel');
  await expectTier(1280, 'desktop', 'panel');
  await expectTier(1500, 'desktop', 'embedded');

  // The same meter still renders at phone width (production CSS, not a scaled container).
  await page.evaluate(() => window.client.setViewport(390, 700));
  await expect(frame.locator('.gameplay-meter')).toBeVisible();
  const box = await frame.locator('.gameplay-meter').boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
});

test('the preview ignores malformed messages and messages from other windows', async ({ page }) => {
  const frame = await openHarness(page);
  await page.evaluate(([schema, state]) => window.client.render(schema, state, 'status'), [meterSchema(), hpState(30)]);
  await expect(frame.locator('.gameplay-meter')).toContainText('30 / 50');

  // 1. right window, malformed payloads
  await page.evaluate(() => {
    const target = document.getElementById('preview').contentWindow;
    const post = data => target.postMessage(data, location.origin);
    post('not an object');
    post({ channel: 'someone-else', version: 1, type: 'render', payload: { schema: { version: 1, panels: [] } } });
    post({ channel: 'bao-gameplay-preview', version: 1, type: 'render', payload: { schema: [] } });
    post({ channel: 'bao-gameplay-preview', version: 1, type: 'set-state', payload: { state: 'nope' } });
    post({ channel: 'bao-gameplay-preview', version: 1, type: 'eval', payload: { code: 'document.body.remove()' } });
  });

  // 2. well-formed message, but sent by a different same-origin window (not the iframe's parent)
  await page.evaluate(async () => {
    const sibling = document.createElement('iframe');
    sibling.src = '/robots.txt';
    document.body.appendChild(sibling);
    await new Promise(resolve => sibling.addEventListener('load', resolve, { once: true }));
    const target = document.getElementById('preview').contentWindow;
    const send = sibling.contentWindow.Function('target', 'message', 'target.postMessage(message, "*")');
    send(target, { channel: 'bao-gameplay-preview', version: 1, type: 'set-state', payload: { state: { modules: { player: { hp: 1, max_hp: 50 } } } } });
  });

  await page.waitForTimeout(300);
  await expect(frame.locator('.gameplay-meter')).toContainText('30 / 50');
});

test('the preview never touches storage, cookies or the real story save', async ({ page }) => {
  const frame = await openHarness(page);
  await page.evaluate(([schema, state]) => window.client.render(schema, state, 'status'), [meterSchema(), hpState(30)]);
  await expect(frame.locator('.gameplay-meter')).toContainText('30 / 50');
  const facts = await page.frames().find(f => f !== page.mainFrame()).evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    calls: { ...window.BAOPreviewIsolation.calls },
    hasRealApp: typeof window.App.openCharacter === 'function',
    hasStoryStorage: typeof window.Storage === 'undefined' ? false : Boolean(window.StoryStorage || window.BAOStorage)
  }));
  expect(facts.local).toBe(0);
  expect(facts.session).toBe(0);
  expect(facts.cookie).toBe('');
  expect(facts.calls).toEqual({});
  expect(facts.hasRealApp).toBe(false);
  expect(facts.hasStoryStorage).toBe(false);
});

test('a purchase action changes only the preview state and is counted, never saved', async ({ page }) => {
  const shop = {
    version: 1,
    panels: [{ id: 'shop', label: '商店', sections: [{ type: 'actions', title: '行動', items: [{
      label: '購買藥水',
      draft: '我買下藥水。',
      effect: { changes: [{ path: 'modules.player.gold', delta: -5 }], items: [{ path: 'modules.inventory', id: 'potion', name: '藥水', delta: 1 }], event: '買了藥水' }
    }] }, { type: 'stats', items: [{ label: '金幣', path: 'modules.player.gold' }] }] }]
  };
  // Real effects need moduleDefinitions in the state (what BAOWorldModules.ensureState provides in the game).
  const shopState = {
    moduleDefinitions: [{ id: 'player', kind: 'object' }, { id: 'inventory', kind: 'collection' }],
    modules: { player: { gold: 12 }, inventory: [] }
  };
  const frame = await openHarness(page);
  await page.evaluate(([schema, state]) => window.client.render(schema, state, 'shop'), [shop, shopState]);
  await expect(frame.getByText('購買藥水')).toBeVisible();
  await frame.getByText('購買藥水').click();
  await expect.poll(() => page.evaluate(() => window.harness.states.length)).toBeGreaterThan(0);
  const state = await page.evaluate(() => window.harness.states.at(-1));
  expect(state.modules.player.gold).toBe(7);
  expect(state.modules.inventory.map(item => item.id)).toEqual(['potion']);
  const calls = await page.frames().find(f => f !== page.mainFrame()).evaluate(() => ({ ...window.BAOPreviewIsolation.calls }));
  expect(calls.saveStory).toBe(1);          // counted by the stub...
  expect(await page.evaluate(() => localStorage.length)).toBe(0); // ...and nothing was persisted
  // reloading the iframe forgets the changed test state; the client re-sends the last render
  await page.evaluate(() => document.getElementById('preview').contentWindow.location.reload());
  await page.waitForFunction(() => window.harness.messages.filter(m => m.type === 'ready').length >= 2);
  await expect(frame.locator('.gameplay-ui-section', { hasText: '金幣' })).toContainText('12');
});

test('text actions fill only the preview draft and reset clears it', async ({ page }) => {
  const frame = await openHarness(page);
  const schema = { version: 1, panels: [{ id: 'actions', sections: [{ type: 'actions', items: [
    { label: '查看房間', draft: '我仔細查看房間。' }
  ] }] }] };
  await page.evaluate(s => window.client.render(s, {}, 'actions'), schema);
  await frame.getByRole('button', { name: '查看房間' }).click();
  await expect(frame.getByRole('textbox', { name: '預覽行動草稿' })).toHaveValue('我仔細查看房間。');
  await page.evaluate(() => window.client.reset());
  await expect(frame.getByRole('textbox', { name: '預覽行動草稿' })).toHaveValue('');
});

test('preview preserves existing parent storage and labels its limited layout scope', async ({ page }) => {
  await page.goto('/tests/fixtures/gameplay-ui-preview-harness.html');
  await page.evaluate(() => {
    localStorage.setItem('preview-sentinel', 'existing-story');
    sessionStorage.setItem('preview-sentinel', 'existing-session');
  });
  await page.waitForFunction(() => window.harness.messages.some(m => m.type === 'ready'));
  await page.evaluate(([s, state]) => window.client.render(s, state, 'status'), [meterSchema(), hpState(30)]);
  const frame = page.frameLocator('#preview');
  await expect(frame.getByRole('note')).toContainText('單面板預覽');
  await expect(frame.locator('.gameplay-meter')).toContainText('30 / 50');
  await page.evaluate(() => window.client.reset());
  expect(await page.evaluate(() => localStorage.getItem('preview-sentinel'))).toBe('existing-story');
  expect(await page.evaluate(() => sessionStorage.getItem('preview-sentinel'))).toBe('existing-session');
});
