# 技術債整理狀態

本次 P0／P1／P2 原定工程整理已完成結案核對。結案當時的產品基準為 #742，歷史證據保持原樣。後續產品階段的現況見 [P3 產品盤點](product-p3-readiness-2026-10-20.md)，不把 P0–P2 工程結案視為全部產品路線完成。

| 階段 | 目前狀態 | 依據與界線 |
| --- | --- | --- |
| P0 | 原定工程範圍已結案 | [結案核對](p0-closeout-2026-10-18.md)：路由／計費／請求生命週期及本地資料／備份；53 支基準測試通過，證據限定原驗證版本。 |
| P1 | 原定工程範圍已結案 | [結案核對](p1-core-closeout-2026-10-18.md)、[逐檔責任表](post-turn-ownership.md)：六輪核心加原剩餘入口 12／12 已判定；保留已列明的相容與運行限制。 |
| P2 | 原定工程範圍已結案 | [結案報告](p2-closeout-2026-10-18.md)、[剩餘處置](p2-disposition-2026-10-18.md)：九批修改已合併，主線／部署／回歸成功；保留項與後續優化已明列。 |

## P3 與目前工作

P3 是產品路線的作品／作者生態與 Hosted 營運盤點，**尚未結案**；這次技術債工程清單本身只有 P0–P2，沒有另一份已完成的「技術債 P3」。

#749–#759 的請求來源、NPC 時間線與事件召回是 P2 之後的產品改善，不是重新開啟 P2。#759 已合併，Pages 與正式站資產核對通過；[召回驗收](recall-acceptance.md) 仍明列抽象比喻缺口。

目前 P3 先核對既有櫥窗、作者頁／支持連結、投稿與帳號點數，區分程式驗證與正式營運證據。本輪已新增投稿狀態離線唯讀核對工具，仍待正式匯出驗證。接續補上 [作者路徑與載入恢復](author-publication-journey-2026-10-20.md) 的程式與瀏覽器回歸。具體項目、退出條件與下一批見 [P3 盤點](product-p3-readiness-2026-10-20.md)。F1–F3 與 O1 的原處置不變。

## P2 已合併批次

| PR | 工程結果 | 驗證 |
| --- | --- | --- |
| [#734](https://github.com/ghost80076-cmyk/bao-lab/pull/734) | 三條 focused Chromium 流程共用安裝 | PR focused workflow、Core tests 與 Fast Browser E2E 成功。 |
| [#735](https://github.com/ghost80076-cmyk/bao-lab/pull/735) | 世界書、玩法及線上正則共用安裝 | PR 世界書／玩法、Core tests 與 Fast Browser E2E 成功；push-only 線上正則不計為 PR 覆蓋。 |
| [#736](https://github.com/ghost80076-cmyk/bao-lab/pull/736) | 保留首頁預載品牌 CSS 版本及位置，避免同檔重複插入尾端 | Node 重現回歸、手機／桌面 editorial 與 Fast Browser E2E 成功；截圖已檢視。 |
| [#737](https://github.com/ghost80076-cmyk/bao-lab/pull/737) | 八組工具選單後置基礎覆蓋併回原規則 | 11 條 PR workflow 成功，含六寬度 × 五主題、Core tests 與 Fast Browser E2E；截圖已檢視。 |
| [#738](https://github.com/ghost80076-cmyk/bao-lab/pull/738) | 目前維護狀態與歷史驗證版本分開，README 提供入口 | 本地 Markdown 連結可解析、evidence JSON 未改；PR CI 成功。 |
| [#739](https://github.com/ghost80076-cmyk/bao-lab/pull/739) | 閱讀、燈火、世界 MOD 共用部署資產內容驗證；修正 MOD 測試舊分類定位 | 13 項 mock 回歸、最終 PR CI 與 MOD 三瀏覽器通過；先前直連下載逾時，收尾已補確認遠端部署成功。 |
| [#740](https://github.com/ghost80076-cmyk/bao-lab/pull/740) | 新手教學、工作室、作者正則接入共用驗證；工作室與正則 index 改完整內容比對 | first-run 契約、verifier 13 項本地回歸與最終 PR CI 通過；合併後專用線上流程成功。 |
| [#741](https://github.com/ghost80076-cmyk/bao-lab/pull/741) | 聊天與包包接入共用比對，指定流程共八個；保留獨立語意 smoke | 本地聊天／動畫／WebP 契約、15 項 verifier 回歸與最終 PR CI 通過；合併後八條線上流程成功。 |
| [#742](https://github.com/ghost80076-cmyk/bao-lab/pull/742) | E2E 空清單／缺檔不得默默成功 | 10 項回歸、四組實際 Chromium 與最終 PR／主線 CI 成功。 |

## 結案核對與後續工作

產品基準 #742 的本地 Git tree 與主線相同；28 項 P2 回歸加 3 支相容腳本通過。主線七條 workflow（含 Pages 部署與正式站 smoke）均成功；八條共用部署流程在同產品資產的 #741 合併後實際執行成功。先前空清單查詢已由 Actions 原始 API／job 證據補正，見 [結案證據](p2-closeout-evidence-2026-10-18.json)。

60 份 CSS 都有正式引用，37 條 workflow 已分類；必要相容路徑保留。F1–F3 的 CSS 全面分層、異質流程去重、歷史文件／相容移除，轉為有重新啟動條件的 [後續清單](p2-disposition-2026-10-18.md)，不再無限延長本次整理。

玩家錢包與 Provider 真實帳單逐筆對帳仍是獨立營運待辦 O1。工程結案不等同全部技術債歸零或帳務稽核完成。

## 如何讀取歷史證據

結案報告和 evidence JSON 記錄的是指定 commit 當時的測試版本與限制。原始內容保留供追溯；目前進度看本頁與各階段「目前判定」，不要把舊版本的「下一批」重新當成未完成任務，也不要把歷史綠燈推論為最新全站或正式帳務驗證。
