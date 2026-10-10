# 三界九域：輸出格式與狀態欄原生對照

來源零起算 172 的核心需求是故事、選項、人物狀態、世界變量與離場人物連續性。本批只記錄原生對照與缺口，不把原文 `<br><br>`、`hc-collapse` 或隱藏追蹤註解重新插入模型提示，也不改動其他批次的狀態欄修正。

| 原文需求 | 已有實作 | 對照結果 |
| --- | --- | --- |
| 敘事與選項 | `chat-markup.js`、`action-choice-dock.js` | 沿用原生顯示與玩家選擇；不強制每段 HTML 換行 |
| 時間、地點、世界事件 | `world-state.js`、`world-clock.js`、`state.js` | 保存已確認資料，時間推進依正文證據 |
| 境界、當前／最大力量、業力功德 | `three-realms-cultivation-core.js`、`world-module-ui.js` | 明確選用三界修煉，未知資料保持空白 |
| 身體、精神、情緒與關係 | `character-status-ui.js`、`character-status.js` | 可選一般、關係、修仙範本或自訂欄位；不直接重設既有角色欄位 |
| 靈石、道具、功法、裝備 | `world-modules.js` 的 economy／inventory／skills／equipment | 可依故事選用；玩家資源與世界事件分開 |
| NPC 外貌、穿著、關係、在場／離場 | `world-state.js`、`character-status-ui.js` | 穩定身份、外貌與換裝資訊已有 PATCH 契約；離場不是刪除 |
| 離場活動 | 已確認狀態與 NPC 相關上下文 | 不把合理推測當成已發生；自動導演仍依既有實驗文件處理 |
| 聊天旁狀態 | `scene-html-modes.js` 的 paintInlineStatus | 通用原生區域顯示世界、人物與已選模組，位於訊息流之外 |
| 成人額外數值 | 通用自訂欄位；特定世界的 native status pack | `native-status-packs.js` 限 autonomous-npc-world，不能宣稱三界已自動取得該包 |
| 低／中／高／極高的純描述顯示 | 文字欄位可自訂，既有量表維持其契約 | 尚未加入三界專用的數值→描述對照，不自行猜測閾值 |

此條目標示為 `native_renderer_review`，並保留 follow-up，沒有宣稱逐字遷移完成。未解缺口是三界專用的顯示方案及作品評測；這些應保持可選用、故事內設定，不能為了重現原模板新增一套自動狀態機。
