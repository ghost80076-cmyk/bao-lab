# 夜灣｜高風險故事操作與資料一致性 UX 驗收

基準：`6a624446f33b031fd806230ec40d562a4f663596`（#961 合併後的 main）。本次只做稽核、必要修復、隔離測試及獨立 PR；未合併、未部署、未操作正式玩家資料、未呼叫付費模型。

本輪兩項阻擋的根因、修復與安全取捨，以 [阻擋修復報告](story-safety-blockers-2026-11-15.md) 為準；下方歷史驗收與原始失敗證據保留，不代表本輪仍未修復。

## 已確認問題與修復

| 分級 | 可重現問題 | 修復後行為與證據 |
| --- | --- | --- |
| P0 | 離開只等生成結束，未等真正寫入；兩份本機寫入被延遲／拒絕時仍已離開，可在關頁或另開故事後失去本頁新內容 | exit 等既有 request tasks，再等保存確認。失敗返回 false、停留原故事；保留正文、摘要與輸入草稿。新 E2E 的 pending exit 案例在原 main 回傳完成、修復後等待 gate 並拒絕離開 |
| P1 | 保存成功提示只驗證自動存檔；Library 失敗仍能報成功。fallback 僅比時間戳與訊息數，同時間相同長度的舊內容可被誤認為新內容 | 同時確認 Storage 與該 storyId 的 Library flush；fallback 比正規化完整 payload。`story-save-acceptance-core.cjs` 可重現原 main 的錯誤成功 |
| P1 | 生成期間手動保存會把暫時的玩家訊息寫進最後有效存檔 | 等既有生成／後續 tasks 結束才取快照。成功回合可照常保存；取消後保存已清理的歷史。更新 exit E2E，使用明確 response gate，並驗證生成中手動保存不替換前一份有效快照 |
| P1 | 分支目的地尚未寫入就回傳切換成功；回溯使用無 storyId 的 Library.flush，只確認 DB 可開啟 | 來源與目的地確認持久化；目的地失敗恢復來源，保留已建立的有效分支。新舊分支共用同一個 UI handoff。回溯改為 scoped flush。舊 async 失敗不覆蓋較新的故事。原 main 的 destination 案例返回成功，修復後報錯、還原來源並可重試 |
| P1 | 自動記憶的手動重試迴圈只 await 同步受理值，保存失敗仍繼續下批；Drive 不等待／確認自動存檔，Library 成功時可漏報主存檔失敗 | 每批等保存確認，失敗停止，不再請求後續批次；保留已生成摘要、游標及全部原文，走本機保存重試。原 main core 同條件請求 4 批，修復後只請求 1 批。Drive 在本機確認失敗時記錄錯誤，禁止該故事的雲端變更 |
| P2 | 保存錯誤缺少直接重試路徑，Library 只保留錯誤而無可重試快照；記憶面板可能蓋住故事頁保存警告 | 警告提供「重試儲存」；沿用既有失敗 Map 保留每章最新失敗 payload。重試先排空新寫入，避免舊失敗覆蓋新保存。記憶工作台內顯示「摘要已產生但未保存」，指引關閉工作台後使用故事頁的保存重試 |

P0 指失敗後離頁可能失去尚未持久化的新內容，並非宣稱已發現 IndexedDB 交易會毀損最後有效記錄。沒有因非阻擋視覺建議額外修改 P3 功能。

## 實際資料流與既有保護

| 操作 | 追蹤路徑與確認點 |
| --- | --- |
| 一般送出 | App wrapper task Set → request-lifecycle 的單一 pending／AbortController → App source signature → API pipeline → assistant receipt → 記憶／狀態 hook → App.saveStory。舊 owner／config／訊息前綴不符時，不提交舊結果 |
| 本機保存 | App.saveStory 保持同步 boolean「受理」契約 → Storage.buildStoryPayload／秘密清理 → Storage ordered queue、IDB 原子交易、失敗轉單 key fallback → Library pinned storyId/chapterId queue → Storage.flush + Library.flush(storyId) → WriteGuard.whenIdle 的確認結果 |
| 離開 | #956 的 sendMessageTasks／requestSettlement → 取消與結算 → 保存 barrier → owner/config 再確認 → detail。獨立維護工作尚未完成時提示稍候，保留本頁 |
| 分支／回溯 | 原來源保存與 unchanged-source 檢查 → 完整歷史 checkpoint → 原子建立分支 → 還原歷史正文／狀態／記憶 → 目的地保存確認。失敗不宣稱成功，恢復來源；維護鎖限制生成交錯，使用 token 釋放本操作的鎖 |
| 自動記憶 | Chat.completed-turn source range → bounded request／completionError → 格式校驗 → summary/cursor/episode 更新 → 保存。手動多批重試每批確認，失敗停止；已確認輸出留在頁內供本機重試，不用再次產生同批摘要 |
| 筆記／Context Pack | 既有 MemoryCore.commitState／foldText，保存、flush、讀回與來源 ownership；失敗恢復仍屬該交易的欄位。未重寫其架構 |
| Drive | 先拒絕 transient active turn → 本機保存、flush、verify → scoped chapter failure 檢查 → bundle → 遠端版本／衝突檢查 → 上傳。失敗故事不做遠端寫入，其他有效故事維持原同步契約 |

沿用的保護包括 IDB action/request abort、單 key fallback 保留上一份完整快照、Storage Web Locks、Library pinned refs／scoped failures／刪除 tombstone、歷史 checkpoint 邊界、completed-turn memory、摘要截斷檢查、owner/task token、API bounded retry、Worker reservation／settlement idempotency。不是重新建立 Story Engine 或第二套狀態管理。

## 可控制時序的測試矩陣

| 類別 | 情境／結果 | 主要證據 |
| --- | --- | --- |
| 保存失敗 | IDB 拒絕 + fallback quota + Library 拒絕；最後有效 IDB 記錄逐位元不變，新正文／摘要仍留在頁內 | 新 save acceptance E2E，4 viewport × 3 browsers |
| pending／關頁 | 寫入 gate 未 release 前不離開；beforeunload 在 pending／失敗時 preventDefault，恢復後不再因保存狀態阻擋 | 新 save acceptance core／E2E；實際關頁提示受瀏覽器規則限制 |
| 重疊保存 | 手動與自動保存交錯，舊驗證不得提前宣告最新寫入成功；同時戳同長度不同內容不通過 fallback 比對 | 新 save acceptance core |
| 生成→取消→離開→保存 | 手動保存暫時回合不覆蓋前快照；取消清理後 auto／Library 歷史相同；重載後重試只留下新的單一 user/assistant 回合 | request-lifecycle core、更新的 story-exit-persistence E2E |
| 取消→立即送出／離開 | pending 拒絕重複送出；cancel settle／exit handoff 完成後才恢復。草稿不被異步失敗覆蓋 | request-lifecycle、story-turn-ownership、streaming-turn-ownership core |
| 逾時／空內容／429／5xx／網路 | provider 錯誤與 bounded retries 走既有合約；不新增重試或計費規則 | api-failure-contracts、api-retry-contracts、api-streaming-contracts、Worker settlement core；均為 Mock |
| 重試→舊回應 | build／provider／memory 各 await 邊界，變更 owner、config、來源或 reset；成功／失敗的舊結果均不提交正文、狀態或錯誤 | story-turn-ownership、memory-summary-ownership、episodic/worldbook recall ownership core |
| 分支來源保存失敗 | 等待來源 gate 期間改故事／消息／狀態／pending 均拒絕切換；Library 失敗保持來源進度 | story-branch-api core、story-branch-tree E2E |
| 分支目的地保存失敗 | 報錯、來源正文／摘要／位置／refs 恢復，修復後重試並重載對應目的分支 | 新 save acceptance E2E；原 main 對照失敗 |
| 回溯／重新生成 | genuine checkpoint 還原正文、記憶、人物／世界狀態；原線保留。缺 checkpoint／corrupt cursor／保存失敗不回報成功 | story-rollback、story-recovery-integrity、story-revision-state/pipeline core；story-rollback E2E |
| 記憶整理→切分支／回溯 | 維護期間阻擋操作；若外部替換 source／owner，舊回應不能更新新故事。未透過強制關閉保護製造不符合產品的流程 | maintenance-send-gate、memory-summary-ownership、story-rollback、branch API core |
| 摘要截斷／空／失敗 | 不推進完整覆蓋；保留舊摘要與來源。bounded 截斷重試只切完整回合 | memory-completed-turns、memory-truncation-recovery、memory-recovery E2E |
| 摘要完成→保存失敗→重試 | 91 輪 fixture；保存失敗只請求 1 批，摘要與 cursor 留存；工作台顯示原因，關閉後「重試儲存」不呼叫模型；重載仍保存該批 | 新 memory save acceptance core／E2E |
| 多批／重載／最後寫入重試 | 已成功批次不重做；筆記 final persistence 重試不追加模型請求，自動摘要游標不被手動筆記推進 | memory-checkpoint/workbench-persistence、Context Pack resume core、memory-recovery E2E |
| Drive→本機寫入失敗 | Library 失敗與 primary autosave 失敗分別注入；零新增 upload；重試本機儲存後 reload 一致 | google-drive-sync core、擴充的 story-branch-tree sync E2E |
| 桌面／手機 UX | 320×740、390×844、390×420、1440×900；錯誤與恢復、44px retry hit-test、輸入焦點／草稿、重載一致；截圖附於測試報告 | 新 save acceptance E2E；既有 rollback／memory／mobile suites |

新增競態使用 Promise resolver、實際 request/transaction 完成與來源簽章，不以固定 sleep 猜測操作順序。既有 story-exit 測試的 1200ms provider delay 也已改為明確 gate。另修正 story-library-core 的 5ms 假交易完成器：共用 request-draining／atomic scheduler，避免高負載下 request 未完成就假裝 transaction complete；保留原斷言與索引檢查。

## 修復前後可重現證據

```bash
# 原 main 對照：預期失敗；不呼叫模型。
git show 6a624446:js/storage-write-guard.js > /tmp/base-storage-write-guard.js
STORAGE_WRITE_GUARD_SOURCE=/tmp/base-storage-write-guard.js node --test tests/story-save-acceptance-core.cjs
git show 6a624446:js/memory-workbench-core.js > /tmp/base-memory-workbench.js
MEMORY_WORKBENCH_SOURCE=/tmp/base-memory-workbench.js node --test tests/memory-save-acceptance-core.cjs

# 修復後
node --test tests/story-save-acceptance-core.cjs tests/memory-save-acceptance-core.cjs
node tests/story-library-durability-core.cjs
node tests/google-drive-sync-core.cjs
node tests/story-branch-api-core.cjs
node tests/story-rollback-core.cjs
```

實際原 main 瀏覽器對照另以 route 載入該 SHA 的原始 scripts：320px 的 pending-exit 斷言得到 `Received: true`（預期尚未完成），destination-save-failure 得到空錯誤（原流程回傳成功）。修復後新增案例驗證真實 IndexedDB、LocalStorage 與完整應用程式；只有故障、Provider 與 Google 回應是 fixture。

## 執行與 CI 證據的界線

已執行完整 Core／Maintenance workflow 的 run steps；新增 Core 8 個確定性案例、Library retry／stale-write、branch stale destination、rollback scoped flush、Drive local barrier 均已通過。初次整批執行曾遇 story-library-core 的假交易計時器競態，已用共用交易排程器修正並保留原斷言。

新增 Chromium 12 個案例的單輪已全通過；連同既有六個高風險 spec 的三瀏覽器擴大回歸共 153 案例。最終完整結果與 GitHub Actions 的成功／失敗／skipped／pending 數量，以本 PR Checks 頁及交付回報為準，不把配置了 CI 寫成已執行成功。早期多個本機 Playwright 共用 outputDir 曾造成 trace ENOENT；已分離 outputDir／port 重跑，此類失敗不列為產品通過證據。

CI 保留既有 Core、Maintenance、Regression Impact Gate 與 Fast Browser jobs；新增 Story safety 的 Chromium／Firefox／WebKit job，執行新增驗收、exit、rollback、storage-multitab、memory-recovery，並上傳報告／截圖。Gate 增加兩個 acceptance core，沒有刪除測試或放寬保護。

## 仍需另外驗證的範圍

- 實體 Android／iOS、真實虛擬鍵盤、OS 回收頁面、低記憶體、裝置真實 quota／private-mode 差異。Linux WebKit 與 viewport 模擬不等同 Safari iPhone 實測。
- beforeunload 是瀏覽器提供的盡力提示；手機 OS 強制終止、斷電或使用者仍選擇離開，不能保證尚未持久化內容可恢復。本修復保留最後有效磁碟資料與本頁新內容，不宣稱能在所有存放目的地都拒寫時創造另一份耐久儲存。
- Storage autosave 與 Story Library 維持兩個既有存放流程，沒有跨 DB 原子交易；部分成功時清楚提示並保留可重試快照，尚未完成前不得宣稱整份保存成功。
- Provider 真實錯誤／內容政策／付費 usage 與錢包結算、Google 真實 OAuth、跨裝置 Drive 版本競態、正式站 smoke 均未執行。Core 只提供既有 Mock 合約證據。
- 同章節跨分頁仍遵循原本最後提交完整快照的契約；未新增對話合併或版本衝突 UI。Storage 無 Web Locks 的跨分頁限制仍依既有文件。

## 修改範圍、合併條件與回退

直接影響：保存確認、退出生命週期、分支 UI handoff、回溯就緒判斷、自動記憶批次保存、Drive 本機就緒判斷。連動驗證：revision／world-state ownership、記憶、Local-first、Provider／billing Mock 合約、行動 UI、載入快取。

沒有修改 Save schema、IndexedDB version、角色卡／作者世界設定、Provider 路由、計價規則、Workers、AWS 或 #800。失敗 payload 只沿用頁內 Library failure Map，不新增持久化 schema。App.saveStory 的 boolean 仍代表同步受理；需要成功判定的入口使用現有 guard 的 async whenIdle。

可合併條件：此 PR 最終 head 的 Core、Maintenance、regression-impact、全部既有 Fast Browser 與三個 Story safety jobs 均成功，無未解決阻擋。部署需阿夜另行最終驗收，這次沒有授權合併／部署。回退為 revert 此 PR 並前進載入版本；不改寫玩家存檔、不做資料遷移，也無後端部署依賴。

## 前輪擴大驗收的歷史阻擋（733bb7e；本節為修復前記錄）

**另發現既有 P0：Linux WebKit 的 localStorage 備援跨分頁寫入可覆蓋另一份槽位，重新載入後仍遺失。**

- 使用原有 `storage-multitab.spec.cjs` fallback 案例，禁用 IndexedDB、確認 Web Locks 存在，兩個分頁同時新增 `left`／`right`。不是正式資料，也沒有故障注入 Storage 寫入函式。
- 單獨重複原測試 3 次，2 次失敗；改為等待正確資料的診斷仍有 1/3 逾時，並非只是在寫入後太早讀取。
- 另用兩個分頁、全新第三分頁及重新載入後的讀回，共 8 次觀察，有 **4 次只剩一個槽位，fresh page 與 reload 都相同**。資料見 `story-safety-fallback-evidence-2026-11-15.json`。該診斷測試本身是觀察記錄，8 次「執行完成」不能算成 8 次資料一致性通過。
- 本 PR 與原 main 的 `js/storage.js` blob 完全相同：`d9345860ac8c9ab52979e3ee9b4381fdd7683783`。Storage-only harness 不載入其他 App／Library 模組，因此已確認是既有儲存路徑缺口，不是本次 handoff 修復引入。
- 已確認可覆蓋，但 WebKit 的跨頁儲存可見性與 lock release 排序根因仍需更精確驗證。不能用加 sleep、重跑到綠、刪除測試或擅自改成另一套持久化協定宣稱解決；本輪沒有修改 fallback Schema 或改變多分頁契約。**此項尚未修復，必須阻擋本 PR 合併部署。**

三瀏覽器擴大本機執行初輪實際為 **150/153 通過**：Chromium 51/51、Firefox 51/51、WebKit 48/51。WebKit 三個失敗為上述 fallback 一項，以及保存重試按鈕後 whenIdle 提前觀察上一輪失敗的兩個案例；後者已補成涵蓋「失敗章節重播 → 新 autosave」的完整 retry barrier，Core 加入確定性 gate，Chromium／WebKit 的 8 個受影響 viewport 案例重跑全過。這不消除 fallback P0，也不把初輪 153 案例改報為全綠。

GitHub 第一個提交 `769e14d8dff352a79860f643ded844e4e17df946` 的 Core、Maintenance、regression-impact 已成功；Story safety Chromium 曾因同一 retry barrier 觀察缺口失敗，已修復。既有 story-experience 的 narrative-cache-preservation 1440px 曾在 reload 後出現場景排版 Prompt 不同；檢查發現 fixture 等 story ready，卻未明確等待它要驗證的 SceneStoryPreferences 還原包裝器。補等待該模組與 SceneHTML 後，原 byte-equivalence 斷言保留，獨立重複 3/3 通過；沒有修改敘事 runtime。最後提交的實際 CI 狀態仍以 PR Checks 與交付回報為準。

最新修正後本機驗證：完整 Core **211/211 run steps**、Maintenance **24/24 run steps**、新增確定性 Core **8/8 cases**；新增 save acceptance **36/36 cases**（Chromium／Firefox／WebKit 各 12，四種 viewport）通過。上述只代表這些新增修復；既有 WebKit fallback P0 仍保留為未解決阻擋。
