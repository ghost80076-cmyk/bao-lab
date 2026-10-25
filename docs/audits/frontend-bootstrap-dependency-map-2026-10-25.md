# 夜灣 2026-10-25｜前端初始化依賴與故障隔離責任表

基準：`main` / #832 合併提交 `f06b03abc327f9f81d7c4f61eb73c6c6ecb04491`。本表只記錄當前可由程式及 CI 驗證的初始化責任，**不把「排在某鏈中」直接推斷為可平行化或可移除**。舊 P0／P1／P2 的工程結案不因此重開。

## 載入分層與相依

| 層 | 實際入口 | 分類 | 失敗語意／已驗證邊界 |
| --- | --- | --- | --- |
| 靜態基座 | `index.html` 的 `storage.js`、`state.js`、`api.js`、`chat.js`、`character.js`、`app.js`、`site-ui.js` | 啟動必要 | DOM parser 依序載入；不能套用可選腳本的 catch-and-continue；基座未載入時需要單獨頁面錯誤/恢復策略 |
| 前置 world 擴充鏈 | `global-bridge` → `world-state` → `character-status` → `three-realms-*` → `world-modules` → `world-clock` → `world-state-cost` → `same-model-state-merge` → `world-module-ui/manager` → `world-relevance` → `character-status-ui` → `world-state-hook` | 需要依序且具相容性前置依賴 | 失敗標記 `world=unavailable`，進入故事顯示狀態更新警告；**不得誤標 ready**。此處包含 API.send wrapper，未完成逐個 Hook 的安全平行化論證 |
| Provider/成本 | `cost-control` → `provider-browser-compat` → `model-routing` → `provider-diagnostics` | 交通/計費敏感、獨立載入鏈 | 已有單獨 catch，不把它視作可自由略過的功能；任何調整都需 provider/http/usage 契約驗證 |
| 故事主鏈前段 | `storage-write-guard`、敘事與玩家設定、memory workbench、`story-library`、`story-backup`、`prompt-cache`、`prompt-orchestrator`、`episodic-memory` | 資料與發送敏感 | 必須維持順序；世界鏈等待點 `then(() => worldModulesReady)` 只代表**已終止載入嘗試**，世界是否就緒須另看 health 狀態 |
| 可選子鏈 A | `google-drive-config` → `google-drive-sync` | 可選 I/O | #832：404 不截斷 Prompt/cache、reader 或 ledger，保留原本次序，不自動訪問玩家 Drive |
| 世界鏈等待後 | NPC 時間線、世界書、reader、revision/branches、streaming、request lifecycle | 核心故事執行/閱讀 | 依原序安裝 Hook；此段任意 core 404 仍可能阻斷其後續，需要另外的 fail-safe 設計；不能不經分類直接 catch |
| 可選子鏈 B | `conversation-search-core` → `conversation-search` | 純本機搜尋工具 | #832：404 不阻斷後續 story reader/hook/requests |
| 可選子鏈 C | `inspiration-copy` | 呈現/剪貼工具 | #832：404 不阻斷後續故事工具；#830 同一 URL 載入 Promise 合併並待 load 結束 |
| 故事主鏈後段 | 修訂、streaming、快捷指令、mobile layout、演員包、角色、context inspector/health、雙系統、actor mode、story extensions、settings effects、control center、request ledger | 不可隨意省略的複合主鏈 | 其中有純 UI 與 Hook 邏輯，按目前載入順序保留；單檔 404 整鏈截斷仍是未解的失敗域，必須按具體模組補再測 |
| 作品與搬移 | `work-package`、`character-library`、`device-transfer`、`author-diagnostics` | 獨立載入鏈 | 自有 catch；不得與遊戲保存主鏈混淆 |
| 品牌及 Player UI | `brand-ui`、`bao-mascot`、`reader-context`、`player-shell-v2`、`player-builder-v2`、`story-start-readiness` | 獨立呈現/入口鏈 | 首幀 CSS 已由 #819/#829 前置；若要抽取更多懶載入，需先比對首次進入與主題/寬度 |
| 入口旁支 | experience、API settings/model discovery、autonomous world workbench | 各有獨立 catch | 不需要修改 Prompt 順序，也不能將外觀更新誤認為故事核心已載入 |

依原始 `js/site-ui.js` 直接 `loadBAOScript` 呼叫盤點，六個具名分層（旁支、world、Provider、故事主鏈、作品/搬移、品牌/Player）分別為 6、15、4、59、7、9 個直接呼叫；另有 5 個可選子鏈檔案。這是**原始靜態呼叫數**，不是網路請求實際次數或 runtime 完整依賴圖。

## 已修復與新增回歸

- #830：同一 script `src` 的 in-flight Promise 共用，載入完成事件前不會誤判 ready；Node VM 回歸涵蓋 404、不同版本與相同 URL 併發。
- #832：上述三組可選子鏈局部 catch；world chain 失敗明示 unavailable；390/1280px 404 瀏覽器驗證。
- 本輪 PR：新增 `tests/e2e/extension-recovery-and-slow-load.spec.cjs`：390px 可選 JS 404 時建立與儲存故事、重載後恢復、透過既有匯入入口再次還原；1280px 世界核心 JS 404 時，先建立存檔再重載，確認故事內容未被覆蓋且狀態不可用提示；390/1280px 持續延遲可選 JS，確認相同 URL 併發只建立一支 script、未提早宣告就緒。所有案例禁止額外 POST。
- 上述 E2E 僅使用合成角色/故事 fixture，不存取正式玩家資料，不呼叫付費模型，也不向正式 D1/Provider 寫入。

### 故障注入與 PWA 的邊界

瀏覽器 E2E 在**測試層**停用 Service Worker，原因是 Playwright 的 `page.route()` 無法攔截已被 Service Worker 接管的請求；首次頁面可成功注入 404，但重新整理後可能由快取供應原腳本，產生錯誤的「故障驗證成功／失敗」結論。測試新增注入次數斷言，確認 reload 階段的 HTTP 404 確實發生。這並非關閉正式產品 PWA，也**不代表**已測試 Service Worker 離線快取更新策略；該情境須另起獨立 PWA 測試。

## 尚未完成，不得宣稱全面結案

1. `js/site-ui.js` 其餘長鏈中，每個 Hook 的必須/可選分類與單一 404 fail-safe 還未逐檔完成；不能因本表存在就刪除既有 scripts。
2. `world=unavailable` 的短暫 toast 不等同永久狀態指示；如果有實際玩家失去狀態追蹤的重現，應在故事設定的既有狀態區域顯示持續不可用，而不是新增一套衝突的診斷 UI。
3. 新故事完整 UI 入口、任意玩家舊備份/手機雙開、Android Chrome/iOS Safari 實機、低速/離線/CDN 快取錯版本，尚不在此次合成 fixture 的完整承諾範圍。應保留正式站資產 SHA 比對與冷載入畫面證據。
4. 仍需從實際 workflow job／artifact 驗證最終 PR head。CI 綠燈不是對任意模型輸出品質或帳務安全的保證。

## 退出條件

本次 PR 的 Mobile Reading E2E 加入真實瀏覽器測試清單；四個新案例均成功、原 Core／Storage／settings／request-feature／Fast Browser 相關測試通過，才可合併。若有測試因與產品實際語意不符而失敗，先校正測試預期並保留真正的安全斷言，不准直接跳過失敗注入。

## 第五批：PWA 離線 HTML fallback 更新

現有 Service Worker 採 navigation network-first，失線時回退到預快取的 `/index.html`；但舊 `yorubay-shell-v1` 只有 install 時寫入 HTML，成功的線上導航不會更新 fallback。如果 `sw.js` 長時間沒有位元變動，已安裝 PWA 的離線首頁殼可能停留在較舊版本。

修正採最小策略：
- cache 名稱升為 `yorubay-shell-v2`，本次 Service Worker 更新會在 activate 清掉舊 cache。
- 每次同源 navigation 成功且 HTTP response 為 ok 時，把 response clone 寫回 `/index.html`；失線仍使用最後一次成功線上導航保存的 HTML。
- 不宣稱整站離線可玩：目前 APP_SHELL 沒有包含所有 JS/CSS/資料檔，本 PR 不擴大 PWA 快取範圍。
- Browser E2E 會先把 cache 中 `/index.html` 人工改成 stale marker，再執行受 SW 控制的線上 reload，確認 cache 被新 HTML 覆蓋且首頁仍可見。
