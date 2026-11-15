# PR #963｜備援寫入與 Firefox 搜尋阻擋修復

基準 main：`6a624446f33b031fd806230ec40d562a4f663596`；修復前 head：`733bb7e32ee75dbcc8a1c9325023ed41792afa15`。本輪只更新 #963 原分支，未合併、未部署、未呼叫付費 Provider、未讀寫正式玩家資料，未修改 #800。

## P0 根因與可重現證據

`storage-multitab.spec.cjs` 使用真正 Storage、同一 BrowserContext 的不同文件、原生 Web Locks；禁用 IndexedDB。舊快照一次覆寫整個 localStorage key，雖有短期 story lock，卻依賴「下一個鎖持有者讀到上一個已提交快照」。Linux WebKit 不滿足這個假設。

新增無額外 getItem 的觀測：只記錄實際 `_readFallbackSnapshot()` 回傳值、成功 setItem 的 metadata、原生鎖請求／取得／釋放及 storage event；不記錄故事本文或金鑰。持有第一個實際鎖，以 Promise gate 排入第二個請求，`navigator.locks.query()` 證實同時只有一個 held、一個 pending，然後明確釋放。

修復前 3 輪受控觀察中 1 輪：left 讀到 null → 寫 left → 釋放；right 隨後取得鎖卻仍讀 null → 寫 right → 收到 left 的 storage event。全新頁只讀到 right。前輪原本的 8 次／4 次持久遺失證據另保留原檔，不改報成通過。完整順序與時間戳見 `story-safety-blockers-evidence-2026-11-15.json`。

| 原有機制 | 真正作用／缺口 |
| --- | --- |
| `_withStoryLock()` | 確實互斥；不保證刷新另一文件的 localStorage 快取 |
| `_readFallbackSnapshot()` | 讀取該文件看到的值；WebKit 可在鎖取得後仍回傳舊值 |
| `_persistFallbackSnapshot()` | 將操作 rebase 到讀到的快照後整鍵替換；舊空快照會消除另一已確認槽位 |
| `_expectedRevision` | IndexedDB 世系版本，非每次 fallback 寫入遞增版本；不能作跨頁 CAS |
| `owner` | 原寫入者／混合來源的標記，不是原子所有權檢查 |
| `_fallbackSnapshotComplete` | 控制回遷 IDB 時是否可依版本採用完整快照／刪除，不處理快取可見性 |
| `storage` event | 已觀察到晚於第二次讀寫；不能當成先行寫入的同步屏障 |
| 原 `flush()` | 等佇列卻吞掉備援錯誤；無法區分「受理」與「已保存」 |

## 最小修復與相容性

保留原 `bao-lab-fallback` v1、故事 Schema v4、IndexedDB v1。沒有新持久化格式、資料搬移、第二套狀態管理、UA 判斷、sleep 或增加重試／timeout。

- 同源文件啟動時以獨立 Web Lock `bao-lab:story-fallback-writer-v1`、`ifAvailable:true` 競爭**文件生命週期備援寫入權**。短期 story lock 仍保留。所有快照寫入均先驗證該權限。
- 未取得的文件維持唯讀備援狀態，即使原文件稍後關閉也不接手，避免沿用舊快取。無 Web Locks 時拒絕 fallback 寫入。正常 IndexedDB 單筆交易與多分頁並行仍可用。
- 頁面 `pagehide` 後舊權限不可再使用；恢復的舊文件必須重新開啟，不能假定原生鎖仍有效。
- 衝突回傳 `BAO_FALLBACK_WRITE_UNSAFE`；`flush()` 拒絕，保留頁內 cache 與每個槽位／autosave 的最新失敗操作。警告寫明「本頁未儲存」、提供「匯出本頁故事」；不以重試按鈕暗示原頁可安全接手。匯出仍走原有除密完整故事格式。
- 恢復流程：先匯出待保存故事／槽位，關閉其他夜灣分頁，重新開啟讀取有效持久資料，再匯入。重新開啟後兩份槽位皆可持久保存。
- 配額拒寫保留最後有效快照；同一安全持有者在後續重試時一起重播尚未保存的操作，包含刪除意圖。啟動失敗的整批操作以一次快照提交，避免只重播新 autosave 而漏掉先前槽位。
- 第二個 IDB 文件不遷移／清掉仍由其他活躍文件持有的 fallback；其正常 IDB 寫入可繼續。原文件關閉、次頁重開取得權限後，沿用原 revision 政策回遷，保留兩邊有效資料。
- 手動槽位確認改讀真正的 fallback snapshot，不再只查舊 `story:slots` key；衝突時顯示原因。載入版本 storage 10、write guard 5、site UI 210，契約同步更新。

**行為取捨：備援模式不再承諾多分頁同時保存。拒絕衝突是本次安全契約；不是讓兩個寫入假裝成功。** 正常 IndexedDB 模式仍可多頁寫不同槽位。所有舊版本分頁必須重載才能參與新租約；舊版 runtime 不會遵循新鎖，不能以此修補保證新舊混合版本同寫的安全。備援使用者收到衝突時應先匯出，再關閉其他分頁重開。

## Firefox 320px 的真正原因

已下載指定 Actions run `43688004269` 的 Firefox artifact `14150179650`，檢查 trace network、原生 click 與頁面 snapshot。只有 official／manifest／page-0002 回應，**從未請求 page-0001**。Playwright 先遭固定手機導覽列攔截，重新捲動後在 y=463 按鈕座標執行點擊；action snapshot scrollTop=326，after snapshot=275，下一個觀察=208。頁面在按下／放開之間仍平滑捲動，沒有觸發 pager 的 click handler。增加目錄 timeout 無法解決根本沒發出的請求。

三份歷史 JS 與現有載入鏈可相容：與 baseline 相比，其餘差異只有敘事選項、版本與 #963 保存相關包裝；共用 discovery core、CSS、官方目錄、community manifest／分頁內容未變。起始為較新的 page-0002，目標仍在 page-0001。沒有 #963 搜尋 runtime 回歸證據。

前後配對採用相同 `prefers-reduced-motion: reduce`，讓既有 CSS 停用測試中的平滑捲動；保留原生 locator.click、原始卡片可見斷言及 8 秒 expect timeout，不使用 force、dispatchEvent 或刪除 before。點擊後增加實際 page-0001 成功回應、兩頁 loaded set、cursor=-1 與 target metadata 的斷言。

連動 pending-pager 測試另補明確屏障：input 只排入下一個 render frame，必須先觀察 `aria-busy=true` 再釋放受控目錄回應。否則回應可先完成，合法走「目前顯示」標籤，測試卻要求已啟動完整搜尋的「找到」標籤。這是 fixture 時序，保留全部既有結果／焦點／數量斷言，沒有更動搜尋產品程式。

## 測試矩陣與判定

| 驗證 | 覆蓋 |
| --- | --- |
| Storage core | lease 衝突、確定性舊空快取、原始 payload 保留、無鎖拒寫、配額復原、刪除／autosave、20 槽位容量、IDB 降級、混合 revision |
| 初始化／遷移 | 首／中／後段失敗、重播期間新操作、配額同時失敗再重試、有效刪除、IDB rollback、活躍 fallback 不被次頁清除 |
| 三瀏覽器 storage | 保留原三項測試情境，改以明確衝突＋安全復原驗證 fallback；每瀏覽器 8 輪原生 gate 壓力測試；fresh／reload／恢復後 reload、刪除、quota、匯出無金鑰、焦點、320px、pagehide、無鎖／正常 IDB |
| 原 #963 故事安全 | 保存確認／失敗重試、取消／退出、回溯分支、記憶失敗與恢復；原 runtime 修復保留 |
| 搜尋對照 | 320／390／1280 前後版本，歷史缺漏先成立、點 pager 後目標出現；完整搜尋、目錄失敗重試、待完成查詢與焦點等原斷言保留 |
| 完整檢查 | 本機 Core 211/211 run steps、Maintenance 24/24；Regression Impact Gate 69/69；首輪三瀏覽器 Storage 45/45（含各 8 輪 gate）；最終故事／搜尋及 GitHub Actions 結果記錄於 #963 交付與 Checks |

可合併條件為最終提交的 Core、Maintenance、impact gate 及所有必需三瀏覽器 jobs 成功，沒有 fail／pending。本 PR 仍留草稿待阿夜最終驗收；本次不合併、不部署。不能只憑綠色 CI 宣稱真實 Safari／iOS 已通過。

剩餘風險：實體 Android／iOS、WebKit/Safari 真實私密模式／quota／OS 強制終止及 BFCache、舊新版本混用、真實 Provider、Google OAuth／Drive、正式環境均未驗證。失敗內容只保留頁內，若所有存放目的地拒寫且仍強制關閉，瀏覽器無法承諾恢復；UI 明確要求先匯出。恢復測試使用隔離 fixture，沒有真實模型請求。回退使用 revert 並更新載入版本，不改玩家持久資料。
