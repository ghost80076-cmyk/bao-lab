# 作者創作體驗整合 P3（2026-11-06）

## 目標

在既有六階段創作流程內，說清楚人物、世界資料、人物數值與互動 UI 的分工，並把作者直接帶往已存在的設定入口。P3 不新增第七步，也不建立第二套角色、世界或狀態資料。

## 四層關係

1. **人物資料**：主要角色描述作品主體；P0 初始 NPC 編輯器直接寫入 `initial_state.npcs`。
2. **世界與知識**：世界規則預設常駐；背景／按需世界書依既有關鍵字及位置規則載入。
3. **人物數值**：P1 直接編輯 `character_status.fields` 與 `initial_state.character_statuses`，只追蹤需要變動的狀態，不取代人物文字設定。
4. **互動呈現**：手機、頭像對話與 Gameplay UI 只控制玩家如何看見及操作，仍使用同一份角色卡與故事 Runtime。

「人物與世界」階段新增作品結構導覽，顯示各層目前完成狀態及現有資料數量，按鈕直接開啟對應欄位。既有六階段導覽也會把初始 NPC、數值欄位及人物初始值視為已填寫的結構化人物／世界資料。

## 邊界

- 不修改記憶、摘要、Context、NPC Runtime、世界狀態更新、模型路由、Wallet、Worker 或故事送出。
- 不改角色卡 schema、JSON 往返、現有草稿與存檔格式。
- 保留「全部欄位」模式及原有進階入口；P3 只增加導覽與狀態解釋。
- 孤立的舊人物初始值只標示供核對並保留，不自動刪除或遷移。

## 驗收

- Core：`tests/character-studio-creation-map-core.cjs`、`tests/character-studio-flow-core.cjs`。
- Browser：`tests/e2e/character-studio-creation-map.spec.cjs`，覆蓋 390px／1280px、四層狀態、P0／P1 資料更新、入口導航、44px 操作目標及無水平溢位。
- P0、P1、P2 既有核心與瀏覽器測試維持通過。
