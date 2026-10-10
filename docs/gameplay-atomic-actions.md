# 夜灣原生 Gameplay 動作（MVP）

本功能參考外部《無限超市》原型的「把數值判定留在前端」觀念，**不採用**其直接執行作品內 JavaScript 或與故事無關的 localStorage 存檔方式。

## 用途與啟用條件

只在作品自行提供 `gameplay_ui.panels[].sections[type="actions"].items[].effect` 時啟用；原有 `draft` 文字快捷按鈕完全不變。前端只會操作當前故事內已宣告、已啟用的世界模組；`changes` 對應 object 整數欄位，`items` 對應 collection 物品數量。

支援原子化整數加減與集合物品增減，適合資金、配額、購買與消耗補給。不能拿來直接更改角色、時間、對話、外部服務、API Key 或其他玩家的資料。

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
- 這份 MVP 尚未實作裝備與背包分類、抽卡機率、任務排程、外部沙盒或創作者任意腳本。
- 已保護請求期間的前端操作，避免延遲 AI 更新覆蓋；未來輪次的敘事數值仍由模型更新，不應將此 MVP 宣稱為完整的長篇遊戲權威狀態引擎。
- Creator MCP 目前不能保證產生這項新 `effect` 設定；需待主站回歸測試通過後另行對齊其匯出、驗證與遷移邏輯。

## 測試

```sh
node --check js/gameplay-ui-core.js
node --check js/gameplay-ui.js
node tests/gameplay-actions-core.cjs
```

需回歸確認：原有無 `effect` 角色卡、文字型動作、角色 Builder、故事恢復、舊存檔、UI/Tabs 和其他世界模組均不受影響。

## 請求期間的狀態衝突

成功動作會在故事內記錄每個數值路徑的版本。獨立狀態模型與同模型狀態附錄均在發送時擷取版本；回覆套用前，保留發送後由前端改動的欄位（包含模型整份模組中遺漏的欄位），其餘更新仍正常套用。失敗交易不增加版本；版本會隨故事備份保存。

這是請求期間的競態保護，不是永久鎖定資源：下一次請求會讀取新數值，仍可依劇情更新。尚未提供任意劇情交易的確認協定，也不保證模型在未來輪次不會算錯資源。召喚與 MCP 自動生成仍屬後續範圍。

## 集合背包交易

`effect.items` 可和 `changes` 同時執行，兩者都通過才寫入。最多 8 筆物品變動，目標為 `modules.<collection_id>`，集合必須先初始化為陣列。每筆物品必須有唯一安全 `id` 和非負整數 `quantity`；舊作品若只有名稱或文字數量，需先整理，系統不猜測對應。新增物品需提供 `name`；既有物品保留描述、等級等欄位。數量到零時保留物品資料。

```json
{
  "changes": [{"path":"modules.economy.crystals","delta":-15}],
  "items": [{"path":"modules.inventory","id":"cans","name":"罐頭","delta":2}],
  "event":"花費15晶核購入2份罐頭"
}
```

使用一份罐頭可以只提供 `items:[{"path":"modules.inventory","id":"cans","delta":-1}]`。背包最多100筆，單次變動絕對值最多1,000,000，總數最多十億。數量不足、重複ID、缺資料、背包已滿都拒絕整笔交易。請求期間發生物品操作時，競態保護保留整份 collection，避免模型陣列替換抹除交易；同輪模型對該集合的其他變動會略過，下一次請求再整理。
