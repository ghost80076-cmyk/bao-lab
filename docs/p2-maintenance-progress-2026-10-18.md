# P2 維護進度（2026-10-18）

P0 與 P1 的原定工程範圍已結案，依據見 [P1 結案紀錄](p1-core-closeout-2026-10-18.md)。P2 仍在進行，不能把 workflow 安裝去重視為整個 P2 完成。

## Chromium 安裝去重

共用步驟位於 `.github/actions/setup-chromium/action.yml`：Node 22、npm lockfile 快取、npm ci、Playwright Chromium 與 OS 依賴安裝。呼叫端仍負責 checkout、測試、權限、timeout、部署等待與產物。

| 批次 | 流程 | 進度與驗證 |
| --- | --- | --- |
| #734 | author-regex-inline、chat-ui-simplify、editorial-visual | 已合併；PR 三條 focused workflow 與 Core tests、Fast Browser E2E 均成功。合併 commit 的 workflow-run 查詢未回傳紀錄，不能宣稱合併後驗證完成。 |
| 第二批 | author-regex-live、worldbook-recall-mode、gameplay-ui-engine 的 browser job | 改用共用步驟；測試命令、事件條件、部署比對與產物保留。gameplay browser job 新增 npm cache，Node 版本仍為 22。實際 CI 以此批 PR 及合併後結果為準。 |

所有具有 path filter 的呼叫端事件均加入共用 action、package.json 與 package-lock.json 路徑。原本沒有 paths 的事件仍保持全量觸發。author-regex-live 原為 push／手動流程，仍不在 PR 對未發布內容執行線上檢查。

### 明確保留的不同形態

| 流程類型 | 判定 |
| --- | --- |
| scene-story-preferences、npc-presence | PR 僅執行 Node 回歸，push 才安裝瀏覽器與驗證線上頁面；先保留，不為去重增加 PR 安裝成本。 |
| full-browser-e2e | Chromium／Firefox／WebKit 安裝取決於矩陣；包含依賴完整跨瀏覽器測試的 live job。保留矩陣及排程，不直接套用單一 Chromium action。 |
| Playwright container 流程 | 容器已提供瀏覽器與 OS 依賴，不能加入主機版重複安裝；另行評估 Node／npm 層去重。 |

這批只收斂重複的安裝步驟，不移除測試、合併不同責任的 job 或改變部署驗收。後續只有重複造成具體維護問題時再擴充共用介面，避免為去重增加大量條件參數。

## P2 尚待處理

- UI／CSS：先建立載入順序與樣式責任盤點，再以可視回歸證據處理重複／覆蓋；本批沒有改畫面。
- Workflow：上述不同形態與其他安裝模式尚未全面結案。
- 舊文件／歷史相容：先盤點仍被使用的入口與文件，再判定更新、歸檔或保留；本批沒有刪相容程式。

正式玩家錢包與 Provider 真實帳單逐筆對帳仍是獨立營運待確認項。

## UI／CSS 第一批

已建立 [載入與責任盤點](ui-style-ownership-2026-10-18.md)，並修正首頁預載品牌 CSS 被 runtime loader 因 query 不同而再次插入尾端的問題。保留首頁版本與 cascade 位置、舊頁面 fallback；以重現前後 Node 測試及 editorial 手機／桌面瀏覽器回歸驗證。這只完成一個可重現載入問題，尚未完成全站 CSS 整理。
