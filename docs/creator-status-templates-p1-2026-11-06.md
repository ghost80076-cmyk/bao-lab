# 創作室 P1：人物數值模板與初始值（2026-11-06）

## 設計邊界
接續初始 NPC 編輯器 P0（PR #934），本階段只新增作者創作室中的資料輸入工具：

- 原生 character_status.fields 欄位，最多 24 個；支援 meter、number、text、boolean、tags。
- initial_state.character_statuses 依明確人物姓名儲存初始值。
- 預設模板：好感度、信任度、HP、能量。可以建立自訂欄位，設定初始值、上下限、上下文用途、是否追蹤、更新依據。
- 世界作品不自動把作品標題當 NPC。人物來源為初始 NPC、既有初始狀態與已宣告主要人物；單角色卡且沒有 NPC 時才可使用主角色名稱。
- 新增、編輯、移除欄位與個別人物初始值均保留原卡未知欄位、世界模組、關係、世界書等。移除定義也不刪原始值，以便恢復。
- 不宣稱數值是客觀真理：模型仍透過既有世界狀態追蹤系統，按可見故事證據核對變更；好感和信任不等於同意。
- 表單未提交時阻止使用原本的儲存草稿、匯出與預覽，避免靜默遺失。
- 不新增模型請求、後端服務、DB schema，也不改記憶、P4 導演或玩家狀態 Runtime。
- character_status.enabled 原本被停用時，作者新增欄位會明確開啟；若只移除欄位，原標記保持不變。
- ui_only 不等於秘密，所有初始值都會在匯出 JSON 中出現。

## 回歸驗證
- node tests/character-studio-status-templates-core.cjs
- node --check js/character-studio-status-templates-core.js
- node --check js/character-studio-status-templates.js
- tests/e2e/character-studio-status-templates.spec.cjs：390／1280px 模板、未提交阻擋、匯出及草稿重載。
- 既有角色狀態、P0 NPC 編輯器、創作室、P1–P4 記憶和瀏覽器 CI 回歸。

## 後續
本次不重寫 Gameplay UI 或其他世界書資料，也不讓 AI 自動推算初始數值。已開始的玩家故事不因作者修改初始值而改變。
