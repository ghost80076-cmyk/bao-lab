const { test, expect } = require("@playwright/test");

async function saveStoryWithoutPersistingKey(page) {
  await page.goto("/");
  await page.waitForFunction(() =>
    typeof App !== "undefined" &&
    App.characters?.length > 0 &&
    typeof Storage?.status === "function" &&
    Storage.status().ready &&
    typeof window.BAOChatAPISettings?.restore === "function"
  );

  await page.evaluate(async () => {
    const character = App.characters.find(item => item.id !== "autonomous-npc-world");
    if (!character) throw new Error("Missing a suitable test character");
    await App.openCharacter(character.id);
    App.openBuilder();

    const config = App.collectConfig();
    config.demoMode = false;
    config.offlineWorldPreview = false;
    config.api = {
      type: "custom",
      route: "custom",
      protocol: "openai",
      model: "test-model",
      baseUrl: "https://example.invalid/v1/chat/completions",
      key: "TEMPORARY_TEST_KEY"
    };

    App.config = config;
    Chat.reset();
    GameState.create(App.activeCharacter, config);
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
  const dialog = page.getByRole("dialog", { name: "目前故事的模型連線" });
  await expect(dialog).toBeVisible();
  const help = dialog.getByRole("button", { name: "模型連線說明" });
  await expect(help).toBeVisible();
  await expect(dialog.locator("#bao-chat-api-intro")).toBeHidden();
  const mobileLayout = await dialog.evaluate(node => ({
    footerColumns: getComputedStyle(node.querySelector("footer")).gridTemplateColumns.trim().split(/\s+/).length,
    backdropAlign: getComputedStyle(node.parentElement).alignItems,
    bottomRadius: getComputedStyle(node).borderBottomLeftRadius
  }));
  expect(mobileLayout).toEqual({ footerColumns: 2, backdropAlign: "flex-end", bottomRadius: "0px" });
  await help.click();
  await expect(dialog.locator("#bao-chat-api-intro")).toBeVisible();
  await help.click();
  await expect(dialog.locator("#bao-chat-api-intro")).toBeHidden();
  await expect(dialog.locator('.bao-chat-api-advanced')).toHaveAttribute('open', '');
  await expect(dialog.locator('[name="model"]')).toHaveValue("test-model");
  await expect(dialog.locator('[name="baseUrl"]')).toHaveValue("https://example.invalid/v1/chat/completions");
  await dialog.locator('[name="key"]').fill("NEW_TEST_KEY");
  await dialog.getByRole("button", { name: "套用到目前故事" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#chat-model")).toHaveText("test-model");
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
  const dialog = page.getByRole("dialog", { name: "目前故事的模型連線" });
  await expect(dialog).toBeVisible();
  await dialog.locator('[name="key"]').fill("DESKTOP_TEST_KEY");
  await dialog.getByRole("button", { name: "套用到目前故事" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "☰ 全部功能" }).click();
  const tools = page.getByRole("dialog", { name: "故事功能選單" });
  await expect(tools).toBeVisible();
  const settings = tools.locator("details").filter({ hasText: "敘事、模型與外觀" });
  await settings.locator("summary").click();
  await settings.getByRole("button", { name: "模型連線", exact: true }).click();
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
