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
  const reopened = await page.evaluate(() => window.BAOChatAPISettings?.open?.());
  expect(reopened).toBe(true);
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


test("custom OpenAI loopback connection reuses LM Studio local transport without an API key", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await saveStoryWithoutPersistingKey(page);
  await page.locator("#home-continue").click();
  const dialog = page.getByRole("dialog", { name: "目前故事的模型連線" });
  await expect(dialog).toBeVisible();
  await page.waitForFunction(() =>
    typeof window.BAOLMStudioCore?.endpoint === "function" &&
    typeof window.BAOLMStudio?.open === "function"
  );

  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.__loopbackCalls = [];
    window.fetch = (input, init = {}) => {
      const url = String(input?.url || input);
      if (!url.startsWith("http://127.0.0.1:1235/v1/")) return original(input, init);
      window.__loopbackCalls.push({ url, headers: { ...(init.headers || {}) } });
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: "loopback ok" } }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 }
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    };
  });

  await dialog.locator('[name="protocol"]').selectOption("openai");
  await dialog.locator('[name="model"]').fill("qwen3-8b");
  await dialog.locator('[name="key"]').fill("");

  await dialog.locator('[name="baseUrl"]').fill("http://192.168.1.50:1235/v1");
  await dialog.getByRole("button", { name: "測試連線（可能計費）" }).click();
  await expect(dialog.locator(".bao-chat-api-error")).toContainText("HTTPS");

  await dialog.locator('[name="baseUrl"]').fill("http://127.0.0.1:1235/v1");
  await expect(dialog.locator('[name="key"]')).toHaveAttribute("placeholder", /免填/);
  await dialog.getByRole("button", { name: "測試連線（可能計費）" }).click();
  await expect(dialog.locator(".bao-chat-api-error")).toContainText("連線測試成功");

  await dialog.getByRole("button", { name: "套用到目前故事" }).click();
  await expect(dialog).toHaveCount(0);
  const applied = await page.evaluate(() => ({
    type: App.config.api.type,
    route: App.config.api.route,
    local: App.config.api.local,
    key: App.config.api.key,
    baseUrl: App.config.api.baseUrl,
    calls: window.__loopbackCalls
  }));
  expect(applied.type).toBe("lmstudio");
  expect(applied.route).toBe("local");
  expect(applied.local).toBe(true);
  expect(applied.key).toBe("BAO_LOCAL_NO_AUTH");
  expect(applied.baseUrl).toBe("http://127.0.0.1:1235/v1/chat/completions");
  expect(applied.calls.some(call => call.url === "http://127.0.0.1:1235/v1/chat/completions")).toBe(true);
  expect(applied.calls.every(call => !call.headers.Authorization)).toBe(true);

  expect(await page.evaluate(() => window.BAOChatAPISettings?.open?.())).toBe(true);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[name="baseUrl"]')).toHaveValue("http://127.0.0.1:1235/v1");
  await dialog.getByRole("button", { name: "測試連線（可能計費）" }).click();
  await expect(dialog.locator(".bao-chat-api-error")).toContainText("連線測試成功");
});

for (const width of [390, 1440]) test(`Hosted model picker separates credentials and preserves story (${width}px)`, async ({ page }) => {
  await page.setViewportSize({width, height:900});
  await saveStoryWithoutPersistingKey(page);
  await page.locator('#home-continue').click();
  await page.waitForFunction(() => window.BAOCreditsPilot && App.modelPresets.some(p => p.provider === BAOCreditsPilot.provider));
  await page.evaluate(() => {
    const preset = App.modelPresets.find(p => p.provider === BAOCreditsPilot.provider);
    App.config.api = {type:preset.provider,route:preset.route,protocol:preset.protocol,model:preset.model,baseUrl:preset.base_url,key:'__YORUBAY_ACCOUNT__'};
    // Stub only account readiness: no real login, wallet, or provider request.
    window.BAOCreditsPilot = {...BAOCreditsPilot, prepareAccountConfig(config) {
      if (!BAOCreditsPilot.isAccountConnection(config)) return false;
      config.key = '__YORUBAY_ACCOUNT__'; return true;
    }};
    BAOChatAPISettings.open();
  });
  const dialog = page.getByRole('dialog', {name:'目前故事的模型連線'});
  await expect(dialog.locator('[name=connectionMode]')).toHaveValue('hosted');
  await expect(dialog.locator('[name=key]')).toBeHidden();
  await expect(dialog.locator('.bao-chat-api-advanced')).toBeHidden();
  const options = await dialog.locator('[name=preset] option').allTextContents();
  expect(options.length).toBeGreaterThan(1);
  expect(options.join(' ')).not.toMatch(/OpenRouter|官方|自訂|Base URL/);
  await dialog.locator('[name=preset]').selectOption({index:1});
  await dialog.getByRole('button',{name:'套用到目前故事'}).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => ({hosted:BAOCreditsPilot.isAccountConnection(App.config.api),messages:Chat.messages.map(m=>m.content),summary:Chat.summary}))).toMatchObject({hosted:true,summary:'故事的長期記憶不應消失。',messages:expect.arrayContaining(['這是一段測試劇情，不應因為補上 API Key 而消失。'])});
  await page.evaluate(() => BAOChatAPISettings.open());
  await dialog.locator('[name=connectionMode]').selectOption('byok');
  await expect(dialog.locator('[name=key]')).toBeVisible();
  await expect(dialog.locator('[name=baseUrl]')).toHaveValue('');
  await expect(dialog.locator('[name=key]')).toHaveValue('');
  await expect(dialog.locator('[name=preset]')).toHaveValue('custom');
  const byokOptions = await dialog.locator('[name=preset] option').allTextContents();
  expect(byokOptions.join(' ')).not.toContain('夜灣燈火');
  await dialog.locator('[name=key]').fill('BYOK_TEMP_KEY');
  await dialog.locator('[name=connectionMode]').selectOption('hosted');
  await expect(dialog.locator('[name=key]')).toBeHidden();
  await expect(dialog.locator('[name=key]')).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { BAOCreditsPilot.prepareAccountConfig = () => false; });
  await dialog.getByRole('button',{name:'套用到目前故事'}).click();
  await expect(dialog.locator('.bao-chat-api-error')).toContainText('請先登入夜灣帳號');
  await expect(dialog).toBeVisible();
  await page.screenshot({path:`/tmp/hosted-mode-${width}.png`});
});
