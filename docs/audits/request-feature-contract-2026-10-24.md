# 功能選項到 LLM 請求：第一階段稽核

基準：`f141b216`（作者欄位／玩家入口同步後）。本次處理請求一致性；未重新設計介面，未宣稱所有功能組合或模型遵循程度均已驗證。

## 已確認及修正

1. 一般故事經過 `App.buildMessages`，重新生成／AI 改寫原本僅呼叫 `buildSystemPrompt`，漏掉訊息階段的演繹授權、語言強制規則、模型補丁、本輪錨點、共享世界書檢索、事件回憶及角色身份層。本次讓修訂在原有 revision snapshot 內重新走完整 builder，保留改寫任務。
2. 舊 revision snapshot 會恢復玩家更改前的角色身份、世界書選擇與手機偏好。內部 rewind／版本切換／reconcile 現在保留當前 `actorMode`、`worldbookLibrary`、`phoneSurface`；時間、人物狀態、已確認事件及條件旗標仍依故事快照處理。
3. 行動靈感也標記為 `__storyTool`，原有 revision wrapper 會把其獨立系統任務換成角色 prompt。本次明確排除 `__inspirationTask`。
4. 重生使用獨立歷史視圖，排除被替換回覆；事件回憶、世界書關鍵詞與連續性補救改讀這份視圖，不把被拒絕的回覆拿去觸發檢索。不交換全域 `Chat.messages` 或 `Chat.context`。

## 功能對照

| 選項／功能 | 有效來源 | 加入位置／執行時機 | 生效條件與限制 |
| --- | --- | --- | --- |
| 敘事模式、Persona | `App.config` | `character-ui` / `CharacterEngine.composeSystemPrompt` | 作品基底；有作品專屬 wrapper |
| 玩家演繹：主控／補述／共創 | `config.narrative.playerPortrayal` | `prompt-orchestrator` 固定 system | 故事明示授權；舊故事不繼承瀏覽器共創授權 |
| 觀賞一輪 | `narrative.observationMode`＋本輪輸入 | 固定規則＋最後 user 的本輪標記 | 開啟且獨立輸入指定命令；不是永久切換 |
| 文風包（10 個） | `narrative.stylePacks` | `narrative-settings` 固定偏好區 | 多選合併；仍可能語義拉扯，未做模型遵循評分 |
| 故事插曲（4 個） | `narrative.storyExtras` | 同上 | 相關時參與，非強制每輪事件 |
| 描寫密度 | `narrative.density` | 同上 | 預設依卡不增加指令 |
| 段落 | `narrative.paragraphs` | 同上 | 建議範圍，非程式強制截斷 |
| NPC 內心揭露 | `narrative.innerThoughts` | 同上 | 描寫權限不等於其他角色知情 |
| 身體與空間連續性 | `narrative.physicalContinuity` | 同上 | 關閉移除額外規則 |
| 親密處理方向 | `narrative.intimacy` | 同上 | 開啟加強 MOD 時由 MOD 分支取代 |
| 親密場景加強 | `narrative.intimacyDetailMod` | 同上 | 手動選擇；不額外請求模型 |
| 成熟劇情 | `narrative.matureDrama` | 同上 | 不會自行改變模型或作品 |
| 角色主動程度 | `narrative.characterAgency` | 同上 | 角色自主仍有因果、人格與資訊邊界 |
| 回覆篇幅 | `narrative.responseLength` | 同上 | 明確選擇時抑制舊回覆設定的字數指令 |
| 舊回覆長度 | 瀏覽器 `BAOPlayerSettings` | `player-settings` 固定 system | 故事篇幅優先；預設保留舊 fallback |
| 人稱、台詞標名 | 瀏覽器 `BAOPlayerSettings` | `player-settings` 固定 system | 設定範圍與故事級偏好不同，UI 待統一解釋 |
| AI 回覆語言 | `BAOPlayerSettings.getLanguage()` | `player-settings`＋orchestrator | 與網站介面語言分離；未強迫翻譯 Schema key |
| 節奏、對話比例 | `narrative.pacing/dialogueBalance` | 固定偏好區 | 非程式控制角色回合數 |
| 場景投入保護 | `narrative.sceneFocus` | 固定偏好區 | 保護持續互動，不是禁止所有事件 |
| 場外劇情期待 | `narrative.storyExpectation` | 固定偏好區 | 場外期待不等於人物意圖、已發生事實 |
| 自訂短指令 | `narrative.customInstructions` | 固定偏好區 | 會去重／分類篩選；可能被排除，應顯示原因 |
| 手動記憶、Context Pack、Canon | 各自儲存的已確認內容 | system 分層／相關檢索 | 固定、記憶、動態依標頭分區；需另擴完整來源矩陣 |
| 記憶模式／保留輪數 | `config.memory` | `Chat.context` | 影響歷史範圍；summary 模式另有整理請求 |
| 事件回憶 | `memory.episodicRecall`＋故事事件記憶 | `episodic-memory` 本輪 user 前置 | full 模式或明示關閉會略過；檢查來源與知情 |
| 共享世界書 | 故事 `worldbookLibrary` | 固定條目入 system；檢索條目入本輪 user 尾 | 未啟用、未命中、條件、知情、數量／字數限制可排除 |
| 世界書 auto／scene／off | `worldbookLibrary.recallMode` | 動態檢索 | 關閉動態檢索不等於移除已啟用書的固定條目 |
| 角色身份 | 故事 `actorMode` | `actor-mode` 固定 system 尾 | 啟用且目前使用身份、有有效身份資料才加入 |
| 手機開關與主人 | 作者 `phone_ui`＋故事 `phoneSurface` | bridge 固定契約＋動態主人說明 | 故事偏好覆蓋作者預設；只有實際事件才需回傳資料 |
| 狀態整理、世界模組 | 故事狀態＋`config.cost` 等 | buildSystemPrompt＋`API.send` 狀態 wrapper | 同模型附錄／獨立更新依設定；不等於所有開關都加 prompt |
| 雙向解讀 | 故事 `interpretationMods` | 前置 advisor＋本輪 user；後置 observer | 啟用才有相應輔助請求；本 PR 未新增重生時的 advisor 呼叫 |
| 評論 MOD／AI 導演 | 對應故事模組設定 | 故事完成後的 wrapper | 不是主故事 prompt 的必備區段；需另列成本及觸發結果 |
| 場景 HTML、頭像對話、正則、主題 | 作者／玩家顯示設定 | 部分影響輸出契約，部分僅處理呈現 | 必須逐項區分；不能把畫面有變化當成 prompt 有加入 |
| 模型、路由、快取、Token 上限 | API config＋provider context | `API.send`、transport serializer | 需驗最終 body；並非自然語言 prompt |

## 實際順序

1. `buildSystemPrompt` 組合作品、Persona、玩家偏好、世界／人物狀態等；不同 wrapper 依載入順序加入。
2. `prompt-cache` 分成固定 system、記憶 system、歷史訊息及動態資料＋最新 user。
3. `prompt-orchestrator` 補平台規則、故事演繹授權、模型補丁及回覆語言到固定 system，最後 user 補本輪錨點／條件式觀賞標記。
4. 事件回憶前置於本輪 user；作品事件、共享世界書、advisor、角色身份等 wrapper 再處理。固定世界書與角色身份可在平台規則後加入，不能假設平台規則永遠是 system 最後一段。
5. `API.sendStageOrder` 依序處理修訂快照、記憶防護、路由、狀態診斷、串流／同模型狀態、清理、預算、usage、上下文檢視、local／hosted transport。
6. serializer 轉成 OpenAI `messages`、Anthropic `system/messages`、Gemini `systemInstruction/contents`。字面位置不等於模型優先權；指令的語義矛盾仍需獨立審查。

## 驗收與界限

- `request-feature-contract.cjs`：45 個敘事偏好變體 × 3 種協定實際 request body；關閉後還原、未改設定的 byte 穩定性、角色身份／世界書／手機的組合、重生／改寫／舊回覆及行動靈感隔離。
- `request-feature-contract.spec.cjs`：390px、1440px，實際設定 UI → 儲存 → 點重生／改寫 → 攔截 HTTP body；所有模型回傳均為本機測試替身，不消耗 API。
- 既有快取、敘事授權、修訂復原、世界書、知情篩選測試仍需通過。
- 沒有聲稱測完所有排列，也沒有對真實模型做遵循率評估。固定前綴一致只代表可重用，不代表 provider 實際命中快取。
- 手機／角色身份變更會合理改變相應固定契約或身份區段；動態主人、位置、檢索命中不應污染固定前綴。

## 下一階段 UI／UX

沿用「故事總覽 → 上下文狀態 → 查看本輪送出內容」，補功能級的有效來源、套用範圍、目前狀態、排除原因及額外請求數。狀態應區分「已選擇」「已加入」「等待觸發」「被其他設定取代」「僅影響畫面」，不可把「已加入」寫成「模型一定遵循」。

後續優先補：所有儲存／匯入／切故事的控制矩陣、前後置輔助模型的觸發與成本、純 UI 與輸出契約分類、玩家自訂指令的語義衝突；再據此調整入口與分組。
