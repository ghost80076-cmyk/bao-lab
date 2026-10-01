const { test, expect } = require('@playwright/test');

async function prepareStory(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.goto('./');
  await page.waitForFunction(() => Boolean(
    window.BAOReaderContext &&
    window.BAOStorySurface &&
    window.BAOWorldModules &&
    window.BAOCharacterStatus &&
    App.characters?.length
  ));

  await page.evaluate(() => {
    App.activeCharacter = {
      ...App.characters[0],
      id: 'reader-context-desktop-test',
      name: '沈燈',
      world_modules: [
        {
          id: 'harbor_weather',
          label: '港灣天候',
          icon: '☾',
          context: 'relevant',
          tracking: 'medium',
          kind: 'object',
          fields: []
        }
      ],
      initial_state: {
        ...(App.characters[0].initial_state || {}),
        time: '深夜 23:40',
        location: '舊港燈塔',
        npcs: [
          { name:'白禾', role:'守塔人', mood:'警戒', location:'舊港燈塔', relationship:'舊識', presence:'present' },
          { name:'岑雨', role:'記者', mood:'疲倦', location:'報社', relationship:'合作', presence:'away' }
        ],
        modules: {
          harbor_weather: { sky:'薄雲', wind:'東北風', tide:'漲潮' }
        }
      }
    };
    App.config = {
      persona: { name:'旅人', gender:'未指定', identity:'訪客', personality:'', relationship:'舊識', extra:'' },
      narrativeMode:'world',
      displayMode:'ui',
      api:{ model:'mock-reader-context', baseUrl:'https://example.invalid', key:'not-a-real-key' },
      memory:{ maxRounds:20, maxContext:64000, mode:'smart', cache:true }
    };
    GameState.create(App.activeCharacter, App.config);
    BAOWorldModules.ensureState(App.activeCharacter);
    GameState.current.time = '深夜 23:40';
    GameState.current.location = '舊港燈塔';
    GameState.current.events = ['燈塔重新亮起。', '港口傳來第二聲汽笛。', '白禾確認東側棧橋封閉。'];
    GameState.current.npcs = [
      { name:'白禾', role:'守塔人', mood:'警戒', location:'舊港燈塔', relationship:'舊識', presence:'present' },
      { name:'岑雨', role:'記者', mood:'疲倦', location:'報社', relationship:'合作', presence:'away' }
    ];
    GameState.current.modules = { harbor_weather: { sky:'薄雲', wind:'東北風', tide:'漲潮' } };
    Chat.reset();
    Chat.add('assistant', '燈火落在濕冷的石階上。');
    Chat.add('user', '我抬頭看向燈塔。');
    Chat.add('assistant', '白禾正站在門邊等你。');
    Chat.summary = '旅人深夜抵達舊港燈塔；白禾守在入口，東側棧橋已封閉。';
    GameState.current.memory = ['東側棧橋因風浪封閉。'];
    App.renderChatShell(false);
    App.showView('chat');
    BAOStorySurface.sync();
  });
}

test('desktop Play opens a read-only Reader Context without reusing the Studio game UI', async ({ page }) => {
  await prepareStory(page);

  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
  const info = page.locator('#bao-play-status-toggle');
  await expect(info).toBeVisible();
  await expect(info).toHaveAttribute('aria-controls', 'bao-reader-context');
  await expect(info).toHaveAttribute('aria-label', '查看故事資訊');
  await expect(page.locator('#game-ui')).toBeHidden();

  await info.click();

  const dialog = page.getByRole('dialog', { name:'故事資訊' });
  await expect(dialog).toBeVisible();
  await expect(info).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#game-ui')).toBeHidden();
  await expect(page.locator('#chat-view')).not.toHaveClass(/bao-play-status-open/);

  await expect(dialog.getByRole('tab', { name:'現況' })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog).toContainText('深夜 23:40');
  await expect(dialog).toContainText('舊港燈塔');
  await expect(dialog).toContainText('白禾');
  await expect(dialog).toContainText('燈塔重新亮起。');

  await dialog.getByRole('tab', { name:'人物' }).click();
  await expect(dialog).toContainText('守塔人');
  await expect(dialog).toContainText('警戒');
  await expect(dialog).toContainText('岑雨');
  await expect(dialog).toContainText('離場');

  await dialog.getByRole('tab', { name:'世界' }).click();
  await expect(dialog).toContainText('港灣天候');
  await expect(dialog).toContainText('薄雲');
  await expect(dialog).toContainText('東北風');

  await dialog.getByRole('tab', { name:'記憶' }).click();
  await expect(dialog).toContainText('智慧記憶');
  await expect(dialog).toContainText('旅人深夜抵達舊港燈塔');
  await expect(dialog).toContainText('東側棧橋因風浪封閉。');

  await dialog.getByRole('button', { name:'關閉故事資訊' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(info).toHaveAttribute('aria-expanded', 'false');
});

test('Studio keeps its existing editable information surface', async ({ page }) => {
  await prepareStory(page);

  await page.locator('#bao-surface-mode-toggle').click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'studio');

  const info = page.locator('#bao-play-status-toggle');
  await expect(info).toHaveAttribute('aria-controls', 'game-ui');
  await info.click();

  await expect(page.locator('#game-ui')).toBeVisible();
  await expect(page.locator('#bao-reader-context')).toHaveCount(0);
  await expect(page.locator('#chat-view')).toHaveClass(/bao-play-status-open/);
});

test('compact layouts keep the existing mobile information behavior', async ({ page }) => {
  await prepareStory(page, { width:390, height:844 });

  const info = page.locator('#bao-play-status-toggle');
  await expect(info).toBeVisible();
  await expect(info).toHaveAttribute('aria-controls', 'game-ui');
  await info.click();

  await expect(page.locator('#game-ui')).toBeVisible();
  await expect(page.locator('#bao-reader-context')).toHaveCount(0);
});
