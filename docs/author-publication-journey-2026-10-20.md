# 作者與公開版本路徑驗證（2026-10-20）

本批接續 #760 的 P3 盤點，處理作者頁與玩家公開瀏覽路徑。P2 原定工程結案不變；[P3](product-p3-readiness-2026-10-20.md) 的正式帳務與投稿資料驗收仍待資料，不因本批通過程式測試而結案。

## 修正的行為

原本 `data/authors.json` HTTP／網路／JSON 錯誤會退成空作者清單，讓存在的作者被顯示為「找不到」。作品目錄或其中一頁失敗也會退成空清單，讓部分結果看起來像完整的零作品。

現在作者資料失敗顯示「作者資料暫時無法載入」與手動重試；只有有效作者清單確實沒有該 ID 時才顯示找不到。有效作者清單為空、有效作品清單為空仍保留原空狀態。作者 ID 無效時直接顯示格式錯誤，不發資料請求。

正式或社群目錄失敗、JSON 容器不符、作品缺少 ID、manifest 分頁缺少路徑時，保留其他成功來源，顯示「清單可能不完整」並把數字標成「已載入」。作者介紹及支持連結仍可使用；手動重試重新下載目前 metadata，成功後移除警告。重試不登入、不付費、不呼叫模型、不修改故事或存檔。技術錯誤與原始回應正文不進畫面。

本批沒有驗證所有 metadata 的語意或真實性，也沒有把前端載入成功當成作者授權／支付平台審核通過。既有內容分級偏好及支持連結的 HTTPS／noopener 規則沿用。

## 驗證分層

| 層級 | 使用的程式與檢查 | 界線 |
| --- | --- | --- |
| 作者 runtime | [回歸](../tests/author-profile-runtime.cjs) 執行實際 `author-profile.js`；覆蓋 HTTP／網路／JSON／結構失敗、真正不存在、空作品、部分頁成功、手動恢復、目錄數字及分級篩選。 | DOM 容器及 fetch 為測試替身；不是瀏覽器畫面或正式 CDN 驗證。 |
| 投稿輸出與公開 reader | [既有 publisher 測試](../tests/admin-author-profile-publish.cjs) 使用實際 prepare／create publication 程式產生 PR、作者與目錄內容，再把輸出交給既有 [唯讀核對工具](../scripts/audit-publication-status.cjs) 及作者 core。 | GitHub 請求、PR 開啟／關閉／合併狀態與目錄切換均是合成情境，未接正式 D1，也未真的發布測試作品。 |
| 手機／桌面完整瀏覽 | [作者 E2E](../tests/e2e/author-profile.spec.cjs) 新增 390／1280 寬度實際點擊作品預覽 → 作者 → 兩個支持連結 popup → 回作品預覽；驗證公開版本 v2、HTTPS 過濾、無模型請求、無水平溢出。另測作者載入失敗與部分社群目錄的手動恢復、有效空資料與不存在。 | 支持頁以本地測試 route 攔截，沒有付款、外部收款驗收或作者入帳。乾淨網址在本地靜態 server 由測試對應到實際 author.html。 |

Publisher 組合案例檢查：PR 開啟時，即使 PR 分支已產生新 metadata 仍不能判為發布；未合併關閉仍不符合；合併後若公開版本過舊或身份不符仍列差異；只有合成 PR 合併證據與新公開 metadata 相符才得到 `merged_catalog_match`。此結果沿用 #760 的人工核對快照、commit 祖先與完整授權要求，不會把 D1 狀態自動寫成 `published`。

## 重現與 CI

```sh
node tests/author-profile-core.cjs
node tests/author-profile-runtime.cjs
node tests/catalog-author-linkage.cjs
node tests/catalog-version-metadata.cjs
node tests/admin-author-profile-publish.cjs
node tests/admin-author-profile-update.cjs
node tests/publication-status-audit-core.cjs
npm run test:e2e -- tests/e2e/author-profile.spec.cjs --project=chromium
```

前七個 Node 命令在本地執行；作者 E2E 由 GitHub Fast Browser E2E 的 product-explore Chromium 組執行，產生手機／桌面及部分載入截圖。本地環境沒有可用瀏覽器，不以語法檢查冒充瀏覽器測試通過。Core tests 新增 runtime 回歸。作者頁資產版本提升至 `author-profile.js?v=4`。

正式站完成部署後應核對 `author.html` 與 `js/author-profile.js` 的內容。真實付款、投稿 D1 狀態及正式供應商帳單仍依 P3／O1 另行驗收。
