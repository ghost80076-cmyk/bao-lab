# 管理員投稿核對資料匯出（2026-10-20）

此批接續 #760 的離線核對工具，補上正式輸入的取得入口：管理員登入既有後台，在「作品上架管理 → 投稿紀錄核對」下載 JSON。無需先載入或重新投稿角色卡，不建立 PR、不更新 D1 提交狀態、不呼叫模型或付款服務。

## 端點與權限

`GET /admin/characters/license-submissions?limit=100&after_id=0` 沿用既有管理員 Bearer 驗證；匿名、錯誤金鑰或玩家 session 不能取得紀錄。非 GET 回傳 405。資料庫操作只有 SELECT，不為了匯出建立表、補資料或寫入狀態。回應沿用 `Cache-Control: no-store`。

第一頁讀取當前 `MAX(id)` 為 `as_of_id`；之後以 `after_id`、相同 `as_of_id` 向前分頁，依 ID 遞增、每頁最多 200 筆。後續請求如 `?limit=100&after_id=100&as_of_id=150`。新插入且超過上界的紀錄留到下一次匯出。游標或 limit 無效回 400；尚未建立 `work_license_submissions` 表回 409 `publication_submissions_not_initialized`，與確實存在但無資料的空表分開。其他讀取或資料格式錯誤回通用 503，不把 SQL／原始錯誤回傳前端。

這是固定 ID 上界的**分頁讀取，不是資料庫一致性快照**。讀取期間已有資料若被修改或刪除，不能用匯出檔保證同一時刻的全表狀態。正式審查仍需核對匯出時間及來源。

## 格式與保護

只匯出 `id`、`pr_number`、`work_id`、`author_id`、`published_version`、`status`、`submitted_at`，不查詢或輸出 `snapshot_json`、角色全文、PR URL、玩家資料或憑證。後端與下載端均白名單挑選欄位。

下載檔為 `schema_version:1`、`scope:publication_submission_metadata` 的 envelope，含 `complete:true`、`as_of_id`、第一頁的 `captured_at`、一致性界線與 `rows`。下載端檢查游標前進、上界一致、排序、必要欄位與分頁完整；任何頁失敗、無法前進或超過本次上限均不產生檔案，允許重新開始。預設每頁 100 筆、最多 100 頁，即最多 10,000 筆；到達上限但仍有下一頁時明確失敗，不輸出截斷資料。

完整空表可以匯出零筆，但「表不存在」不會產生空檔冒充零筆。管理員金鑰只沿用目前分頁記憶體中的驗證，不寫到下載檔。瀏覽器仍由使用者選擇保存位置。

## 交給既有核對工具

```sh
node scripts/audit-publication-status.cjs --submissions /private/yorubay-publication-submissions.json --pulls /private/pulls.json --catalog /private/catalog.json --report /private/publication-audit.json
```

CLI 現在接受完整匯出 envelope，拒絕 `complete:false`；原本 JSON array 輸入維持支援。PR metadata 與正式／社群 catalog 仍需另外取得並保留版本證據。Envelope 本身不是數位簽章或已驗證的來源，`complete` 只表示下載端成功走完這次分頁範圍，不代表投稿已發布。

`merged_catalog_match` 仍只表示 metadata 對應；合併 commit 祖先關係、快照新鮮度與完整授權條款另行人工審查。工具不把 D1 寫為 `published`。真實帳單、錢包與退款核對 O1 不在此匯出範圍。

## 驗證與部署

- [端點與 collector 回歸](../tests/publication-metadata-export-core.cjs)：透過實際 admin router 驗證未授權拒絕且不讀 DB、只有 SELECT、固定上界、空表／缺表、錯誤不外洩、欄位白名單、游標異常及不完整下載拒絕。
- [CLI 回歸](../tests/publication-status-audit-core.cjs)：完整 envelope 可直接核對，不完整檔案拒絕，既有 array／來源檢查保留。
- [後台 Chromium 回歸](../tests/e2e/publication-export.spec.cjs)：未登入不發匯出請求、驗證後下載兩頁 101 筆、檔案不含測試金鑰或額外私密欄位、第二頁失敗不產生第二份檔案。所有 Worker 回應均為測試替身，並未取得正式 D1 紀錄。
- Core tests 與 Worker 部署前檢查納入端點回歸；Fast Browser E2E 的 product-explore 組執行下載操作。正式 security smoke 加入匿名匯出必須回 401 的檢查，不使用管理員金鑰。

本批需同時部署 Pages 的 `admin-wallet.html`／`js/admin-publication-export.js` 與 Worker 的既有 `admin-publication-routes.js` 模組；沒有增加 DB binding 或資料遷移。舊 Worker 未提供端點時，後台顯示版本提示，不產生匯出。沒有在此批聲稱正式投稿清單、帳務或 P3 正式營運驗收已完成。
