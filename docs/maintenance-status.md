# 技術債整理狀態

本頁追蹤原定 P0／P1／P2 工程整理，更新至 #740 合併後，並記錄本批聊天／包包驗證整理。只把有實際證據的範圍列為完成。

| 階段 | 目前狀態 | 依據與界線 |
| --- | --- | --- |
| P0 | 原定工程範圍已結案 | [結案核對](p0-closeout-2026-10-18.md)：路由／計費／請求生命週期及本地資料／備份；53 支基準測試通過，證據限定原驗證版本。 |
| P1 | 原定工程範圍已結案 | [結案核對](p1-core-closeout-2026-10-18.md)、[逐檔責任表](post-turn-ownership.md)：六輪核心加原剩餘入口 12／12 已判定；保留已列明的相容與運行限制。 |
| P2 | 進行中 | [批次進度](p2-maintenance-progress-2026-10-18.md)、[樣式責任](ui-style-ownership-2026-10-18.md)：六條 Chromium 安裝去重、品牌樣式載入修正、故事工具選單基礎規則收斂已合併；本批整理文件入口。 |

## P2 已合併批次

| PR | 工程結果 | 驗證 |
| --- | --- | --- |
| [#734](https://github.com/ghost80076-cmyk/bao-lab/pull/734) | 三條 focused Chromium 流程共用安裝 | PR focused workflow、Core tests 與 Fast Browser E2E 成功。 |
| [#735](https://github.com/ghost80076-cmyk/bao-lab/pull/735) | 世界書、玩法及線上正則共用安裝 | PR 世界書／玩法、Core tests 與 Fast Browser E2E 成功；push-only 線上正則不計為 PR 覆蓋。 |
| [#736](https://github.com/ghost80076-cmyk/bao-lab/pull/736) | 保留首頁預載品牌 CSS 版本及位置，避免同檔重複插入尾端 | Node 重現回歸、手機／桌面 editorial 與 Fast Browser E2E 成功；截圖已檢視。 |
| [#737](https://github.com/ghost80076-cmyk/bao-lab/pull/737) | 八組工具選單後置基礎覆蓋併回原規則 | 11 條 PR workflow 成功，含六寬度 × 五主題、Core tests 與 Fast Browser E2E；截圖已檢視。 |
| [#738](https://github.com/ghost80076-cmyk/bao-lab/pull/738) | 目前維護狀態與歷史驗證版本分開，README 提供入口 | 本地 Markdown 連結可解析、evidence JSON 未改；PR CI 成功。 |
| [#739](https://github.com/ghost80076-cmyk/bao-lab/pull/739) | 閱讀、燈火、世界 MOD 共用部署資產內容驗證；修正 MOD 測試舊分類定位 | 13 項 mock 回歸、最終 PR CI 與 MOD 三瀏覽器通過；正式站直接下載逾時，未算部署成功。 |
| [#740](https://github.com/ghost80076-cmyk/bao-lab/pull/740) | 新手教學、工作室、作者正則接入共用驗證；工作室與正則 index 改完整內容比對 | first-run 契約與 verifier 13 項本地回歸、最終 PR CI 通過；push-only 線上驗證仍分列。 |

## 本批部署驗證整理

本批將聊天版面與包包介紹頁接入 [共用資產驗證腳本](live-asset-verification.md)，指定共用流程累計八個。保留語法、狀態解析、動畫／WebP 檢查，新增二進位內容回歸，本地 15 項通過；最終 PR CI／合併以此批紀錄為準。SEO／作者資料等獨立語意驗收保留，不能以 mock 或 PR 綠燈替代正式站證據。

## 尚未結案

- 其他 UI／CSS 區域：依實際覆蓋問題分批處理，不以刪光 important、inline style 或品牌檔為目標。
- Workflow 不同形態：條件式安裝、跨瀏覽器矩陣與預裝容器目前有明確保留理由，見批次進度，不直接套用 Chromium 主機安裝。
- 其他歷史文件與仍在使用的相容程式：逐項確認引用與使用情境再處理，不按檔案年齡刪除。
- P2 合併後的線上驗證：已查的合併 commit workflow-run 未回傳紀錄，因此只報 PR CI 與合併成功，不宣稱部署後驗證成功。

玩家錢包與 Google／OpenRouter 真實帳單逐筆對帳仍是獨立的營運待確認項，不算進工程結案。

## 如何讀取歷史證據

結案報告和 evidence JSON 記錄的是指定 commit 當時的測試版本與限制。原始內容保留供追溯；目前進度看本頁與各階段「目前判定」，不要把舊版本的「下一批」重新當成未完成任務，也不要把歷史綠燈推論為最新全站或正式帳務驗證。
