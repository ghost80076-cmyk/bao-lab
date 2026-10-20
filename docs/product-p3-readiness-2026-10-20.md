# P3 產品現況盤點（2026-10-20）

目前判定：**P2 原定工程已結案，P3 產品路線仍在推進，不能宣稱正式營運驗收完成。** 本輪先對既有功能建立可追溯盤點，不把早期產品規劃中的項目重新當成缺失功能，也不把通過測試等同已收到真實付款。

## 階段與版本

- P0／P1／P2 技術債工程結案依據見 [維護狀態](maintenance-status.md) 與 [P2 結案](p2-closeout-2026-10-18.md)，範圍限定當時工程清單。
- 本頁以 P3 指稱「公開作品與作者生態、Hosted 點數營運」的產品盤點，不是替舊技術債新增隱藏必修項。
- #749–#759 的請求追蹤、NPC 經歷、知情隔離與召回驗收是後續產品改善。#759 合併版本 `821cf1c4b6dcfe46dcd305f8666fe362d6e1c7f5` 的 Pages [部署](https://github.com/ghost80076-cmyk/bao-lab/actions/runs/39303635915)、[正式站 smoke](https://github.com/ghost80076-cmyk/bao-lab/actions/runs/39303636343) 與 [來源／手機桌面驗證](https://github.com/ghost80076-cmyk/bao-lab/actions/runs/39303636276) 成功。正式站 `index.html`、`js/episodic-memory-core.js`、`js/context-inspector.js`、`js/site-ui.js` 與該 commit 內容比對成功。
- 既有產品檢查基準亦為上述 commit；投稿唯讀工具及其回歸為本批新增檔案，證據的 `new_work_files` 另列。本地檢查結果及選定檔案 SHA-256 見 [盤點證據](product-p3-readiness-evidence-2026-10-20.json)；不是持續更新的正式環境健康報告。

## 已存在的能力與未結項目

| 項目 | 目前存在的能力與依據 | 尚未驗收的部分 |
| --- | --- | --- |
| 作品櫥窗 | 正式與社群 metadata 目錄、作品預覽、作者連結；[作者關聯測試](../tests/catalog-author-linkage.cjs)、[公開介紹頁](public-work-discovery.md) 與產出檢查通過。 | 公開介紹頁是人工審選子集，不代表每部作品都可索引；外部作者／分級擴大仍需對應授權與內容審核。 |
| 作者頁與支持連結 | [作者頁](../author.html) 依穩定 author_id 列作品；[core](../js/author-profile-core.js) 接受最多五個 HTTPS 支持連結，[公開資料](../data/authors.json) 已有多連結。 | 連結格式有效不等於收款可用；本輪沒有交易、支付平台審核、作者入帳或退款證據。 |
| 帳號與作者身份 | [身份測試](../tests/account-author-identity.cjs)、[作者更新](../tests/admin-author-profile-update.cjs) 與 [投稿 PR](../tests/admin-author-profile-publish.cjs) 通過 mock 測試。 | 不代表任意帳號均可公開發布，也不代表正式站所有角色權限已逐帳號驗收。 |
| 投稿與公開版本 | 管理員提交後建立 GitHub PR；公開版本以合併後角色檔與目錄為準，授權有快照。[目前操作說明](author-license-d1-admin.md)。 | D1 的 `pending_review` 尚無合併後自動同步為 `published` 的流程；PR 建成但 D1 寫入失敗仍須人工對帳，不能盲目重送。 |
| Hosted 點數 | 現有前端 adapter、錢包預留、結算、儲值原子性／重播保護與用量查詢測試通過。[請求與帳務界線](request-observability-npc-timeline.md)。 | 本地／mock 測試不能證明目前正式 Worker 部署版本、實際收款入帳、真實退款或扣款與正式供應商帳單一致。 |
| 事件召回與角色知情 | #753／#759 已補來源、別名與限定信任用語對應，[固定驗收](recall-acceptance.md) 分列開發與保留案例。 | 抽象比喻仍有漏召回，沒有一般語意理解保證，也沒有真實玩家 recall rate 或費用節省結論。 |

基準 metadata 有 3 位作者、75 筆目錄記錄，依 work ID 去重為 64 部作品；2 位作者共列 3 個支持連結。正式與社群目錄有重複 ID，不能把 75 當成不同作品數；分級偏好還會影響前台可見數。這些數字是 repo 快照，不是活躍作者、營收或玩家數。

## 本輪完成與驗證界線

[證據](product-p3-readiness-evidence-2026-10-20.json) 記錄 11 支既有 Node 驗證腳本、1 支新投稿核對回歸及 `npm run check:public-works`，共 13 個命令全部成功。沒有新增付費模型呼叫、付款、正式 D1 寫入或重新發布作者內容。本輪未執行完整作者 E2E；#759 的手機／桌面驗證針對請求檢視與 NPC 功能，不冒充作者發布端到端驗證。

## 下一批與結案條件

| 後續工作 | 可推進的具體結果 | 完成條件／依賴 |
| --- | --- | --- |
| 投稿狀態核對 | 本輪已提供離線唯讀核對工具，比較 PR 合併／關閉、repo、work ID、作者及公開版本；取得正式匯出後產生實際差異清單，再決定狀態同步方式。 | 需要正式提交紀錄及對應 PR／目錄證據；先驗證拒絕、重試、版本不符與 D1 寫入失敗，不直接批次改正式資料。 |
| Hosted 正式營運驗收／O1 | 取得正式收款、入帳、扣款／退款及 Provider 帳單與用量明細，形成可追溯核對結果。 | 缺少正式帳單與 D1 明細時維持未對帳；request trace／Provider 回報成本不能代替正式發票或帳單。 |
| 作者與玩家路徑 | 在固定測試資料驗證作品 → 作者 → 支持連結，以及投稿 → PR → 合併後公開版本；保留無登入 BYOK 路徑。 | 瀏覽器案例及公開資產核對通過；外部支持連結的實際收款狀態另以營運證據確認。 |

P3 結案必須逐列標明程式與正式營運證據，不以更多 PR 數量、頁面存在或綠色測試代替。F1–F3 工程後續仍依 [原啟動條件](p2-disposition-2026-10-18.md)，不因 P3 命名自動重做全部 CSS、workflow 或相容路徑。

## 投稿狀態唯讀核對工具

```sh
node scripts/audit-publication-status.cjs --submissions /private/submissions.json --pulls /private/pulls.json --catalog /private/catalog.json --report /private/publication-audit.json
```

三份輸入均為 JSON array；資料由操作者自行匯出，不帶憑證、不由工具查詢正式服務：

- `submissions`：D1 `work_license_submissions` 的 `pr_number`、`work_id`、`author_id`、`published_version`、`status`。數字須為正整數；其他欄位不複製進報告。
- `pulls`：GitHub PR metadata，至少含 `number`、`state`、`merged_at`、`merge_commit_sha`、`base.ref` 與 `base.repo.full_name`。必須屬於 `ghost80076-cmyk/bao-lab` 的 `main`；repo 不符、合併證據不全或重複 PR 快照均列差異。
- `catalog`：把正式及社群 metadata 目錄合成 array，含 `id`、`author_id`、`published_version`。同 ID 的作者或版本不一致時拒絕判為符合。

工具只處理 `pending_review`；其他狀態標記 `not_pending`。PR 尚開啟／未合併關閉會分別標示；已合併但目錄缺失、作者不符、版本較舊／較新、輸入重複或證據不全皆要求檢查。`merged_catalog_match` 只表示匯出資料的身份與版本符合，**不等於已驗證發布或可直接寫入 `published`**：仍須人工確認快照時間、合併 commit 與目錄的祖先關係、完整授權 snapshot。GitHub metadata 與 D1 資料不作自動信任轉換。

輸出只含必要識別、狀態與計數，不複製提示詞、角色全文或 `snapshot_json`。命令不發網路請求、不寫 D1、不修改輸入，報告須寫到不存在的新檔案；0 表示無需額外處理的格式／metadata 差異，1 表示有差異，2 表示參數／輸入／輸出錯誤。退出 0 也不構成正式發布驗收完成。

[回歸](../tests/publication-status-audit-core.cjs) 涵蓋錯 repo、開啟／拒絕 PR、缺少合併證據、錯作者／版本、重複快照、正常重複目錄、內容及格式錯誤的原文不外洩、輸入未變與檔案防覆寫；Maintenance CI 執行。尚未提供正式匯出，因此本輪沒有真實投稿差異清單。

## 接續批次：作者路徑與載入失敗恢復

本批補上 [作者／公開版本路徑驗證](author-publication-journey-2026-10-20.md)：作者資料載入失敗、真正不存在與作品清單空值分開顯示；部分作品目錄失敗時保留已取得的公開資料，明示清單不完整並提供手動重試。新增手機／桌面作品 → 作者 → 兩個支持連結 → 作品預覽的瀏覽器案例，以及實際 publisher 輸出接入唯讀核對／作者 reader 的 mock 組合測試。這些驗證不構成正式支付、D1 提交狀態或真實合併驗收。

## 接續批次：管理員投稿紀錄匯出

本批補上 [投稿 metadata 匯出](publication-metadata-export-2026-10-20.md)。管理員可以從既有後台下載分頁讀取的 D1 提交紀錄，交給既有離線工具核對；只讀取核對必要欄位，不自動修改提交狀態。這提供取得正式輸入的入口，**本批仍未取得或核對真實 D1 投稿紀錄，也未完成 O1**。
