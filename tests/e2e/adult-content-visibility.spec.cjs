const { test, expect } = require("@playwright/test");
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

test("adult content stays hidden until the player enables it locally", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("yorubay:adult-visibility-test-ready") === "yes") return;
    localStorage.removeItem("yorubay:content-preferences:v1");
    localStorage.removeItem("bao-lab:adult-confirmed");
    sessionStorage.setItem("yorubay:adult-visibility-test-ready", "yes");
  });
  await page.goto("./");
  await page.waitForFunction(() =>
    window.BAOContentPreferences &&
    window.BAOExploreDiscovery &&
    document.getElementById("bao-me-nav")
  );

  await page.evaluate(() => App.showView("explore"));
  await expect(page.locator('#character-list [data-character-id="desire-district"]')).toHaveCount(0);
  await page.locator('[data-explore-filter-open]').click();
  await expect(page.locator('[data-explore-adult-controls]')).toBeHidden();
  await page.locator('[data-explore-filter-close]').click();

  await page.evaluate(() => App.showView("me"));
  const toggle = page.locator("[data-bao-adult-content-toggle]");
  await expect(toggle).not.toBeChecked();

  page.once("dialog", dialog => dialog.accept());
  await toggle.click();
  await expect(toggle).toBeChecked();

  await page.evaluate(async () => {
    App.showView("explore");
    while (!App.characters?.some(item => item?.id === "desire-werewolf") && App.hasMoreCharacterCatalog?.()) {
      await App.loadMoreCharacters();
    }
    App.renderCharacters("all");
  });
  await expect(page.locator('#character-list [data-character-id="desire-district"]')).toBeVisible();
  // Metadata completion no longer implies every card is mounted. Use the real card pager.
  for (let batch=0; batch<5 && !await page.locator('#character-list [data-character-id="desire-werewolf"]').count(); batch++) {
    await page.locator('#character-load-more').click();
  }
  await expect(page.locator('#character-list [data-character-id="desire-werewolf"]')).toBeVisible();
  await expect(page.locator('#character-list [data-character-id="linchenfeng"]')).toBeVisible();
  await page.locator('[data-explore-filter-open]').click();
  const adultControls = page.locator('[data-explore-adult-controls]');
  await expect(adultControls).toBeVisible();
  await expect(adultControls.getByRole('button', { name: '全部', exact: true })).toHaveClass(/active/);
  await adultControls.getByRole('button', { name: '成熟內容', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('#character-list [data-character-id="desire-district"]')).toBeVisible();
  // Changing rating starts a new progressive result window.
  for (let batch=0; batch<5 && !await page.locator('#character-list [data-character-id="desire-werewolf"]').count(); batch++) {
    await page.locator('#character-load-more').click();
  }
  await expect(page.locator('#character-list [data-character-id="desire-werewolf"]')).toBeVisible();
  await expect(page.locator('#character-list [data-character-id="linchenfeng"]')).toHaveCount(0);

  await page.reload();
  await page.waitForFunction(() => window.BAOContentPreferences && window.BAOExploreDiscovery);
  await page.evaluate(() => App.showView("explore"));
  await page.locator('[data-explore-filter-open]').click();
  await expect(page.locator('[data-explore-adult-controls]')).toBeVisible();
  await page.locator('[data-explore-filter-close]').click();

  await page.evaluate(() => App.showView("me"));
  const toggleAfterReload = page.locator("[data-bao-adult-content-toggle]");
  await expect(toggleAfterReload).toBeChecked();
  await toggleAfterReload.click();
  await expect(toggleAfterReload).not.toBeChecked();

  await page.evaluate(() => App.showView("explore"));
  await expect(page.locator('#character-list [data-character-id="desire-district"]')).toHaveCount(0);
  await page.locator('[data-explore-filter-open]').click();
  await expect(page.locator('[data-explore-adult-controls]')).toBeHidden();
});
