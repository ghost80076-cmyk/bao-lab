# P1：正文、記憶、世界書與狀態責任邊界

第一輪基準：`04f03d39f0e953466b07c3a094128a697a58fed0`（P0 結案後）。
六輪核心流程與原清單 12 個剩餘入口已完成判定；P1 原定工程範圍已結案，逐檔結果保留在本文後續批次。驗收版本、CI 修正與保留限制見 [結案核對](p1-core-closeout-2026-10-18.md)；目前階段見 [維護狀態](maintenance-status.md)。

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
| 狀態更新觸發 | `world-state-hook.js` 的 after-turn wrapper | 等待正文及摘要後，依正文完成憑證識別 user/assistant，呼叫 WorldStateEngine | 前後檢查故事歸屬；依變更／持久化提示再存檔 |
| 狀態擷取與套用 | `world-modules.js`、`world-state-cost.js`、`same-model-state-merge.js` | 獨立模型按批次排隊；同模型讀同次正文附錄；經清理後交給 GameState.applyUpdate | 模組路徑回應後檢查 owner；同模型缺附錄不補發第二次 API；兩條路徑需分別驗證 |
| 實際持久化 | `App.saveStory` 與 story-library/storage | 將目前故事快照交給 P0 已整理的儲存流程 | 摘要與狀態模組不直接重寫底層儲存協議 |

## 第一輪修正與驗收

已重現：A 的摘要請求尚未完成時切換至 B，重設 Chat 並啟動 B 摘要；A 的 finally 會清掉 B 的 `summarizing`。A 的空回應、API 失敗或晚完成的 JSON 修復，也可能覆寫 B 的 `memoryHealth`；冷卻 wrapper 還可能改寫 B 的畫面提示。

修正：每次摘要建立獨立 task；reset 使舊 task 失效。API 回應後、格式修復後及失敗提交前，都確認 task、故事、摘要游標及來源片段仍相同。finally 只清理自身 task。過期且格式錯誤的回應不再啟動修復請求；已在途的修復仍可結束，但不能提交。冷卻仍記在原故事，畫面與健康狀態只由當前故事更新。

`tests/memory-summary-ownership-core.cjs` 使用實際 Chat，並分別載入／不載入實際 prompt-cache wrapper，驗證成功、空回應、格式錯誤、API 拒絕、在途修復、來源編輯與 reset。也確認新故事任務仍去重、能成功提交事件索引，舊任務不解除新任務鎖。全程使用 mock API。

## 跨輪次狀態與保留邊界

- 正文入口由第二輪保護，評論／解讀與用量歸屬已分別由第五、六輪補上；其餘直接 hook 列於結案核對，不能將核心測試當成整條管線的安全證明。
- 事件記憶召回的 owner／來源／角色／設定檢查已由第四輪補上；世界書既有的跨故事與設定替換保護已有延遲回歸。
- 狀態觸發已由第三輪改成完成回合憑證與頁面內去重；儲存重載後的持久化 exactly-once 語意及直接呼叫 update 的其他入口仍不在此保證內。
- 舊版基礎 `world-state.js` 與正式載入的模組／成本／同模型路徑須區分；不能用模組路徑測試推論所有相容載入順序都已安全。

P0 已依 `p0-closeout-2026-10-18.md` 結案；上述是 P1 待辦，不擴張為新的 P0 輪次。

## 第二輪：正文與串流歸屬

基準：`398980e52fa07322f7aa33c7fbe799eb44718f34`（第一輪 #723 合併後）。

已重現兩種污染：等待 buildMessages 時切換故事，舊 sendMessage 仍會發出 API 並將 assistant 加入新 Chat；舊串流在下一次畫面更新時重新尋找最後一個泡泡，可能更新新故事的泡泡。

正文入口現在捕捉原故事與 config，並比較訊息 ID、角色、正文與 context_content 的來源簽章。提示組裝後、API 回應後、記憶處理失敗或完成後，以及外層錯誤處理前，均檢查歸屬。正常的訊息物件重建不視為切換。過期 continuation 不寫入目前 Chat、事件、存檔、輸入框或記憶標籤。若 API 已送出，舊回應會被捨棄；本輪不建立背景故事寫回／回應回收機制，也不代表取消已產生的模型用量。

串流捕捉原故事與原泡泡，在接收 delta、派送 UI 事件及繪製排程 frame 前檢查兩者；請求完成後的晚到 delta 也忽略。核心提交與串流預覽仍是不同責任。

驗收：`story-turn-ownership-core.cjs` 覆蓋提示組裝、provider、post-turn memory 三個等待點，各自切換故事、編輯來源或更換 config 的成功／失敗結果，以及正常提交。`streaming-turn-ownership-core.cjs` 覆蓋切換故事、替換泡泡與已完成請求的延遲 frame／delta。兩者加入 core CI，均使用 mock API。

## 第三輪：狀態觸發的回合識別與去重

基準：`0789a312b2dd6b6f274b31f91b7199ccfc383017`（第二輪 #724 合併後）。

已重現：兩次 sendMessage continuation 都等待同一組新增 user/assistant，舊 hook 會把同一回合送入 WorldStateEngine 兩次。舊判定還會擷取最後兩則訊息，無法分辨它們是否屬於本次正文。

核心 App.sendMessage 現在僅於正文及 post-turn memory 完成、且來源仍有效時，傳回暫態的 `bao:story-turn` 憑證。內容包含 owner/config、玩家與 assistant ID／文字，以及來源前綴有效性檢查。前綴之後追加新訊息不會使已完成回合失效；編輯來源、切換故事或 config 會使其失效。憑證不進入存檔，不新增模型請求。

world-state hook 使用憑證定位相鄰的原始訊息並核對文字，依故事與 assistant ID 去重；在 await update 前先登記，避免在途重複。支援憑證的核心若未回傳完成回合，就不從 Chat 尾端猜測；混合快取的舊核心只接受原始前綴未變且恰好多出一組 user/assistant 的情況。hook 保留傳入參數與回傳憑證。

驗收：`world-state-after-turn-hook-core.cjs` 驗證重疊 continuation 去重、舊來源編輯、缺失／失效／重播憑證，以及尾端已有後續訊息時仍選對原回合；`story-turn-ownership-core.cjs` 同時載入實際 App 與 hook，確認正常回合只觸發一次，18 種過期成功／失敗案例都不觸發。既有 world-state-cost、world-state-concurrency、same-model-state-merge 測試分別驗證佇列／在途隔離與同模型附錄路徑。API 全部 mock。

保證範圍是頁面生命週期中此 hook 的回合派送，並非所有狀態更新入口或跨重載 exactly-once。狀態 API 失敗時的批次保留與下一輪重試仍由 WorldStateEngine 管理；不以重播相同憑證再次入列。其他 after-turn 擴充與用量歸屬仍是後續 P1 邊界。

## 第四輪：事件記憶召回的非同步歸屬

基準：`5ee33dd4497ffa87f768681dffd6b48095909ac1`（第三輪 #725 合併後）。

已重現：episodic-memory wrapper 等待 next(config) 時切換故事，組裝器仍傳回舊提示，但 wrapper 讀取新的 GameState.current，將新故事記憶插入舊提示。正常 sendMessage 已由第二輪阻止過期提示送出；第四輪補上召回層自身的完整性，避免其他組裝呼叫者拿到混合內容。

修正只在 episodic-memory.js：等待前捕捉原故事、App config、角色及其名稱、訊息 ID／角色／content／context_content 簽章；等待後若任一不符，保留 next 傳回的訊息而不做召回。正常訊息物件重建仍可召回，穩定前綴及既有提示不變。關閉召回與 full 模式維持不召回，不新增 API。

驗收：`episodic-recall-ownership-core.cjs` 使用實際 wrapper，驗證故事切換、正文編輯、語意來源編輯、角色替換、角色改名、config 替換、停用／full 模式及正常物件重建。舊實作會把測試中的 OTHER STORY SECRET 插入舊提示，修正後不會呼叫 recall。

世界書原有 owner／設定物件檢查本輪不改寫。`worldbook-recall-ownership-core.cjs` 載入實際世界書 runtime 與 core，延遲 inner 組裝器／catalog fetch，確認切換故事或 catalog 等待期間替換設定後保留原提示；正常內嵌世界書仍會注入。這不代表已驗證所有原地修改設定、所有擴充組裝器或跨重載時序。

## 第五輪：評論與雙向解讀擴充的故事歸屬

基準：`3e3580957b8d5547f67062fa83dcbc7a13e2d5f7`（第四輪 #726 合併後）。

已重現：場外評論 API 等待期間切換故事，舊結果會透過 saveState 寫進新故事；等待正文結束的擴充也可能找到新故事的 assistant 再啟動輔助呼叫。生成前顧問等待期間切換故事後，舊 continuation 還可能啟動 next，將顧問內容留在共用 pendingAdvisor。

評論與解讀 lifecycle 現在先捕捉 owner/config；顧問另核對原歷史、角色與輸入，再允許進入正文。正文完成後，新核心路徑使用第三輪的完成憑證定位 assistant，不從新故事尾端猜測。輔助輸出在寫入前核對原故事、設定、目標回覆與對應玩家文字；過期錯誤不在新故事顯示提示。評論保存時以當前同故事的模組 state 合併，避免舊快照覆蓋同時更新的偏好。

pendingAdvisor 現在持有自己的 owner/config 與任務物件；提示 wrapper 捕捉這個物件並於 await 後核對。舊 finally 只清理自己的顧問任務，不能清掉另一個任務。手動評論按鈕也會在等待後檢查歸屬才顯示完成通知。

`post-turn-mod-ownership-core.cjs` 載入實際評論／解讀 runtime、core 與官方 pack，驗證評論 API、正文等待、顧問及觀察者等待期間的故事切換、config 替換、來源編輯與成功／失敗結果，共 24 個過期案例；另確認正常評論與解讀仍可保存。測試使用完成憑證路徑及 mock API。這不是所有同故事並行顧問任務、重複計費或所有其他 after-turn 擴充的完整證明。用量歸屬仍待下一項獨立驗證。

## 第六輪：晚到用量的計數器與畫面歸屬

基準：`06d7185d3027a12e840352593821ad6512efbf24`（第五輪 #727 合併後）。

已重現：A 請求等待期間切換至 B 並重設 Chat，晚到回應的 42 個 Token 會加入 B 的累積與 ledger，並以舊正文用量更新 B 的 Context 壓力。一般 request-usage wrapper 與燈火 Hosted transport 均有記錄入口；只修其中一個仍會污染。

Chat.captureUsageContext 捕捉入口當時的故事與 usage、usageByKind、usageLedger 物件參考。recordRequestUsage／addUsage 接受這個暫態 context；prompt-cache 與 cost-control 的包裝器轉交 context，快取未知標記也只更新原集合。兩個記錄入口在 await 前捕捉集合，回應後只在集合與故事仍為當前時更新用量 UI、費用 UI 與正文 Context 壓力。既有 result marker 仍負責 Hosted 與外層 observer 的單次記錄。

驗收：chat-usage-pipeline-core 的新增 16 個案例覆蓋 named／legacy sender、實際 prompt-cache wrapper 有／無，以及正文、記憶、狀態、auxiliary；舊集合保留 Token 與回報費用，新集合、畫面與壓力不變。api-ordered-pipeline-integration 另以實際 Hosted transport、prompt-cache、cost-control 及四種安裝順序，驗證晚到費用僅記一次。測試皆 mock，不呼叫付費模型或修改後端帳本。

界線：原集合以請求期間的記憶體參考保留，並不自動回寫已離開／重新載入故事的非作用中存檔；關閉頁面後無持久化回收保證。這是記錄入口的非同步歸屬，不是完整交易對帳，也不宣稱所有在進入這些入口前的非同步擴充都已隔離。後端扣款仍由 Worker／provider 帳本決定。

## 剩餘 hook 第一批：人物選取與修訂等待入口

基準：`f5ae7d71f1316b9e8234cb51a840e9ff5f210f09`。對應結案清單第一列，不重做六輪核心流程。

已重現：舊 sendMessage 等待結束後只比對 assistant 數量，會清掉新故事的人物選取；修訂入口等待 revisionQueue 後會重新讀取目前草稿並送出。修訂中的 snapshot finally／reconcile 也可能在切換故事後寫入當前狀態。

人物選取改用具名 `character-status-ui:consume-selection`：固定 owner/config/角色與原選取名單；當前核心須有有效完成憑證；等待後只清理未變的原選取，保留等待期間的新選取。修訂入口改用 `story-revision-state:wait`：固定故事 lineage、config/角色、訊息簽章與草稿，等待完成後才決定是否委派。兩者保留舊 App 的 fallback。

修訂 snapshot 自己替換 GameState 物件是正常行為，不能一律當作換故事。因此 WeakMap 只把本模組 applySnapshot 產生的物件連到同一 lineage；外部還原／新建物件不繼承。queued reconcile 帶原 lineage，並於 base 查找、狀態更新、記憶更新後核對目標；API snapshot 也只在原故事與修訂來源仍有效時還原。

`status-revision-entry-ownership-core.cjs` 載入實際兩個 runtime，驗證跨故事選取、同故事新選取、正常清理、正常／過期完成憑證、修訂等待時換故事／改草稿、正常 snapshot 物件替換後仍可送出、參數／結果傳遞，以及舊 snapshot finally 不還原到新故事。既有 revision state／pipeline 與狀態提示測試繼續通過。所有 API 為 mock。

此保護不回滾底層狀態引擎已完成的更新，也不宣告所有同故事並行修訂／直接 hook 已驗證。結案盤點原先的 12 個一般直接入口中，本批處理 2 個；其他 10 個仍依原清單逐項判定。

## 剩餘 hook 第二批：閱讀位置、錯誤提示與畫面更新

基準：`4a79866baec674d11f016ae931c9b16acdd32b3d`。本批判定原清單的五個閱讀／畫面入口。

已重現：舊 sendMessage 結束時，錯誤提示 wrapper 會把新故事尾端未存入 Chat 的錯誤泡泡移除；閱讀位置 wrapper 則會恢復舊位置到目前 stream。即使切換後 DOM 節點仍連接，舊 continuation 也不得修改新故事畫面。

chat-experience-repairs 改用具名 `chat-experience-repairs:feedback`，等待後核對 owner/config/角色才清理錯誤泡泡或更新提示。chat-reading-scroll 改用具名 `chat-reading-scroll:anchor`，API 位置快照、完成捲動與 placeholder 清理均核對同一歸屬；新故事可釋放舊 activeTurn 並取得自己的閱讀 anchor，舊 finally 只釋放自己的任務。兩者保留舊 App fallback。

story-reader 的送出 wrapper 原先遺漏 args，現完整轉交並保留結果；其延遲 decorateStream 仍重新讀取目前 Chat、角色與 stream。scene-chat-integration 的 paint 與 scene-render-integrity 的 reconcile 也重新讀取目前故事，核對 DOM／訊息對齊、避開串流及編輯中的泡泡，不套用舊回覆快照；這兩個入口經程式碼檢視保留。本批不以具名化全部畫面刷新為必要工作，也不宣稱完整視覺排列或所有 renderer 競態已驗證。

reading-hook-ownership-core.cjs 載入實際三個 runtime，驗證 owner/config/角色切換、正常完成、具名／fallback、舊 API／finally 晚於新 anchor、以及 story-reader 參數／結果傳遞。既有 reading scroll／pipeline、reader、streaming、request lifecycle、App wrapper、story turn 與 frontend extension 測試亦通過。API 全部 mock。

原 12 個一般入口累計已判定 7 個：前批 2 個，本批 3 個修正、2 個程式碼檢視保留。其餘 5 個是三個作品介面與兩個離線／本機預覽入口，尚待判定。六輪核心基準不重新擴張，真實帳務對帳仍未完成。

## 剩餘 hook 第三批：作品選項與離線／本機預覽（清單結案）

基準：`5918613ff8faeace2738c7ce4ce4ef70c3943ebb`。本批完成最後五個原清單入口。

已重現：三個作品 send wrapper 的舊 completion 都能在切換到同作品的新故事後重新掛上行動選項；新故事正在生成時，這會讓先前回覆的選項再次出現。三者改用具名 choices hook，固定 owner/config/角色，await 後與 setTimeout 回呼內各核對一次。計時器另避開正在生成的請求。外層 request-lifecycle 在內層 wrapper 回傳後才解除 pending，因此不能在排程前以 pending 擋掉正常 completion；測試載入實際 lifecycle 驗證這個順序。舊 App 維持 fallback。

no-api-world-preview 與 player-settings 的 send wrapper 均漏傳 args，已完整轉交並保留正常結果；離線世界仍提示連線且保留草稿，本機 demo 仍同步產生本機回覆、保存與顯示零 Token，不委派底層 sender。這兩個同步 gate 保留原相容形式。

remaining-send-hooks-core.cjs 載入實際五個 runtime，以具名／fallback、await／timer、story／config／角色／pending／正常情況組合覆蓋 60 個選項案例；另驗證 provider 錯誤不重試且保留錯誤物件、實際 lifecycle 的正常選項更新、參數與結果，以及兩個預覽模組的兩種載入順序。測試全為 mock，不呼叫付費模型。

### 原 12 個入口的最終判定

| 入口 | 判定 |
| --- | --- |
| character-status-ui | 修正選取歸屬，具名 hook（#730） |
| story-revision-state | 修正等待與快照歸屬，具名 hook（#730） |
| chat-experience-repairs | 修正錯誤 DOM／提示歸屬，具名 hook（#731） |
| chat-reading-scroll | 修正閱讀 anchor／API 快照歸屬，具名 hook（#731） |
| story-reader | 修正參數傳遞，保留當前狀態刷新（#731） |
| scene-chat-integration | 程式碼檢視保留，使用當前資料及 DOM 對齊（#731） |
| scene-render-integrity | 程式碼檢視保留，使用當前資料及 DOM 對齊（#731） |
| host-club-simulator-ui | 修正等待／延遲選項更新歸屬，具名 hook（本批） |
| night-sky-magic-academy-ui | 同上（本批） |
| k-idol-survival-simulator-ui | 同上（本批） |
| no-api-world-preview | 修正參數傳遞，保留同步離線 gate（本批） |
| player-settings | 修正參數傳遞，保留同步本機預覽 gate（本批） |

累計 **12／12 已判定**：10 個修正、2 個程式碼檢視保留。這份有限的 send hook 清單不再有待判定列；六輪核心與本清單的 P1 工程範圍結案。仍不宣稱任意直接呼叫、所有同故事並行任務、renderChatShell／初始狀態重試計時器、全部視覺排列或完整 wrapper 安裝矩陣都已證明。P0 所列真實 provider／wallet 對帳與持久化界線不因此變更；UI/CSS、一般 workflow 去重與舊文件屬 P2。
