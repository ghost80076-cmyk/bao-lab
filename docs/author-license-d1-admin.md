# 夜灣作者授權與作品上架（第一階段）

## 操作流程

1. 管理員在後台「作品上架管理」填寫穩定的作者 ID，展開「作者授權與單張作品權限」。
2. 「讀取作者預設」讀取 Cloudflare D1：沒有紀錄時，顯示保守預設（轉載、改作須取得同意，商業用途禁止，要求標註作者）。
3. 如需修改作者預設，展開「編輯作者預設授權」，確認後點「儲存作者預設至 D1」。寫入即生效於往後的新上架／更新提交，不會回溯修改已發布作品。
4. 本次作品可選「套用作者預設」或「單張作品獨立覆寫」。後者僅影響此提交，不會修改作者預設。
5. 原有權利確認、內容驗證與 GitHub PR 審核繼續保留。新授權快照寫入角色檔 `meta.license` 和目錄 `license`；只有合併 PR 後才會成為公開版本。前台作品詳情將展示授權條件。
6. PR 建立成功後，D1 另記錄一筆 `pending_review` 提交快照（含 PR 編號／作品／版本／作者／條款），不是已發布紀錄。如果 PR 已建立但 D1 記錄失敗，後台會顯示警告，**不要重按提交造成重複 PR**，應先手動對帳。
   
## D1 表格（Worker 第一次合法存取時 CREATE IF NOT EXISTS）

- `author_license_defaults(author_id PK, policy_json, revision, updated_at)`
- `work_license_submissions(id PK, pr_number UNIQUE, pr_url, work_id, author_id, published_version, snapshot_json, status, submitted_at)`

目前沒有 D1 直連憑證交給前端，後台一律走管理員驗證後的 Worker API。

後端管理員 API：

- `GET /admin/authors/license-default?author_id=<id>`
- `POST /admin/authors/license-default`，JSON: `{"author_id":"<id>","policy":{"redistribution":"permission_required","adaptations":"permission_required","commercial_use":"prohibited","attribution_required":true}}`
- `POST /admin/characters/publish-pr`，原有內容外加 `license_mode:"inherit"|"custom"`；custom 才需 `license_policy`。

所有 D1 資料庫端點依賴現有 admin 認證與 Worker DB binding，沒有新增匿名讀寫入口。既有帳號作者 API 不等於公開可寫授權。

## 授權語意與界線

- `allowed`：作者原則上允許對應使用。
- `permission_required`：需要事先取得個別許可。
- `prohibited`：作者沒有提供該類型使用許可。
- `attribution_required`：在授權使用時要求標註作者；不代表其他選項被自動允許。
- 此欄位規範「第三方轉載／改作／商用」，與創作者政策中授予夜灣執行公開服務的非專屬必要授權不同。
- 作者須確保素材及共同創作者權利。條款無法替代著作權法，也不能阻止本地玩家複製已提供到其裝置的資料。

## 狀態與限制

- 既有已發布作品沒有自動加上新授權：僅新上架、更新 PR 會加入快照，不應把空值解讀成「自由使用」。
- D1 提交紀錄的 `pending_review` 是真實的等待審核狀態；目前不會自動在合併後標示為 `published`。公開版本應以合併後的目錄與角色檔為準。
- 因為使用者瀏覽器仍需取得完整角色 Prompt 才能執行某些 BYOK、本地遊玩功能，這不是「核心設定私有化」或防止提取角色內容的機制；其他作者未來核心設定遷移私有後端是另一個階段，需要獨立設計。
- 未保存玩家對話，Local-first 仍然保持原狀。

## 投稿紀錄核對資料匯出

後台「作品上架管理 → 投稿紀錄核對 → 下載投稿核對資料」提供管理員唯讀匯出，無需先載入角色卡。詳細欄位、分頁與核對方式見 [匯出說明](publication-metadata-export-2026-10-20.md)。匯出不包含 `snapshot_json`，因此不取代完整授權快照審查；`pending_review` 不因匯出而變為 `published`。
