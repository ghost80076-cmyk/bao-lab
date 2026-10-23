const { test, expect } = require("@playwright/test");

for (const width of [390, 1280]) {
  test("Creator NPC four axes only insert approved content into existing story card fields (" + width + "px)", async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./character-studio.html");
    await page.waitForFunction(() => Boolean(window.BAOCharacterStudio && window.BAONPCPersonalityHelper && window.BAOLorebook));
    await page.locator('[data-creation-route="lorebook"]').click();
    const details = page.locator("#studio-npc-personality");
    await expect(details).toBeVisible();
    await details.locator("summary").click();
    const name=details.locator('[name="npc_axes_name"]');
    await name.fill("林曼");
    await details.locator('[name="npc_axes_aliases"]').fill("Queen_13, 老大");
    await details.locator('[name="npc_axes_cause"]').fill("被親近的人拋棄過。");
    await details.locator('[name="npc_axes_behavior"]').fill("平時冷靜、話少。");
    await details.locator('[name="npc_axes_trigger"]').fill("有人無故失約。");
    await details.locator('[name="npc_axes_cost"]').fill("傷害與朋友的信任。");
    const original = await page.locator('[name="lore"]').inputValue();
    const originalStudioStatus = await page.locator("#studio-status").textContent();

    await details.getByRole("button", {name:"預覽整理結果"}).click();
    await expect(details.locator("[data-npc-personality-preview]")).toContainText("成因：被親近的人拋棄過。");
    await expect(page.locator('[name="lore"]')).toHaveValue(original);
    await expect(page.locator("#studio-status")).toHaveText(originalStudioStatus);

    await details.getByRole("button", {name:"加入角色卡（不自動儲存）"}).click();
    const lore=await page.locator('[name="lore"]').inputValue();
    expect(lore).toContain("【世界書：人格四軸·林曼｜林曼,Queen_13,老大】");
    expect(lore).toContain("代價：傷害與朋友的信任。");
    expect(await page.locator('[name="profile"]').inputValue()).not.toContain("人格四軸·林曼");
    expect((lore.match(/【世界書：人格四軸·林曼/g)||[]).length).toBe(1);
    const parsed=await page.evaluate(() => BAOLorebook.parse(document.querySelector('[name="lore"]').value));
    expect(parsed.entries.some(item => item.label === "人格四軸·林曼")).toBe(true);
    const exported=await page.evaluate(() => BAOCharacterStudio.toExport(BAOCharacterStudio.readCard()));
    expect(exported.content.lore).toContain("人格四軸·林曼");
    expect(exported.content.npc_rules).toBe("");

    await details.getByRole("button", {name:"加入角色卡（不自動儲存）"}).click();
    expect(await page.locator('[name="lore"]').inputValue()).toBe(lore);
    await expect(details.locator("[data-npc-personality-status]")).toContainText("沒有重複插入");

    await details.locator('[name="npc_axes_cost"]').fill("終於願意求助他人。");
    page.once("dialog", dialog => dialog.accept());
    await details.getByRole("button", {name:"加入角色卡（不自動儲存）"}).click();
    const updated=await page.locator('[name="lore"]').inputValue();
    expect(updated).toContain("終於願意求助他人");
    expect(updated).not.toContain("傷害與朋友的信任");
    expect((updated.match(/【世界書：人格四軸·林曼/g)||[]).length).toBe(1);

    await name.fill("沈知晚");
    await details.locator('[name="npc_axes_destination"]').selectOption("profile");
    await details.getByRole("button", {name:"加入角色卡（不自動儲存）"}).click();
    expect(await page.locator('[name="profile"]').inputValue()).toContain("【人物四軸：沈知晚】");
    expect(await page.locator('[name="lore"]').inputValue()).toBe(updated);
    const mainExport=await page.evaluate(() => BAOCharacterStudio.toExport(BAOCharacterStudio.readCard()));
    expect(JSON.stringify(mainExport.content.profile)).toContain("人物四軸：沈知晚");

    // Reject attempts to invent the fourth axis.
    await details.locator('[name="npc_axes_trigger"]').fill("");
    await details.getByRole("button", {name:"預覽整理結果"}).click();
    await expect(details.locator("[data-npc-personality-status]")).toContainText("失控條件");
  });
}
