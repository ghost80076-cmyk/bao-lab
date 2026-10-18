# P1：正文、記憶、世界書與狀態責任邊界

第一輪基準：`04f03d39f0e953466b07c3a094128a697a58fed0`（P0 結案後）。
第一輪範圍：責任盤點，以及背景摘要跨故事回應的隔離。第二輪補正文與串流的歸屬檢查；不宣告整個 P1 完成。

## 呼叫與資料所有權

| 階段 | 入口／負責模組 | 讀寫責任 | 邊界 |
| --- | --- | --- | --- |
| 組裝正文請求 | `App.buildMessages`；`prompt-cache.js`、提示管線 | 讀取 Chat 歷史、摘要及故事狀態，組裝訊息 | 與正文完成後的寫入分開 |
| 世界書召回 | `worldbook-library.js` 的 `worldbook-library:recall` | 讀取已啟用快照／世界書，加入固定與動態背景 | 不在每輪正文後自行產生世界書；非同步載入後檢查故事與設定歸屬 |
| 事件記憶召回 | `episodic-memory.js` 的 `episodic-memory:recall` | 讀取事件索引，補入最後一則玩家訊息 | 召回不等於建立新事件 |
| 正文提交 | `App.sendMessage` | 將使用者與 assistant 訊息放入 Chat，更新互動事件並先存正文 | 摘要失敗不得丟棄已完成正文 |
| 長期摘要 | `Chat.afterTurn → maybeSummarize` | 更新 `Chat.summary`、`summarizedUntil`、`memoryHealth`；同步 owner.memory | smart 模式才啟動；成功結果須對應原故事、原摘要游標和原始片段 |
| 事件記憶建立 | `Chat.maybeSummarize → BAOEpisodicMemory.ingest` | 將未經格式修復的摘要輸出轉成原故事事件索引 | 與摘要共用提交條件；不是另一個逐輪 API |
| 摘要流量保護 | `prompt-cache.js` | 依故事去重、失敗冷卻；API wrapper 提供逾時與取消 | 不負責提交摘要；舊故事冷卻可保留，但不得修改新故事健康狀態或提示 |
| 狀態更新觸發 | `world-state-hook.js` 的 after-turn wrapper | 等待正文及摘要後，擷取末尾 user/assistant，呼叫 WorldStateEngine | 前後檢查故事歸屬；依變更／持久化提示再存檔 |
| 狀態擷取與套用 | `world-modules.js`、`world-state-cost.js`、`same-model-state-merge.js` | 獨立模型按批次排隊；同模型讀同次正文附錄；經清理後交給 GameState.applyUpdate | 模組路徑回應後檢查 owner；同模型缺附錄不補發第二次 API；兩條路徑需分別驗證 |
| 實際持久化 | `App.saveStory` 與 story-library/storage | 將目前故事快照交給 P0 已整理的儲存流程 | 摘要與狀態模組不直接重寫底層儲存協議 |

## 第一輪修正與驗收

已重現：A 的摘要請求尚未完成時切換至 B，重設 Chat 並啟動 B 摘要；A 的 finally 會清掉 B 的 `summarizing`。A 的空回應、API 失敗或晚完成的 JSON 修復，也可能覆寫 B 的 `memoryHealth`；冷卻 wrapper 還可能改寫 B 的畫面提示。

修正：每次摘要建立獨立 task；reset 使舊 task 失效。API 回應後、格式修復後及失敗提交前，都確認 task、故事、摘要游標及來源片段仍相同。finally 只清理自身 task。過期且格式錯誤的回應不再啟動修復請求；已在途的修復仍可結束，但不能提交。冷卻仍記在原故事，畫面與健康狀態只由當前故事更新。

`tests/memory-summary-ownership-core.cjs` 使用實際 Chat，並分別載入／不載入實際 prompt-cache wrapper，驗證成功、空回應、格式錯誤、API 拒絕、在途修復、來源編輯與 reset。也確認新故事任務仍去重、能成功提交事件索引，舊任務不解除新任務鎖。全程使用 mock API。

## 尚待後續 P1 驗證

- 正文入口的核心 await 已由第二輪保護；其餘 after-turn wrappers、用量記錄、同模型狀態附錄與取消控制仍須依各自責任驗證，不能將核心測試當成整條管線的安全證明。
- 事件記憶召回 wrapper 在等待下一層組裝器後，是否需要額外的 owner 檢查。
- 狀態觸發目前以訊息數及末尾角色識別一輪，後續以回合識別驗證重複與漏更新；不在本輪重寫整條管線。
- 舊版基礎 `world-state.js` 與正式載入的模組／成本／同模型路徑須區分；不能用模組路徑測試推論所有相容載入順序都已安全。

P0 已依 `p0-closeout-2026-10-18.md` 結案；上述是 P1 待辦，不擴張為新的 P0 輪次。

## 第二輪：正文與串流歸屬

基準：`398980e52fa07322f7aa33c7fbe799eb44718f34`（第一輪 #723 合併後）。

已重現兩種污染：等待 buildMessages 時切換故事，舊 sendMessage 仍會發出 API 並將 assistant 加入新 Chat；舊串流在下一次畫面更新時重新尋找最後一個泡泡，可能更新新故事的泡泡。

正文入口現在捕捉原故事與 config，並比較訊息 ID、角色、正文與 context_content 的來源簽章。提示組裝後、API 回應後、記憶處理失敗或完成後，以及外層錯誤處理前，均檢查歸屬。正常的訊息物件重建不視為切換。過期 continuation 不寫入目前 Chat、事件、存檔、輸入框或記憶標籤。若 API 已送出，舊回應會被捨棄；本輪不建立背景故事寫回／回應回收機制，也不代表取消已產生的模型用量。

串流捕捉原故事與原泡泡，在接收 delta、派送 UI 事件及繪製排程 frame 前檢查兩者；請求完成後的晚到 delta 也忽略。核心提交與串流預覽仍是不同責任。

驗收：`story-turn-ownership-core.cjs` 覆蓋提示組裝、provider、post-turn memory 三個等待點，各自切換故事、編輯來源或更換 config 的成功／失敗結果，以及正常提交。`streaming-turn-ownership-core.cjs` 覆蓋切換故事、替換泡泡與已完成請求的延遲 frame／delta。兩者加入 core CI，均使用 mock API。
