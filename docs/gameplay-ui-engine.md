# BAO/LAB Gameplay UI Engine v1

這是一個**角色卡明確 opt-in 才會啟用**的通用遊戲介面層。它不取代既有角色卡 UI，也不要求現有作品遷移。

## 相容原則

- 沒有 `gameplay_ui` 的角色卡：完全沿用目前流程。
- 既有 `k-idol-survival-simulator-ui.js`、`night-sky-magic-academy-ui.js` 等專屬 UI：本 PR 不遷移、不刪除。
- 新引擎只讀取角色卡聲明的安全 schema；不允許 schema 讀取 API Key、故事儲存層或任意 DOM。
- Builder 寫入目標只允許 `modules.*`，因此角色初始選擇會成為 GameState 的世界模組資料。
- 行動按鈕只把文字填進玩家輸入框，不會替玩家自動送出。

## v1 支援

### Builder
- 共用點數池
- `+ / -` 屬性配置
- select / text / number / boolean 欄位
- 建立故事時把結果寫入指定 `modules.*` 路徑

### UI Panel
- meter：HP、MP、靈力、壓力等
- stats：屬性、身份、境界、排名等
- list：事件、任務、背包摘要等
- actions：填入玩家草稿的互動按鈕
- 自訂 panel tab；既有「記憶」等原生 tab 仍保留

## 範例

測試卡位於：

`tests/fixtures/gameplay-ui-demo-character.json`

它不加入 `data/characters.json`，因此不會出現在正式探索頁。

核心結構：

```json
{
  "gameplay_ui": {
    "version": 1,
    "builder": {
      "point_pool": 6,
      "attributes": [
        {
          "key": "strength",
          "label": "力量",
          "base": 8,
          "min": 8,
          "max": 14,
          "target_path": "modules.player.strength"
        }
      ]
    },
    "panels": [
      {
        "id": "status",
        "label": "狀態",
        "sections": [
          {
            "type": "meters",
            "items": [
              {
                "label": "血",
                "value_path": "modules.player.hp",
                "max_path": "modules.player.max_hp"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

## 不在 v1 範圍

- 真正的戰鬥規則／傷害公式
- 可點擊節點地圖
- 裝備欄拖放
- 自動戰鬥執行器
- 把既有專屬卡片一次全部遷移

以上可以在引擎穩定後逐項加入；v1 的目的先是把「每張卡各寫一套 JS」改成可重用 schema 的底座。
