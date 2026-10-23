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
