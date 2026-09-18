const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

for (const width of [390, 1440]) {
  test(`native autonomous NPC story and isolated memory at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await page.waitForFunction(() => window.App?.characters?.some(c => c.id === 'autonomous-npc-world') && App.__nativeAutonomousWorldStart && window.BAOMemoryWorkbench && document.getElementById('bao-demo-mode'));

    const greeting = await page.evaluate(() => {
      App.openCharacter('autonomous-npc-world');
      App.openBuilder();
      return App.activeCharacter.greeting;
    });
    await expect(page.locator('#autonomous-world-setup')).toHaveCount(0);
    await expect(page.locator('#aw-display-options')).toHaveCount(0);
    await expect(page.locator('input[name="narrative-mode"][value="world"]')).toBeChecked();
    await page.evaluate(() => { document.getElementById('bao-demo-mode').checked = true; App.startStory(); });
    await expect(page.locator('#chat-view')).toBeVisible();
    await expect(page.locator('#chat-stream .message.assistant .bubble').first()).toHaveText(greeting);
    await page.evaluate(() => {
      BAOMemoryWorkbench.writeSlots([{ id: 'world-note', title: '世界觀', text: '世界A獨有祕密：流星花園', enabled: true }]);
    });
    expect(await page.evaluate(() => App.buildSystemPrompt())).toContain('世界A獨有祕密：流星花園');
    expect(await page.evaluate(() => { Chat.add('user', '隨機生成'); return App.buildSystemPrompt(); })).toContain(greeting);
    const slot = await page.evaluate(() => { Chat.messages.pop(); App.saveStory(false); return Storage.saveSlot('世界A'); });
    expect(slot.state.memorySlots[0].text).toContain('世界A獨有祕密');

    await page.evaluate(() => {
      App.openCharacter('linchenfeng');
      App.openBuilder();
      document.getElementById('bao-demo-mode').checked = true;
      App.startStory();
    });
    expect(await page.evaluate(() => App.buildSystemPrompt())).not.toContain('世界A獨有祕密');
    expect(await page.evaluate(() => BAOMemoryWorkbench.readSlots().some(s => s.text.includes('世界A獨有祕密')))).toBe(false);

    expect(await page.evaluate(() => Storage.restoreStory(Storage.listSlots().find(s => s.label === '世界A')))).toBe(true);
    expect(await page.evaluate(() => App.buildSystemPrompt())).toContain('世界A獨有祕密：流星花園');
  });
}
