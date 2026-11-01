const { test, expect } = require('@playwright/test');

const mobile = { width: 390, height: 844 };

async function readyHome(page) {
  await page.setViewportSize(mobile);
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    window.YoruExperience?.choose &&
    window.YoruBayInstall?.open &&
    document.querySelector('link[href^="css/experience-preferences.css"]')?.sheet &&
    document.getElementById('home-library')
  ));
}

test('mist keeps white/light content readable on dark book and resumed-story cards', async ({ page }) => {
  await readyHome(page);
  await page.evaluate(() => {
    YoruExperience.choose({ theme: 'mist' });
    document.getElementById('home-local-story').classList.remove('hidden');
  });
  const colors = await page.evaluate(() => {
    const color = selector => getComputedStyle(document.querySelector(selector)).color;
    const bg = selector => getComputedStyle(document.querySelector(selector)).backgroundImage;
    return {
      localTitle: color('#home-local-story-title'),
      localName: color('#home-local-story-name'),
      localPreview: color('#home-local-story-preview'),
      localBackground: bg('#home-local-story'),
      libraryTitle: color('#home-library-story'),
      libraryChapter: color('#home-library .brand-library-chapters li'),
      libraryBackground: bg('#home-library .brand-library-sample'),
      catalogLink: color('#home-view .brand-home-explore-head .text-button')
    };
  });
  for (const name of ['localTitle', 'localName', 'localPreview', 'libraryTitle', 'libraryChapter']) {
    const numbers = colors[name].match(/\d+/g).slice(0, 3).map(Number);
    expect(Math.min(...numbers), `${name} should use light ink on dark surface`).toBeGreaterThan(180);
  }
  expect(colors.localBackground).toContain('linear-gradient');
  expect(colors.libraryBackground).toContain('linear-gradient');
  expect(Number(colors.catalogLink.match(/\d+/)?.[0])).toBeLessThan(170);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test('installation instructions never pop over the mobile homepage without intent', async ({ page }) => {
  await readyHome(page);
  await page.waitForTimeout(3200); // Old fallback automatically appeared after 2.5s.
  await expect(page.locator('#yorubay-install-prompt')).toHaveCount(0);
  await page.locator('#bao-mobile-nav [data-player-nav="me"]').click();
  const more = page.locator('#me-view [data-bao-player-more]');
  if (!(await more.evaluate(node => node.open))) await more.locator('summary').click();
  const entry = page.locator('#me-view [data-bao-player-action="install"]');
  await expect(entry).toBeVisible();
  await entry.click();
  const prompt = page.locator('#yorubay-install-prompt');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('把夜灣留在主畫面');
  await prompt.getByRole('button', { name: '知道了' }).click();
  await expect(prompt).toHaveCount(0);
  expect(await page.evaluate(() => Number(localStorage.getItem('yorubay:pwa-install-dismissed-at')))).toBeGreaterThan(0);
  await page.reload();
  await page.waitForTimeout(3000);
  await expect(page.locator('#yorubay-install-prompt')).toHaveCount(0);
});

test('native install opportunity is available only after opening the My menu entry', async ({ page }) => {
  await readyHome(page);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperty(event, 'prompt', {
      value: () => { window.__installPromptCalled = true; }
    });
    Object.defineProperty(event, 'userChoice', { value: Promise.resolve({ outcome: 'dismissed' }) });
    window.dispatchEvent(event);
  });
  await expect(page.locator('#yorubay-install-prompt')).toHaveCount(0);
  await page.evaluate(() => YoruBayInstall.open());
  await expect(page.locator('#yorubay-install-prompt .yorubay-install-now')).toBeVisible();
  await page.locator('#yorubay-install-prompt .yorubay-install-now').click();
  expect(await page.evaluate(() => window.__installPromptCalled)).toBe(true);
  await expect(page.locator('#yorubay-install-prompt')).toHaveCount(0);
});


test('a successful controlled navigation refreshes the cached offline HTML shell', async ({ page }) => {
  await readyHome(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 });
  }

  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).toContain('yorubay-shell-v3');

  await page.evaluate(async () => {
    const cache = await caches.open('yorubay-shell-v3');
    await cache.put('/index.html', new Response(
      '<!doctype html><html><head><title>STALE_SHELL</title></head><body>STALE_OFFLINE_SHELL</body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    ));
  });
  expect(await page.evaluate(async () => (await caches.match('/index.html')).text())).toContain('STALE_OFFLINE_SHELL');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();

  const refreshed = await page.evaluate(async () => (await caches.match('/index.html')).text());
  expect(refreshed).not.toContain('STALE_OFFLINE_SHELL');
  expect(refreshed).toContain('夜灣');
});
