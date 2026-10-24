const { test, expect } = require("@playwright/test");

for (const width of [390, 1280]) {
  test("story quick command packs export, preview and import locally without sending (" + width + "px)", async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    await page.waitForFunction(() => Boolean(window.BAOStoryQuickCommands && window.BAOStoryQuickCommandsCore && window.App));
    await page.evaluate(() => {
      GameState.current = {quickCommands:[{id:"player-1",label:"第三人稱",text:"以第三人稱描寫，不替我做重大決定。"}]};
      window._quickSaves = 0;
      App.saveStory = () => { window._quickSaves++; return true; };
      window.BAOStoryQuickCommands.open();
    });

    let dialog = page.getByRole("dialog", {name:"快捷指令"});
    const editor = dialog.locator(".story-quick-editor");
    await editor.locator("summary").click();
    await expect(editor.getByRole("button",{name:"匯出指令 JSON"})).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await editor.getByRole("button",{name:"匯出指令 JSON"}).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("yorubay-quick-commands.json");
    expect(await page.evaluate(() => window._quickSaves)).toBe(0);

    const newPack = {
      schema:"yorubay-quick-command-pack",version:1,commands:[
        {label:"第三人稱",text:"以第三人稱描寫，不替我做重大決定。"},
        {label:"慢節奏",text:"讓時間與角色行為自然推進。"},
        {label:"旁觀",text:"先觀察當前人物的行動，再讓我回應。"}
      ]
    };
    const chooser = editor.locator("[data-quick-file]");
    await chooser.setInputFiles({name:"sharing.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(newPack))});
    await expect(editor.locator("[data-quick-share-status]")).toContainText("請確認內容後再匯入");
    await expect(editor.locator("[data-quick-import-preview]")).toBeVisible();
    await expect(editor.locator("[data-quick-import-preview]")).toContainText("可新增 2 條");
    await expect(editor.locator("[data-quick-import-preview]")).toContainText("跳過重複 1 條");
    expect(await page.evaluate(() => GameState.current.quickCommands.length)).toBe(1);
    await editor.getByRole("button",{name:"取消",exact:true}).click();
    expect(await page.evaluate(() => window._quickSaves)).toBe(0);
    await expect(editor.locator("[data-quick-import-preview]")).toBeHidden();

    await chooser.setInputFiles({name:"sharing.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(newPack))});
    await editor.getByRole("button",{name:"確認加入本故事"}).click();
    dialog = page.getByRole("dialog",{name:"快捷指令"});
    await expect(dialog.getByRole("button",{name:/慢節奏/})).toBeVisible();
    await expect(dialog.getByRole("button",{name:/旁觀/})).toBeVisible();
    expect(await page.evaluate(() => GameState.current.quickCommands.length)).toBe(3);
    expect(await page.evaluate(() => window._quickSaves)).toBe(1);
    expect(await page.evaluate(() => Chat.messages.length)).toBe(0);

    await dialog.locator(".story-quick-editor > summary").click();
    const nextChooser = dialog.locator("[data-quick-file]");
    await nextChooser.setInputFiles({name:"sharing.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(newPack))});
    await expect(dialog.locator("[data-quick-share-status]")).toContainText("沒有可新增的指令");
    await expect(dialog.locator("[data-quick-import-preview]")).toBeHidden();
    expect(await page.evaluate(() => window._quickSaves)).toBe(1);

    await nextChooser.setInputFiles({name:"invalid.json",mimeType:"application/json",buffer:Buffer.from('{"schema":"unknown"}')});
    await expect(dialog.locator("[data-quick-share-status]")).toContainText("匯入失敗");
    expect(await page.evaluate(() => GameState.current.quickCommands.length)).toBe(3);
    expect(await page.evaluate(() => window._quickSaves)).toBe(1);
  });
}

const transferPack = {
  schema: 'yorubay-quick-command-pack', version: 1,
  commands: [{ label: '存檔往返', text: '保留環境描寫，重要決策交給我。' }]
};
const transferFile = () => ({ name: 'transfer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(transferPack)) });

async function openSavedStory(page, width) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => window.BAOStoryQuickCommands && window.BAOPromptOrchestrator && window.BAOStoryControlCenter && App.characters?.length && Storage.status().ready);
  await page.evaluate(() => {
    App.activeCharacter = App.characters[0];
    // A legacy story has no narrative authorization or quickCommands field.
    App.config = {
      persona: { name: '旅人' }, narrativeMode: 'world', displayMode: 'text',
      api: { model: 'offline-transfer-test', key: '', baseUrl: '' },
      memory: { mode: 'manual', maxRounds: 20, maxContext: 32000, cache: true }
    };
    BAONarrativeSettings.set({ playerPortrayal: 'coauthor' });
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', '港口的燈亮著。');
    App.showView('chat');
    App.renderChatShell(false);
    BAOStoryQuickCommands.open();
  });
  await page.locator('.story-quick-editor > summary').click();
}

for (const width of [390, 1280]) {
  test(`import survives real storage reload without granting legacy-story authorization (${width}px)`, async ({ page }) => {
    await openSavedStory(page, width);
    const before = await page.evaluate(() => ({
      chat: JSON.stringify(Chat.messages),
      narrative: App.config.narrative,
      mode: BAONarrativeSettings.playerPortrayal(App.config)
    }));
    expect(before.mode).toBe('strict');
    await page.locator('[data-quick-file]').setInputFiles(transferFile());
    await page.getByRole('button', { name: '確認加入本故事' }).click();
    // Use the production saveStory and IndexedDB/localStorage queue, not a stub.
    await page.evaluate(() => Storage.flush());
    await page.reload();
    await page.waitForFunction(() => window.BAOStoryQuickCommands && window.BAOPromptOrchestrator && window.BAOStoryControlCenter && Storage.status().ready);
    const restored = await page.evaluate(() => {
      const save = Storage.loadStory();
      if (!save || !Storage.restoreStory(save)) throw new Error('Saved story could not be restored');
      App.showView('chat');
      App.renderChatShell(false);
      BAOStoryQuickCommands.open();
      return {
        commands: GameState.current.quickCommands,
        chat: JSON.stringify(Chat.messages), narrative: App.config.narrative,
        mode: BAONarrativeSettings.playerPortrayal(App.config)
      };
    });
    expect(restored.commands.map(({ label, text }) => ({ label, text }))).toEqual(transferPack.commands);
    expect(restored.chat).toBe(before.chat);
    expect(restored.narrative).toEqual(before.narrative);
    expect(restored.mode).toBe('strict');
    await page.getByRole('button', { name: /存檔往返/ }).click();
    await expect(page.locator('#user-input')).toHaveValue(transferPack.commands[0].text);
    expect(await page.evaluate(() => JSON.stringify(Chat.messages))).toBe(before.chat);
  });

  test(`switching stories during file read or after preview cannot import into either story (${width}px)`, async ({ page }) => {
    await openSavedStory(page, width);
    await page.evaluate(() => {
      window.quickSource = GameState.current;
      window.quickOriginalFileText = File.prototype.text;
      File.prototype.text = function() {
        const file = this;
        window.quickReadStarted = true;
        return new Promise(resolve => { window.releaseQuickRead = async () => resolve(await quickOriginalFileText.call(file)); });
      };
    });
    await page.locator('[data-quick-file]').setInputFiles(transferFile());
    await page.waitForFunction(() => window.quickReadStarted);
    await page.evaluate(async () => {
      GameState.create(App.activeCharacter, structuredClone(App.config));
      window.quickDestination = GameState.current;
      await releaseQuickRead();
      File.prototype.text = quickOriginalFileText;
    });
    await expect(page.locator('[data-quick-import-preview]')).toBeHidden();
    expect(await page.evaluate(() => [quickSource.quickCommands || [], quickDestination.quickCommands || []])).toEqual([[], []]);

    // Reopen for this story, finish preview, then change owners before confirmation.
    await page.evaluate(() => BAOStoryQuickCommands.open());
    await page.locator('.story-quick-editor > summary').click();
    await page.locator('[data-quick-file]').setInputFiles(transferFile());
    await expect(page.locator('[data-quick-import-preview]')).toBeVisible();
    await page.evaluate(() => GameState.create(App.activeCharacter, structuredClone(App.config)));
    await page.getByRole('button', { name: '確認加入本故事' }).click();
    expect(await page.evaluate(() => [quickSource.quickCommands || [], quickDestination.quickCommands || [], GameState.current.quickCommands || []])).toEqual([[], [], []]);
    expect(await page.evaluate(() => Storage.loadStory())).toBeNull();
  });
}
