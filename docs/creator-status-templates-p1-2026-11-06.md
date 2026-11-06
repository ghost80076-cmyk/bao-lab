# 創作室 P1：共用原生狀態模板與人物初始值（2026-11-06）

## 修正方向
P1 不另外建立四組好感／信任／HP／能量模板；抽取原本故事「狀態欄管理」的七組範本，保留原欄位 key、類型、標籤、上下文、預設值、上下限及敘事追蹤文字。

唯一模板定義：js/character-status-templates.js（UMD／CommonJS，純資料、不可變）。
共用對象：
- 故事玩家：js/character-status-ui.js，保留既有玩家自訂欄位 custom_* key、故事存檔、template_id 與既有狀態管理流程。
- 角色作者：js/character-studio-status-templates-core.js 及視覺 UI，原生 character_status.fields + initial_state.character_statuses，不建立第二份設定來源。

七組既有模板：一般狀態、關係互動、奇幻、吸血鬼、修仙、三界人物狀態、戰鬥。
關係模板保留好感、信任 -100～100；精力維持 core 上下文，生命保留 0～100。
在作者端套用整組模板時只新增缺少的欄位；與原作品重名 key 不覆寫、不複製；超過 24 欄限制時整組拒絕，不允許只新增一部分。
既有欄位值、世界書、人物設定、未知狀態、作者資料保留。

## 功能範圍
- 作者可用視覺介面新增、編輯、移除原生狀態欄位；設定不同初始 NPC 的不同數值，儲存草稿與匯出 JSON。
- 狀態如何更新依循原本 Runtime 故事證據追蹤；P1 不新增追蹤器、模型請求、資料庫或世界事件系統。
- 好感與信任不等於同意；ui_only 不是資料保密機制。
- 原玩家模板管理器顯示與操作維持不變，故事存檔不會因作者卡片修改而重寫。

## 測試
- tests/character-studio-status-templates-core.cjs：驗證七組範本同一物件、好感／信任負值、欄位定義與作者輸出一致、已存在欄位去重、24 欄邊界、原始狀態不可變。
- tests/e2e/character-studio-status-templates.spec.cjs：390／1280px，關係與戰鬥模板、負值、保存、草稿重新載入。
- CI 同時驗證原玩家故事與作者創作兩條工作流。
