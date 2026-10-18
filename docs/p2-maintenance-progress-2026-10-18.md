# P2 維護進度（2026-10-18）

P0 與 P1 的原定工程範圍已結案，依據見 [P1 結案紀錄](p1-core-closeout-2026-10-18.md)。P2 仍在進行，不能把 workflow 安裝去重視為整個 P2 完成。

## Chromium 安裝去重

共用步驟位於 `.github/actions/setup-chromium/action.yml`：Node 22、npm lockfile 快取、npm ci、Playwright Chromium 與 OS 依賴安裝。呼叫端仍負責 checkout、測試、權限、timeout、部署等待與產物。

| 批次 | 流程 | 進度與驗證 |
| --- | --- | --- |
| [#734](https://github.com/ghost80076-cmyk/bao-lab/pull/734) | author-regex-inline、chat-ui-simplify、editorial-visual | 已合併；PR 三條 focused workflow 與 Core tests、Fast Browser E2E 均成功。合併 commit 的 workflow-run 查詢未回傳紀錄，不能宣稱合併後驗證完成。 |
| [#735](https://github.com/ghost80076-cmyk/bao-lab/pull/735) | author-regex-live、worldbook-recall-mode、gameplay-ui-engine 的 browser job | 改用共用步驟；測試命令、事件條件、部署比對與產物保留。gameplay browser job 新增 npm cache，Node 版本仍為 22。已合併；PR 世界書、玩法、Core tests 及 Fast Browser E2E 均成功。合併後 workflow-run 查詢未取得紀錄，不計為線上驗證通過。 |

所有具有 path filter 的呼叫端事件均加入共用 action、package.json 與 package-lock.json 路徑。原本沒有 paths 的事件仍保持全量觸發。author-regex-live 原為 push／手動流程，仍不在 PR 對未發布內容執行線上檢查。

### 明確保留的不同形態

| 流程類型 | 判定 |
| --- | --- |
| scene-story-preferences、npc-presence | PR 僅執行 Node 回歸，push 才安裝瀏覽器與驗證線上頁面；先保留，不為去重增加 PR 安裝成本。 |
| full-browser-e2e | Chromium／Firefox／WebKit 安裝取決於矩陣；包含依賴完整跨瀏覽器測試的 live job。保留矩陣及排程，不直接套用單一 Chromium action。 |
| Playwright container 流程 | 容器已提供瀏覽器與 OS 依賴，不能加入主機版重複安裝；另行評估 Node／npm 層去重。 |

這批只收斂重複的安裝步驟，不移除測試、合併不同責任的 job 或改變部署驗收。後續只有重複造成具體維護問題時再擴充共用介面，避免為去重增加大量條件參數。

## P2 尚待處理

- UI／CSS：載入責任盤點、品牌重複載入與工具選單基礎規則已完成指定批次；其他區域仍須依具體問題與可視回歸證據判定。
- Workflow：上述不同形態與其他安裝模式尚未全面結案。
- 舊文件／歷史相容：目前狀態入口與歷史驗證版本已分開；其他舊文件與仍在使用的相容程式尚未全面結案。

正式玩家錢包與 Provider 真實帳單逐筆對帳仍是獨立營運待確認項。

## UI／CSS 第一批：[#736](https://github.com/ghost80076-cmyk/bao-lab/pull/736)

已建立 [載入與責任盤點](ui-style-ownership-2026-10-18.md)，並修正首頁預載品牌 CSS 被 runtime loader 因 query 不同而再次插入尾端的問題。保留首頁版本與 cascade 位置、舊頁面 fallback；以重現前後 Node 測試及 editorial 手機／桌面瀏覽器回歸驗證。已合併；PR 的 Core、editorial 與 Fast Browser E2E 成功，CI 截圖已檢視。這只完成一個可重現載入問題，尚未完成全站 CSS 整理。

## UI／CSS 第二批：故事功能選單 [#737](https://github.com/ghost80076-cmyk/bao-lab/pull/737)

收斂 `chat-tool-navigation.css` 同檔內八組後置基礎覆蓋：將實際生效的抽屜／標題／內文／分類／操作按鈕／桌面分類配色與尺寸併回原規則。保留 theme 高 specificity、hover、focus 與手機覆蓋；移除原先無效的 1080px 舊圓角宣告，避免基礎圓角併回後讓平板退回舊值。未刪 `chat-experience.css` 的跨檔相容規則。

新增 390、820、821、1080、1081、1440px × 五種主題的真實抽屜驗證，涵蓋圓角、標題尺寸、非夜港主題背景、視窗範圍、捲動與 Escape 關閉，並輸出手機／平板／桌面截圖。已合併；PR 的 11 條 workflow 均成功，包含六寬度 × 五主題驗證與 Fast Browser E2E。手機／平板／桌面的夜港、月白截圖已檢視。這是單一表面的同檔去重，不宣稱閱讀區與其他 CSS 已整理完成。

## 文件整理第一批

新增 [維護狀態入口](maintenance-status.md)，並修正 P1 結案紀錄與責任表開頭的過期進度。歷史測試版本、限制與機器可讀 evidence JSON 原樣保留，沒有把歷史 PR CI 寫成目前部署證明。

## Workflow 第二類整理：部署資產驗證

閱讀、燈火與世界 MOD 的重複下載／重試／cmp 邏輯已移入 [共用部署驗證腳本](live-asset-verification.md)。保留三流程的檔案清單、job 設定與線上執行條件，統一 no-cache header、暫存清理及逐檔失敗訊息；所有檔案須同輪一致。13 項 mock 回歸通過並接入 Maintenance core；這不代表真實部署已驗證，也不宣稱其他 marker 型 workflow 已全數收斂。
