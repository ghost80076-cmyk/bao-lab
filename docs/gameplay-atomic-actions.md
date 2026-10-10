# 夜灣原生 Gameplay 動作（MVP）

本功能參考外部《無限超市》原型的「把數值判定留在前端」觀念，**不採用**其直接執行作品內 JavaScript 或與故事無關的 localStorage 存檔方式。

## 用途與啟用條件

只在作品自行提供 `gameplay_ui.panels[].sections[type="actions"].items[].effect` 時啟用；原有 `draft` 文字快捷按鈕完全不變。前端只會操作當前故事內已宣告、已啟用且屬於 `kind:"object"` 的 `world_modules` 整數欄位。

目前僅提供原子化整數加減，適合資金、補給數量、配額等計數器。原本以陣列儲存的內建 `inventory`（collection）仍不能直接使用此功能。不能拿來直接更改角色、時間、對話、外部服務、API Key 或其他玩家的資料。

## 最小範例

以下片段只示意**相關欄位**，不是一份完整可匯入角色卡：

```json
{
  "world_modules": [
    {"id": "economy", "kind": "object", "context": "core"},
    {"id": "supplies", "kind": "object", "context": "core"}
  ],
  "initial_state": {
    "modules": {
      "economy": {"crystals": 20},
      "supplies": {"cans": 0}
    }
  },
  "gameplay_ui": {
    "version": 1,
    "panels": [
      {
        "id": "shop",
        "label": "超市",
        "sections": [
          {
            "type": "actions",
            "title": "補給交易",
            "items": [
              {
                "label": "用 15 晶核購買罐頭",
                "effect": {
                  "changes": [
                    {"path": "modules.economy.crystals", "delta": -15},
                    {"path": "modules.supplies.cans", "delta": 1}
                  ],
                  "event": "已花費 15 晶核購買 1 份罐頭"
                }
              },
              {
                "label": "先向店員詢價",
                "draft": "我向店員詢問罐頭的價格。"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

按第一個按鈕，前端會先檢查兩個欄位均已初始化、都為非負安全整數且在操作後不會低於零或超過十億；兩筆修改必須同時通過，否則**都不寫入**。成功後更新當前故事的 world-module 計數、記入遊戲事件、呼叫夜灣既有故事儲存與 UI 重繪，不自動向模型發送訊息。第二個按鈕依照過往行為只填入玩家輸入框。

## 安全與限制

- 不支援作者任意 JS、動態表達式、任意狀態路徑、跨故事變更或後端請求。
- 限 1～8 個不同路徑的整數變動，每筆絕對值不得大於 1,000,000。路徑必須位於 `modules.<module_id>.<field>` 之下；拒絕 `__proto__`、`constructor` 等危險鍵。
- 扣款／給付是針對當前故事狀態進行的前端計算；**不是平台金流或真實點數交易**。
- 模組尚未載入、未宣告或初始欄位未設定時拒絕執行，避免默默建立錯誤資料。
- 這份 MVP 尚未實作完整背包陣列操作、抽卡機率、任務排程、外部沙盒或創作者任意腳本。
- 世界狀態 AI 更新仍可能以整份模組覆寫舊值；在進一步加入衝突合併／交易序號前，不應將此 MVP 宣稱為完整的長篇遊戲權威狀態引擎。
- Creator MCP 目前不能保證產生這項新 `effect` 設定；需待主站回歸測試通過後另行對齊其匯出、驗證與遷移邏輯。

## 測試

```sh
node --check js/gameplay-ui-core.js
node --check js/gameplay-ui.js
node tests/gameplay-actions-core.cjs
```

需回歸確認：原有無 `effect` 角色卡、文字型動作、角色 Builder、故事恢復、舊存檔、UI/Tabs 和其他世界模組均不受影響。
