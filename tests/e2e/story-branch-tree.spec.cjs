const { test, expect } = require("@playwright/test");

const openModelStep = async page => {
  await page.goto("/");
  await page.waitForFunction(() => window.BAOExploreDiscovery && App.characters?.length);
  await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();
  await page.locator('#home-view [data-view="explore"]').click();
  const card = page.locator("article").filter({ hasText: "林沉風 - 見過黑暗的人" });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.locator("#test-api")).toBeVisible();
};

const openDemoStory = async page => {
  await openModelStep(page);
  await page.locator("#bao-demo-mode").check();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await expect(page.locator("#user-input")).toBeVisible();
};

const seedNestedBranches = async page => page.evaluate(async () => {
  Chat.messages = Chat.ensureMessageIds([
    { role: "user", content: "第一輪玩家" },
    { role: "assistant", content: "第一輪角色" }
  ]);
  Chat.summary = "主線起點摘要";
  GameState.current.time = "深夜";
  GameState.current.location = "舊城";
  GameState.current.contextPack = { id: "main-base-pack", summary: "主線起點" };
  App.renderChatShell(false);
  App.saveStory(false);
  await BAOStoryLibrary.flush();
  const firstAssistantId = Chat.messages[1].id;

  Chat.add("user", "沿主線前進");
  Chat.add("assistant", "主線抵達城門");
  Chat.summary = "主線摘要";
  GameState.current.time = "清晨";
  GameState.current.location = "城門";
  GameState.current.contextPack = { id: "main-pack", summary: "主線目前進度" };
  App.saveStory(false);
  await BAOStoryLibrary.flush();
  const mainRefs = BAOStoryLibrary.refs();

  const branchSave = await BAOStoryLibrary.createBranch(firstAssistantId, "秘密線");
  Storage.restoreStory(branchSave);
  Chat.summary = "秘密線摘要";
  GameState.current.time = "凌晨";
  GameState.current.location = "碼頭";
  GameState.current.contextPack = { id: "secret-pack", summary: "秘密線目前進度" };
  Chat.add("user", "只走秘密線");
  Chat.add("assistant", "秘密線抵達碼頭");
  App.saveStory(false);
  await BAOStoryLibrary.flush();
  const branchRefs = BAOStoryLibrary.refs();
  const branchAssistantId = Chat.messages.at(-1).id;

  const childSave = await BAOStoryLibrary.createBranch(branchAssistantId, "地下線");
  Storage.restoreStory(childSave);
  Chat.summary = "地下線摘要";
  GameState.current.time = "凌晨兩點";
  GameState.current.location = "地下室";
  GameState.current.contextPack = { id: "underground-pack", summary: "地下線目前進度" };
  Chat.add("user", "繼續深入地下");
  Chat.add("assistant", "地下線打開暗門");
  App.renderChatShell(false);
  App.saveStory(false);
  await BAOStoryLibrary.flush();
  const childRefs = BAOStoryLibrary.refs();

  return { mainRefs, branchRefs, childRefs };
});

const snapshot = page => page.evaluate(() => ({
  location: GameState.current.location,
  time: GameState.current.time,
  summary: Chat.summary,
  contextPackId: GameState.current.contextPack?.id || "",
  messages: Chat.messages.map(message => message.content),
  refs: BAOStoryLibrary.refs()
}));

test.describe("Story branch tree", () => {
  for (const width of [390, 1440]) test(`sync write failures preserve local progress and recover (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      window.google = { accounts: { oauth2: { initTokenClient: () => {
        const client = { callback: null, requestAccessToken() {
          queueMicrotask(() => client.callback({ access_token: 'fixture-token', expires_in: 3600 }));
        } };
        return client;
      } } } };
    });
    await page.route('**/js/google-drive-config.js*', route => route.fulfill({ contentType: 'application/javascript',
      body: 'window.BAOGoogleDriveConfig={clientId:"fixture.apps.googleusercontent.com"};' }));
    const uploads = [];
    await page.route('https://www.googleapis.com/**', async route => {
      const request = route.request(), url = request.url();
      if (url.includes('/about?')) return route.fulfill({ json: { user: { permissionId: 'fixture-account' } } });
      if (request.method() === 'GET' && url.includes('/files?')) return route.fulfill({ json: { files: [], incompleteSearch: false } });
      if (request.method() === 'POST' && url.includes('/upload/drive/v3/files?')) {
        const body = request.postData();
        uploads.push(body);
        const name = /"name":"([^"]+)"/.exec(body)?.[1];
        return route.fulfill({ json: { id: 'fixture-file', name, version: '1' } });
      }
      throw new Error('Unexpected Drive request: ' + request.method() + ' ' + url);
    });
    await openDemoStory(page);
    await page.waitForFunction(() => window.BAOGoogleDriveSync);
    const before = await page.evaluate(async () => {
      await BAOGoogleDriveSync.connect();
      App.saveStory(false);
      const refs = BAOStoryLibrary.refs();
      await BAOStoryLibrary.flush(refs.storyId);
      Chat.add('user', '同步失敗後仍保留');
      Chat.add('assistant', '這是本機已確認的故事進度。');
      Chat.summary = '同步失敗測試摘要';
      GameState.current.location = '測試碼頭';
      window.__integrationPersist = BAOStoryLibrary.persist;
      BAOStoryLibrary.persist = async () => { throw new Error('injected sync write failure'); };
      const result = await BAOGoogleDriveSync.sync();
      return { errors: result.errors.length, uploaded: result.uploaded,
        messages: Chat.messages.map(({ id, role, content }) => ({ id, role, content })), summary: Chat.summary, location: GameState.current.location, refs };
    });
    expect(before.errors).toBe(1);
    expect(before.uploaded).toBe(0);
    expect(uploads).toHaveLength(0);
    const recovered = await page.evaluate(async refs => {
      BAOStoryLibrary.persist = window.__integrationPersist;
      delete window.__integrationPersist;
      const result = await BAOGoogleDriveSync.sync();
      await Storage.flush();
      await BAOStoryLibrary.flush(refs.storyId);
      const saved = await BAOStoryLibrary.reconstruct(refs.storyId, refs.chapterId);
      return { errors: result.errors.length, uploaded: result.uploaded,
        messages: saved.chat.messages.map(({ id, role, content }) => ({ id, role, content })), summary: saved.chat.summary, location: saved.state.location };
    }, before.refs);
    expect(recovered).toEqual({ errors: 0, uploaded: 1, messages: before.messages, summary: before.summary, location: before.location });
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toContain(before.summary);
    await page.reload();
    await page.waitForFunction(() => Storage.status().ready && window.BAOStoryLibrary);
    const afterReload = await page.evaluate(() => ({ messages: Storage.loadStory().chat.messages.map(({ id, role, content }) => ({ id, role, content })),
      summary: Storage.loadStory().chat.summary, location: Storage.loadStory().state.location }));
    expect(afterReload).toEqual({ messages: before.messages, summary: before.summary, location: before.location });
  });

  for (const width of [390, 1440]) test(`failed source writes preserve progress and allow retry (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openDemoStory(page);
    const ids = await seedNestedBranches(page);
    const result = await page.evaluate(async ids => {
      Chat.summary = '未保存的新摘要';
      GameState.current.location = '未保存的新地點';
      const source = { messages: JSON.stringify(Chat.messages), summary: Chat.summary, location: GameState.current.location };
      const persist = BAOStoryLibrary.persist;
      BAOStoryLibrary.persist = async function(payload) {
        if (payload._library.chapterId === ids.childRefs.chapterId) throw new Error('injected chapter write failure');
        return persist.call(this, payload);
      };
      let error = '';
      try { await BAOStoryBranches.restore(ids.mainRefs.storyId, ids.mainRefs.chapterId); }
      catch (failure) { error = failure.message; }
      finally { BAOStoryLibrary.persist = persist; }
      return { error, source, after: { messages: JSON.stringify(Chat.messages), summary: Chat.summary,
        location: GameState.current.location }, chapterId: BAOStoryLibrary.refs().chapterId };
    }, ids);
    expect(result.error).toContain('儲存');
    expect(result.after).toEqual(result.source);
    expect(result.chapterId).toBe(ids.childRefs.chapterId);
    const retry = await page.evaluate(async ids => {
      const ok = await BAOStoryBranches.restore(ids.mainRefs.storyId, ids.mainRefs.chapterId);
      await Storage.flush();
      await BAOStoryLibrary.flush(ids.mainRefs.storyId);
      const prior = await BAOStoryLibrary.reconstruct(ids.childRefs.storyId, ids.childRefs.chapterId);
      return { ok, priorSummary: prior.chat.summary, priorLocation: prior.state.location,
        currentChapter: BAOStoryLibrary.refs().chapterId };
    }, ids);
    expect(retry).toEqual({ ok: true, priorSummary: result.source.summary, priorLocation: result.source.location,
      currentChapter: ids.mainRefs.chapterId });
    await page.reload();
    await page.waitForFunction(() => Storage.status().ready && window.BAOStoryLibrary);
    expect(await page.evaluate(() => Storage.loadStory()._library.chapterId)).toBe(ids.mainRefs.chapterId);
  });

  test("nested branches show lineage and restore isolated memory and world state", async ({ page }) => {
    await openDemoStory(page);
    const ids = await seedNestedBranches(page);

    await page.evaluate(() => BAOStoryBranches.open());
    await expect(page.getByRole("heading", { name: "故事分支" })).toBeVisible();
    await expect(page.locator(".story-branch-current-path")).toContainText("第一章");
    await expect(page.locator(".story-branch-current-path")).toContainText("秘密線");
    await expect(page.locator(".story-branch-current-path")).toContainText("地下線");
    await expect(page.locator(".story-branch-node")).toHaveCount(3);
    await expect(page.locator('.story-branch-node[data-depth="0"]')).toHaveCount(1);
    await expect(page.locator('.story-branch-node[data-depth="1"]')).toHaveCount(1);
    await expect(page.locator('.story-branch-node[data-depth="2"]')).toHaveCount(1);

    const mainRow = page.locator(`[data-chapter="${ids.mainRefs.chapterId}"]`);
    const secretRow = page.locator(`[data-chapter="${ids.branchRefs.chapterId}"]`);
    const childRow = page.locator(`[data-chapter="${ids.childRefs.chapterId}"]`);
    await expect(secretRow).toContainText("從「第一章」分出");
    await expect(childRow).toContainText("從「秘密線」分出");
    await expect(childRow).toHaveAttribute("aria-current", "true");

    await mainRow.getByRole("button", { name: "切換" }).click();
    await expect.poll(() => page.evaluate(() => GameState.current.location)).toBe("城門");
    expect(await snapshot(page)).toMatchObject({
      location: "城門",
      time: "清晨",
      summary: "主線摘要",
      contextPackId: "main-pack",
      refs: { chapterId: ids.mainRefs.chapterId }
    });

    await page.evaluate(() => BAOStoryBranches.open());
    await page.locator(`[data-chapter="${ids.branchRefs.chapterId}"]`).getByRole("button", { name: "切換" }).click();
    await expect.poll(() => page.evaluate(() => GameState.current.location)).toBe("碼頭");
    expect(await snapshot(page)).toMatchObject({
      location: "碼頭",
      time: "凌晨",
      summary: "秘密線摘要",
      contextPackId: "secret-pack",
      refs: { chapterId: ids.branchRefs.chapterId }
    });

    await page.evaluate(() => BAOStoryBranches.open());
    await page.locator(`[data-chapter="${ids.childRefs.chapterId}"]`).getByRole("button", { name: "切換" }).click();
    await expect.poll(() => page.evaluate(() => GameState.current.location)).toBe("地下室");
    expect(await snapshot(page)).toMatchObject({
      location: "地下室",
      time: "凌晨兩點",
      summary: "地下線摘要",
      contextPackId: "underground-pack",
      refs: { chapterId: ids.childRefs.chapterId }
    });
  });

  test("mobile branch tree stays readable without horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemoStory(page);
    await seedNestedBranches(page);
    await page.getByRole('button', { name: '開啟控制中心', exact: true }).click();
    await page.getByRole('searchbox', { name: '搜尋故事工具' }).fill('故事分支');
    await page.getByRole('dialog', { name: '故事功能選單' }).getByRole('button', { name: /故事分支/ }).click();
    await expect(page.getByRole("heading", { name: "故事分支" })).toBeVisible();
    const modal = page.getByRole("dialog", { name: "故事分支" });
    await expect(modal.locator(".eyebrow")).toBeHidden();
    const help = modal.getByRole("button", { name: "故事分支說明" });
    await expect(help).toBeVisible();
    await expect(modal.locator("#story-branches-intro")).toBeHidden();
    await help.click();
    await expect(modal.locator("#story-branches-intro")).toBeVisible();
    await help.click();
    await expect(modal.locator("#story-branches-intro")).toBeHidden();

    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      modalWidth: Math.round(document.querySelector(".story-branches-modal").getBoundingClientRect().width),
      treeWidth: Math.round(document.querySelector(".story-branch-tree").getBoundingClientRect().width),
      deepestWidth: Math.round(document.querySelector('.story-branch-node[data-depth="2"] .story-branch-row').getBoundingClientRect().width),
      backdropAlign: getComputedStyle(document.querySelector(".story-branches-backdrop")).alignItems,
      modalRadius: getComputedStyle(document.querySelector(".story-branches-modal")).borderBottomLeftRadius
    }));
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.modalWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.treeWidth).toBeGreaterThan(250);
    expect(layout.deepestWidth).toBeGreaterThan(220);
    expect(layout.backdropAlign).toBe("flex-end");
    expect(layout.modalRadius).toBe("0px");
  });
});
