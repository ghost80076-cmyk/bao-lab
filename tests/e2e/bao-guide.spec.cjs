const { test, expect } = require('@playwright/test');
const guide = page => page.locator('#bao-guide');
const action = (page, id) => guide(page).locator(`[data-bao-journey="${id}"]`).first();
const open = async page => {
  await page.goto('/');
  await page.waitForFunction(() => window.BAOMascot && window.BAOGuidedOnboarding && window.BAOStoryStartReadiness && App.characters.length);
};
const builder = async page => page.evaluate(async () => {
  await App.openCharacter(App.characters.find(c => c.id !== 'autonomous-npc-world').id);
  App.openBuilder();
});

test('home guide starts with a work, can be skipped and resumed after reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.locator('[data-bao-open-guide]').first().click();
  await expect(guide(page)).toContainText('今天想從哪裡開始');
  await page.screenshot({ path: 'test-results/bao-guide-mobile.png', animations: 'disabled' });
  await guide(page).locator('summary').click();
  await action(page, 'skip').click();
  await page.reload();
  await page.locator('#bao-mascot-launch').click();
  await expect(guide(page)).toContainText('需要時，我在這裡');
  await action(page, 'resume').click();
  await action(page, 'explore').click();
  await expect(page.locator('#explore-view')).toHaveClass(/active/);
  await expect(page.locator('#bao-mascot-panel')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('yorubay:bao-journey:v1'))).toBe('active');
});

test('no-key help explains routes and returns to the original fields without requests', async ({ page }) => {
  await open(page);
  await builder(page);
  await page.locator('[data-bao-guide="learn-api"]').click();
  await expect(guide(page)).toContainText('自己的模型連線');
  await action(page, 'router').click();
  await expect(guide(page)).toContainText('並非各模型公司的官方 API');
  await expect(guide(page).locator('a[href="https://openrouter.ai/keys"]')).toBeVisible();
  await action(page, 'setup-openrouter').click();
  await expect(page.locator('#api-type')).toHaveValue('openrouter');
  await expect(page.locator('#bao-mascot-root')).toBeHidden();
  await expect(page.locator('#bao-guided-setup')).toBeVisible();
  await page.locator('[data-bao-guide="change-provider"]').click();
  await page.locator('[data-bao-guide="provider-gemini"]').click();
  await page.locator('#api-key').fill('guide-private-key');
  await expect(page.locator('#bao-guided-setup')).toContainText('尚未測試連線');
  await expect(page.locator('[data-bao-guide="start-story"]')).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain('guide-private-key');
});

test('advanced setup guide follows existing steps and respects manual provider changes', async ({ page }) => {
  await open(page);
  await builder(page);
  await page.locator('[data-bao-setup="advanced"]').click();
  await expect(page.locator('#bao-guided-setup')).toHaveAttribute('data-step', '1');
  await page.locator('[data-bao-guide="recommend-step"]').click();
  await expect(page.locator('#bao-guided-setup')).toHaveAttribute('data-step', '2');
  await page.evaluate(() => App.setStep(4));
  await page.locator('[data-bao-guide="route-hosted"]').click();
  await page.locator('#bao-connection-mode [data-bao-connection="byok"]').click();
  await page.locator('#api-type').selectOption('gemini');
  await expect(page.locator('#bao-guided-setup')).not.toContainText('先登入夜灣帳號');
  await page.locator('#api-type').selectOption('lmstudio');
  await expect(page.locator('#bao-guided-setup')).toContainText('本機模型不必先申請');
  await page.locator('[data-bao-guide="change-provider"]').click();
  await expect(page.locator('[data-bao-guide="provider-gemini"]')).toBeVisible();
  await page.evaluate(() => App.setStep(5));
  await expect(page.locator('#bao-guided-setup')).toHaveAttribute('data-step', '5');
});

test('story help opens only on request and returns to existing model settings', async ({ page }) => {
  await open(page);
  await builder(page);
  await page.locator('#api-key').fill('guide-story-key');
  await page.locator('#start-story').click();
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  await expect(page.locator('#bao-mascot-root')).toBeHidden();
  await page.evaluate(() => BAOStoryControlCenter.open());
  await page.locator('[data-story-control-action="guide"]').click();
  await expect(guide(page)).toContainText('故事已開啟');
  await expect(page.locator('#bao-mascot-launch')).toBeHidden();
  await action(page, 'error').click();
  await action(page, 'auth').click();
  await expect(guide(page)).toContainText('401、403');
  await action(page, 'setup').click();
  await expect(page.locator('#bao-chat-api-backdrop')).toBeVisible();
  await expect(page.locator('#bao-mascot-root')).toBeHidden();
});

test('empty story shelf offers an actionable route and keeps advanced features optional',async({page})=>{
  await open(page);
  await page.locator('#home-library-open').click();
  await expect(page.locator('.story-library-empty')).toContainText('書架現在還是空的');
  await page.locator('[data-library-empty-explore]').click();
  await expect(page.locator('#explore-view')).toHaveClass(/active/);
  await builder(page);
  await page.locator('[data-bao-setup="advanced"]').click();
  await expect(page.locator('[data-bao-guide-eyebrow]')).toContainText('選做');
  await page.evaluate(()=>App.setStep(4));
  await expect(page.locator('[data-bao-guide-eyebrow]')).toContainText('必做');
});


test('provider choice made before selecting a work continues through the native start button',async({page})=>{
  await open(page);
  await page.locator('#bao-mascot-launch').click();
  await page.evaluate(()=>BAOMascot.openGuide('router'));
  await action(page,'setup-openrouter').click();
  await expect(page.locator('#explore-view')).toHaveClass(/active/);
  await builder(page);
  await expect(page.locator('#api-type')).toHaveValue('openrouter');
  await expect(page.locator('#bao-guided-setup')).toContainText('OpenRouter');
});


test('context tasks use the existing shelf and memory workbench without showing a story floater', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.locator('#bao-mascot-launch').click();
  await action(page, 'library').click();
  await expect(page.locator('.story-library-empty')).toBeVisible();
  await page.locator('[data-library-empty-explore]').click();
  await builder(page);
  await page.locator('#api-key').fill('guide-context-key');
  await page.locator('#start-story').click();
  await expect(page.locator('#bao-mascot-root')).toBeHidden();
  await page.evaluate(() => BAOMascot.openGuide());
  await expect(guide(page).locator(':scope > .bao-guide-actions button')).toHaveCount(3);
  await action(page, 'memory-open').click();
  await expect(page.locator('#bao-mascot-root')).toBeHidden();
  await expect(page.locator('.memory-desk-backdrop')).toBeVisible();
});
