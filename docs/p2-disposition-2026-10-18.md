# P2 剩餘項目處置清單（2026-10-18）

基準為 #742 的產品版本；本清單區分已完成、必要保留與後續優化。完整逐檔引用／blob SHA 見 [證據 JSON](p2-closeout-evidence-2026-10-18.json)。

## 明確處置

| 項目 | 判定 | 原因／驗證 |
| --- | --- | --- |
| 品牌重複 CSS 與工具選單的同檔後置覆蓋 | 已修正 | #736、#737；載入回歸、六寬度 × 五主題與截圖。 |
| 六條主機 Chromium 安裝 | 已整理 | #734、#735；共同安裝與觸發依賴，保留專用測試。 |
| 八條部署資產流程 | 已整理 | #739–#741；同輪 bytes 比對；#741 合併後八流程實際成功。 |
| Fast E2E 空組／缺檔假綠燈 | 已修正 | #742；10 項回歸與主線實際四組 E2E 通過。 |
| 其他 CSS、媒體條件與主題覆蓋 | 保留 | 60 檔均有正式引用；手機、平板與桌面條件不同。沒有可直接視為廢檔的項目；不宣稱所有 selector 已審計。 |
| 預裝容器、多瀏覽器矩陣與 push-only 安裝 | 保留 | 執行環境與驗證責任不同，不能一律套主機 Chromium 安裝。 |
| 正式部署／稽核流程 | 保留 | 權限與操作邊界不同，不為去重合併。 |
| SEO、公開作者資料、robots／sitemap 語意檢查 | 保留 | 驗證內容關聯及公開行為，不等於檔案相同。 |
| BAO 識別、storage key 與備份格式 | 保留 | 避免破壞資料；舊格式相容回歸通過。 |
| 舊核心／混合快取 fallback | 保留 | 有明列的相容邊界，API／App wrapper 回歸通過；不是任意第三方擴充完整相容保證。 |
| P0／P1 evidence JSON 與歷史報告 | 保留 | 各自指定版本的證據；目前狀態入口已區分歷史。 |

## 後續待辦（不阻擋本次工程結案）

| ID | 項目 | 重新啟動條件 |
| --- | --- | --- |
| F1 | 其他 CSS 的整體分層或檔案合併（後續優化） | 有可重現覆蓋問題、量測到的載入成本或明確維護需求再另開範圍。 |
| F2 | 容器／條件式流程的 Node 安裝或其餘驗證器再去重（後續優化） | 相同維護變更多次同步，並能保留既有權限、執行時機及案例責任。 |
| F3 | 舊文件歸檔與相容分支移除（後續優化） | 先有取代文件、引用稽核與資料遷移證據；不只依檔案年齡刪除。 |
| O1 | 玩家錢包與 Provider 真實帳單逐筆對帳（獨立營運待辦） | 取得正式帳單／錢包記錄；不列為本次工程已完成。 |

## 37 條 Workflow 的逐檔判定

| Workflow | 判定 | 依據 |
| --- | --- | --- |
| author-regex-inline.yml | 已完成指定修改 | 已完成：共用 Chromium 安裝 |
| author-regex-live.yml | 已完成指定修改 | 已完成：共用部署資產比對；已完成：共用 Chromium 安裝 |
| aws-relay-model-registry-audit.yml | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| aws-ssm-oidc-audit.yml | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| bao-mascot-live.yml | 已完成指定修改 | 已完成：共用部署資產比對 |
| browser-e2e.yml | 已完成指定修改 | 已完成：清單缺檔／空組不得成功 |
| character-studio-live.yml | 已完成指定修改 | 已完成：共用部署資產比對 |
| chat-experience-live.yml | 已完成指定修改 | 已完成：共用部署資產比對 |
| chat-reading-scroll.yml | 已完成指定修改 | 已完成：共用部署資產比對 |
| chat-ui-simplify.yml | 已完成指定修改 | 已完成：共用 Chromium 安裝 |
| core-tests.yml | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| credits-pilot-integration.yml | 已完成指定修改 | 已完成：共用部署資產比對 |
| desire-district-card.yml | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| editorial-visual.yml | 已完成指定修改 | 已完成：共用 Chromium 安裝 |
| first-run-live.yml | 已完成指定修改 | 已完成：共用部署資產比對 |
| full-browser-e2e.yml | 保留 | 完整 Chromium／Firefox／WebKit 矩陣及排程，不套用單一 Chromium 安裝。 |
| gameplay-ui-engine.yml | 已完成指定修改 | 已完成：共用 Chromium 安裝 |
| maintenance-core.yml | 已完成指定修改 | 已完成：集中驗證 helper 與 runner 回歸 |
| mobile-story-entry.yml | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| native-archive-catalog.yml | 保留 | 預裝 Playwright 容器保有專用案例；重裝主機瀏覽器會增加成本。 |
| natural-dialogue-regression.yml | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| npc-presence.yml | 保留 | PR 執行 Node 契約，push 才安裝瀏覽器並驗證線上內容，時機不同。 |
| pages-live-smoke.yml | 保留 | SEO、作者資料關聯、robots／sitemap 與圖像尺寸等語意驗收，責任不等同檔案 bytes 比對。 |
| persona-picker-sync.yml | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| privacy-policy-check.yml | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| production-model-binding-deploy.yml | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| production-model-registry-apply.yml | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| production-model-registry-audit.yml | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| pwa-index-activation.yml | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| pwa-install.yml | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| scene-story-preferences.yml | 保留 | PR 執行 Node 契約，push 才安裝瀏覽器並驗證線上內容，時機不同。 |
| work-title-npc.yml | 保留 | 預裝 Playwright 容器保有專用案例；重裝主機瀏覽器會增加成本。 |
| worker-production-deploy.yml | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| world-mod-packs.yml | 已完成指定修改 | 已完成：共用部署資產比對 |
| world-module-state-echo.yml | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| worldbook-library.yml | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| worldbook-recall-mode.yml | 已完成指定修改 | 已完成：共用 Chromium 安裝 |

## 盤點界線

60 份 CSS 的正式引用均已列入 JSON；37 條 workflow 以用途分類。基準共有 119 份 Markdown，僅記錄目錄與歷史／現行責任，不宣稱本輪逐行讀完全部文件。保留不代表永久不能改；若新增可重現故障，另按影響分級處理。
