const { test, expect } = require("@playwright/test");

const openModelStep = async page => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "班長。" })).toBeVisible();
  await page.getByRole("button", { name: "探索作品" }).click();
  const card = page.locator("article").filter({ hasText: "林沉風 - 見過黑暗的人" });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole("button", { name: "開始故事" }).click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.locator("#test-api")).toBeVisible();
};

const openDemoCanon = async page => {
  await openModelStep(page);
  await page.locator("#bao-demo-mode").check();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  const memoryButton = page.getByRole("button", { name: /記憶工作台/ });
  await expect(memoryButton).toBeVisible();
  await memoryButton.click();
  await page.getByRole("button", { name: /Canon 資料庫/ }).click();
  await expect(page.getByRole("heading", { name: "Canon 資料庫" })).toBeVisible();
};

const openDemoStory = async page => {
  await openModelStep(page);
  await page.locator("#bao-demo-mode").check();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await expect(page.locator("#user-input")).toBeVisible();
};

const seedDraft = async page => page.evaluate(() => {
  const longLine = "這是一段用來驗證長篇 Canon 編輯畫面不會破版的內容。".repeat(18);
  GameState.current.canonDraft = {
    version: 2,
    lastProcessedMessageCount: 2,
    lastProcessedMessageId: "msg-e2e-2",
    notebooks: Array.from({ length: 6 }, (_, index) => ({
      id: `canon-e2e-${index}`,
      title: `第 ${index + 1} 本 Canon：人物關係與尚未解決的長標題`,
      category: index % 2 ? "relationships" : "current",
      tier: index % 3 === 0 ? "core" : index % 3 === 1 ? "relevant" : "ui",
      certainty: index % 2 ? "mixed" : "confirmed",
      enabled: true,
      content: longLine,
      evidence: `訊息 ${index + 1} · msg-e2e-${index + 1}`
    }))
  };
  BAOMemoryWorkbench.refresh(document.querySelector(".memory-desk-backdrop"), "canon");
});

test.describe("Canon workbench responsive UI", () => {
  test("main, memory, and state connection diagnostics keep routes isolated", async ({ page }) => {
    const requests = [];
    await page.route("https://generativelanguage.googleapis.com/**", async route => {
      requests.push({ kind: "main", url: route.request().url() });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 1, totalTokenCount: 5 } }) });
    });
    for (const kind of ["memory", "state"]) {
      await page.route(`https://${kind}.example/**`, async route => {
        requests.push({ kind, url: route.request().url() });
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }) });
      });
    }

    await openModelStep(page);
    await page.locator("#api-key").fill("MAIN-TEST-KEY");
    await page.locator("#test-api").click();
    await expect(page.locator("#api-test-status")).toContainText("主模型連線成功");
    await page.getByRole("button", { name: "下一步" }).click();

    for (const kind of ["memory", "state"]) {
      await page.locator(`#${kind}-route-choice`).selectOption("separate");
      await page.locator(`#${kind}-model-id`).fill(`${kind}-model`);
      await page.locator(`#${kind}-protocol`).selectOption("openai");
      await page.locator(`#${kind}-base-url`).fill(`https://${kind}.example/v1/chat/completions`);
      await page.locator(`#${kind}-api-key`).fill(`${kind.toUpperCase()}-TEST-KEY`);
      await page.locator(`[data-test-helper="${kind}"]`).click();
      await expect(page.locator(`#${kind}-route-test-status`)).toContainText("模型連線成功");
    }

    expect(requests.map(request => request.kind)).toEqual(["main", "memory", "state"]);
    const accounting = await page.evaluate(() => ({ usage: Chat.usage, lastStoryPromptTokens: Chat.lastStoryPromptTokens }));
    expect(accounting.usage).toEqual({ prompt: 0, completion: 0, cached: 0, cacheWrite: 0, total: 0 });
    expect(accounting.lastStoryPromptTokens).toBe(0);
  });

  test("a player can cancel one pending generation without duplicate sends or phantom history", async ({ page }) => {
    let providerRequests = 0;
    await page.route("https://generativelanguage.googleapis.com/**", async route => {
      providerRequests += 1;
      await new Promise(resolve => setTimeout(resolve, 1500));
      try {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "TOO LATE" }] } }] }) });
      } catch {}
    });

    await openModelStep(page);
    await page.locator("#api-key").fill("MAIN-TEST-KEY");
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("button", { name: "開始故事" }).click();
    const input = page.locator("#user-input");
    await input.fill("這句取消後要回到輸入框");
    const send = page.getByRole("button", { name: "送出訊息" });
    await send.click();
    const cancel = page.getByRole("button", { name: "取消生成" });
    await expect(cancel).toBeVisible();
    await send.evaluate(button => button.click());
    await cancel.click();

    await expect(cancel).toBeHidden();
    await expect(send).toBeEnabled();
    await expect(input).toHaveValue("這句取消後要回到輸入框");
    await expect(page.locator("#chat-stream")).toContainText("已取消本次生成");
    const state = await page.evaluate(() => ({ messages: Chat.messages.length, pending: App.__requestPending }));
    expect(state).toEqual({ messages: 0, pending: false });
    expect(providerRequests).toBe(1);
  });

  test("main story renders Gemini SSE deltas and keeps the final reply", async ({ page }) => {
    let requestBody = null;
    let requestUrl = "";
    await page.route("https://generativelanguage.googleapis.com/**", async route => {
      requestUrl = route.request().url();
      requestBody = route.request().postDataJSON();
      const events = [
        { candidates: [{ content: { parts: [{ text: "第一段故事" }] } }] },
        { candidates: [{ content: { parts: [{ text: "，接著第二段。" }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 6, totalTokenCount: 15 } }
      ];
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: events.map(data => `data: ${JSON.stringify(data)}\n\n`).join("") });
    });

    await openModelStep(page);
    await page.locator("#api-key").fill("MAIN-TEST-KEY");
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("button", { name: "開始故事" }).click();
    await page.evaluate(() => {
      window.__baoStreamEvents = [];
      window.addEventListener("bao:stream-delta", event => window.__baoStreamEvents.push(event.detail.text));
    });
    await page.locator("#user-input").fill("請繼續故事");
    await page.getByRole("button", { name: "送出訊息" }).click();

    await expect(page.locator("#chat-stream")).toContainText("第一段故事，接著第二段。");
    expect(requestBody.stream).toBeUndefined();
    expect(requestUrl).toContain(":streamGenerateContent?alt=sse");
    expect(await page.evaluate(() => window.__baoStreamEvents)).toEqual(["第一段故事", "第一段故事，接著第二段。"]);
    expect(await page.evaluate(() => Chat.messages.at(-1).content)).toBe("第一段故事，接著第二段。");
  });

  test("only the latest AI reply exposes state-changing edit tools", async ({ page }) => {
    await openDemoStory(page);
    await page.evaluate(() => {
      Chat.messages = Chat.ensureMessageIds([
        { role: "user", content: "第一輪玩家" },
        { role: "assistant", content: "第一輪角色" },
        { role: "user", content: "第二輪玩家" },
        { role: "assistant", content: "第二輪角色" }
      ]);
      App.renderChatShell(false);
    });
    const replies = page.locator("#chat-stream > .message.assistant");
    await expect(replies).toHaveCount(2);
    await expect(replies.nth(0).locator("[data-edit]")).toBeDisabled();
    await expect(replies.nth(0).locator("[data-rewrite]")).toBeDisabled();
    await expect(replies.nth(0).locator("[data-regenerate]")).toBeDisabled();
    await expect(replies.nth(1).locator("[data-edit]")).toBeEnabled();
    await expect(replies.nth(1).locator("[data-rewrite]")).toBeEnabled();
    await expect(replies.nth(1).locator("[data-regenerate]")).toBeEnabled();
  });

  test("a saved AI reply can fork into an independently restorable story branch", async ({ page }) => {
    await openDemoStory(page);
    const ids = await page.evaluate(async () => {
      Chat.messages = Chat.ensureMessageIds([
        { role: "user", content: "第一輪玩家" },
        { role: "assistant", content: "第一輪角色" }
      ]);
      GameState.current.time = "分岔前的夜晚";
      GameState.current.location = "舊城";
      App.renderChatShell(false);
      App.saveStory(false);
      await BAOStoryLibrary.flush();
      const firstAssistantId = Chat.messages[1].id;
      Chat.messages.push(...Chat.ensureMessageIds([
        { role: "user", content: "沿主線前進" },
        { role: "assistant", content: "主線抵達城門" }
      ]));
      GameState.current.time = "主線清晨";
      GameState.current.location = "城門";
      App.renderChatShell(false);
      App.saveStory(false);
      await BAOStoryLibrary.flush();
      return { firstAssistantId, source: BAOStoryLibrary.refs() };
    });

    page.on("dialog", dialog => dialog.type() === "prompt" ? dialog.accept("拒絕合作線") : dialog.accept());
    const firstReply = page.locator("#chat-stream > .message.assistant").first();
    await expect(firstReply.getByRole("button", { name: /從這裡分支/ })).toBeVisible();
    await firstReply.getByRole("button", { name: /從這裡分支/ }).click();
    await expect.poll(() => page.evaluate(() => BAOStoryLibrary.refs().parentChapterId)).toBe(ids.source.chapterId);

    const fork = await page.evaluate(() => ({
      messages: Chat.messages.map(message => message.content),
      time: GameState.current.time,
      location: GameState.current.location,
      refs: BAOStoryLibrary.refs()
    }));
    expect(fork.messages).toEqual(["第一輪玩家", "第一輪角色"]);
    expect(fork.time).toBe("分岔前的夜晚");
    expect(fork.location).toBe("舊城");
    expect(fork.refs.branchPointMessageId).toBe(ids.firstAssistantId);

    await page.evaluate(async () => {
      Chat.add("user", "只在分支出現的選擇");
      Chat.add("assistant", "分支抵達碼頭");
      GameState.current.location = "碼頭";
      App.renderChatShell(false);
      App.saveStory(false);
      await BAOStoryLibrary.flush();
    });

    await page.locator("#story-branch-button").click();
    await expect(page.getByRole("heading", { name: "故事分支" })).toBeVisible();
    const mainRow = page.locator(".story-branch-row").filter({ hasText: "第一章" });
    await mainRow.getByRole("button", { name: "切換" }).click();
    await expect.poll(() => page.evaluate(() => GameState.current.location)).toBe("城門");
    const source = await page.evaluate(() => ({ messages: Chat.messages.map(message => message.content), refs: BAOStoryLibrary.refs() }));
    expect(source.messages).toEqual(["第一輪玩家", "第一輪角色", "沿主線前進", "主線抵達城門"]);
    expect(source.refs.chapterId).toBe(ids.source.chapterId);
  });

  test("desktop keeps the summary and editor controls in three columns", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openDemoCanon(page);
    await seedDraft(page);
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      deskWidth: Math.round(document.querySelector(".memory-desk").getBoundingClientRect().width),
      summaryColumns: getComputedStyle(document.querySelector(".canon-summary")).gridTemplateColumns.split(" ").length,
      controlColumns: getComputedStyle(document.querySelector(".canon-book-controls")).gridTemplateColumns.split(" ").length,
      visibleBooks: [...document.querySelectorAll(".canon-book")].filter(node => node.getBoundingClientRect().height > 0).length
    }));
    expect(layout.viewport).toBe(1440);
    expect(layout.documentWidth).toBeLessThanOrEqual(1440);
    expect(layout.deskWidth).toBeGreaterThan(900);
    expect(layout.summaryColumns).toBe(3);
    expect(layout.controlColumns).toBe(3);
    expect(layout.visibleBooks).toBe(6);
  });

  test("mobile uses one-column controls without horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemoCanon(page);
    await seedDraft(page);
    const layout = await page.evaluate(() => {
      const desk = document.querySelector(".memory-desk").getBoundingClientRect();
      const nav = document.querySelector(".memory-desk-nav");
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        deskLeft: Math.round(desk.left),
        deskWidth: Math.round(desk.width),
        summaryColumns: getComputedStyle(document.querySelector(".canon-summary")).gridTemplateColumns.split(" ").length,
        controlColumns: getComputedStyle(document.querySelector(".canon-book-controls")).gridTemplateColumns.split(" ").length,
        actionColumns: getComputedStyle(document.querySelector(".canon-actions")).gridTemplateColumns.split(" ").length,
        navCanScroll: nav.scrollWidth > nav.clientWidth
      };
    });
    expect(layout.viewport).toBe(390);
    expect(layout.documentWidth).toBeLessThanOrEqual(390);
    expect(layout.deskLeft).toBe(0);
    expect(layout.deskWidth).toBe(390);
    expect(layout.summaryColumns).toBe(1);
    expect(layout.controlColumns).toBe(1);
    expect(layout.actionColumns).toBe(1);
    expect(layout.navCanScroll).toBe(true);
  });

  test("no-API demo refuses Canon generation without provider traffic", async ({ page }) => {
    const providerRequests = [];
    page.on("request", request => {
      if (/openrouter\.ai|anthropic\.com|generativelanguage\.googleapis\.com|api\.openai\.com/.test(request.url())) providerRequests.push(request.url());
    });
    await openDemoCanon(page);
    await page.evaluate(() => {
      Chat.messages = Chat.ensureMessageIds([
        { role: "user", content: "測試玩家訊息" },
        { role: "assistant", content: "測試角色回覆" }
      ]);
      BAOMemoryWorkbench.refresh(document.querySelector(".memory-desk-backdrop"), "canon");
    });
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: /更新近期 Canon/ }).click();
    await expect(page.locator("[data-canon-progress]")).toContainText("請先連接玩家自己的 API");
    expect(providerRequests).toEqual([]);
  });
});
