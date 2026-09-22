const { test, expect } = require("@playwright/test");

async function saveStoryWithoutPersistingKey(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "班長。" })).toBeVisible();
  await page.getByRole("button", { name: "探索角色" }).click();
  const card = page.locator("article").filter({ hasText: "林沉風 - 見過黑暗的人" });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole("button", { name: "開始故事" }).click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "下一步" }).click();
  await page.locator("#bao-demo-mode").check();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await expect(page.locator("#user-input")).toBeVisible();
  await expect(page.locator("#bao-chat-api-toolbar")).toBeVisible();
  await page.evaluate(async () => {
    App.config.demoMode = false;
    App.config.api = {
      type: "custom", protocol: "openai", model: "test-model",
      baseUrl: "https://example.invalid/v1/chat/completions", key: "TEMPORARY_TEST_KEY"
    };
    if (GameState.current) GameState.current.config = App.config;
    Chat.add("user", "這是一段測試劇情，不應因為補上 API Key 而消失。");
    Chat.summary = "故事的長期記憶不應消失。";
    App.saveStory(false);
    await Storage.flush();
  });
  await page.reload();
  await expect(page.locator("#home-continue")).toBeVisible();
}

test("resuming a story opens editable API settings, preserves the story and does not save the key", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await saveStoryWithoutPersistingKey(page);
  await page.locator("#home-continue").click();
  const dialog = page.getByRole("dialog", { name: "目前故事的 AI 連線設定" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[name="model"]')).toHaveValue("test-model");
  await expect(dialog.locator('[name="baseUrl"]')).toHaveValue("https://example.invalid/v1/chat/completions");
  await dialog.locator('[name="key"]').fill("NEW_TEST_KEY");
  await dialog.getByRole("button", { name: "套用到目前故事" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#bao-chat-api-toolbar")).toBeVisible();
  await expect(page.locator("#bao-chat-api-toolbar")).toContainText("test-model");
  const result = await page.evaluate(() => ({
    key: App.config.api.key,
    savedKey: Storage.loadStory()?.config?.api?.key || "",
    conversation: Chat.messages.map(message => message.content),
    summary: Chat.summary,
    model: App.config.api.model,
    stateMatches: GameState.current?.config === App.config,
    width: document.documentElement.scrollWidth,
    viewport: innerWidth
  }));
  expect(result.key).toBe("NEW_TEST_KEY");
  expect(result.savedKey).toBe("");
  expect(result.conversation).toContain("這是一段測試劇情，不應因為補上 API Key 而消失。");
  expect(result.summary).toBe("故事的長期記憶不應消失。");
  expect(result.model).toBe("test-model");
  expect(result.stateMatches).toBe(true);
  expect(result.width).toBeLessThanOrEqual(result.viewport);
});

test("desktop chat can reopen API settings and switch models without restarting", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveStoryWithoutPersistingKey(page);
  await page.locator("#home-continue").click();
  const dialog = page.getByRole("dialog", { name: "目前故事的 AI 連線設定" });
  await expect(dialog).toBeVisible();
  await dialog.locator('[name="key"]').fill("DESKTOP_TEST_KEY");
  await dialog.getByRole("button", { name: "套用到目前故事" }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator("#bao-chat-api-toolbar button").click();
  await expect(dialog).toBeVisible();
  await dialog.locator('[name="model"]').fill("another-model");
  await dialog.getByRole("button", { name: "套用到目前故事" }).click();
  await expect(dialog).toHaveCount(0);
  const result = await page.evaluate(() => ({
    key: App.config.api.key,
    model: App.config.api.model,
    messages: Chat.messages.map(message => message.content),
    savedKey: Storage.loadStory()?.config?.api?.key || ""
  }));
  expect(result.key).toBe("DESKTOP_TEST_KEY");
  expect(result.model).toBe("another-model");
  expect(result.messages).toContain("這是一段測試劇情，不應因為補上 API Key 而消失。");
  expect(result.savedKey).toBe("");
});
