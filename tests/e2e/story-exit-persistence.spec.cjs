const { test, expect } = require("@playwright/test");

const openModelStep = async page => {
  await page.goto("/");
  await page.waitForFunction(() => window.BAOExtensionLoadHealth?.snapshot().story === "ready"
    && BAOExtensionLoadHealth.snapshot().world === "ready" && Storage.status().ready);
  await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();
  await page.locator('#home-view [data-view="explore"]').click();
  const card = page.locator("article").filter({ hasText: "林沉風 - 見過黑暗的人" });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "下一步" }).click();
  await page.locator('#api-type').selectOption('gemini');
  await expect(page.locator("#test-api")).toBeVisible();
};

for (const width of [390, 1440]) {
  test(`cancel then exit persists settled history across reload and retry (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let requests = 0;
    await page.route('https://generativelanguage.googleapis.com/**', async route => {
      requests++;
      if (requests === 1) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        try { await route.abort(); } catch {}
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: '重試成功，故事繼續。' }] }, finishReason: 'STOP' }]
        }) });
      }
    });
    await openModelStep(page);
    await page.locator('#api-key').fill('MAIN-TEST-KEY');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByRole('button', { name: '開始故事' }).click();
    const before = await page.evaluate(async () => {
      App.config.memory.mode = 'full';
      App.config.stateTracking = false;
      App.config.cost = { ...App.config.cost, stateInterval: 1000 };
      App.saveStory(false);
      const refs = BAOStoryLibrary.refs();
      await BAOStoryLibrary.flush(refs.storyId);
      return { messages: JSON.stringify(Chat.messages), refs };
    });
    await page.locator('#user-input').fill('取消後不應留在存檔');
    await page.getByRole('button', { name: '送出訊息' }).click();
    await expect.poll(() => requests).toBe(1);
    await page.evaluate(() => App.exitChat());
    await expect(page.locator('#detail-view')).toHaveClass(/active/);
    const saved = await page.evaluate(async refs => {
      await Storage.flush();
      await BAOStoryLibrary.flush(refs.storyId);
      return { auto: JSON.stringify(Storage.loadStory().chat.messages),
        library: JSON.stringify((await BAOStoryLibrary.reconstruct(refs.storyId, refs.chapterId)).chat.messages) };
    }, before.refs);
    expect(saved).toEqual({ auto: before.messages, library: before.messages });
    await page.reload();
    await page.waitForFunction(() => BAOExtensionLoadHealth.snapshot().story === 'ready' && Storage.status().ready);
    expect(await page.evaluate(() => JSON.stringify(Storage.loadStory().chat.messages))).toBe(before.messages);
    await page.evaluate(() => {
      const save = Storage.loadStory();
      if (!Storage.restoreStory(save)) throw new Error('Restore failed');
      App.config.api.key = 'MAIN-TEST-KEY';
      GameState.current.config = App.config;
      App.renderChatShell(false);
      App.showView('chat');
    });
    await page.locator('#user-input').fill('繼續這個故事');
    await page.getByRole('button', { name: '送出訊息' }).click();
    await expect(page.locator('#chat-stream')).toContainText('重試成功，故事繼續。');
    await page.waitForFunction(() => !App.__requestPending && !App.__sendMessageTasks?.size);
    expect(await page.evaluate(() => Chat.messages.filter(m => m.role === 'user').map(m => m.content))).toEqual(['繼續這個故事']);
    expect(requests).toBe(2);
  });

}
