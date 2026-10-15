# YoruBay Experience 3.0｜第二十輪：人物庫搜尋與操作分層

日期：2026-10-15。

## 問題
「我的人物庫」本來已有兩種人物（玩家 Persona 與 AI 人物／NPC）、編輯、複製、刪除，但沒有搜尋；人物卡每張展示三顆操作按鈕，列表一長就變成工具牆。此外此功能從 `story-persona-manager.js` 注入一整段固定深色 CSS，晨霧／暮玫下顯示割裂。

## 本輪實作
- 保留既有「我的玩家角色／我的 AI 人物」雙分頁，為人物庫新增本機文字搜尋。名稱、身分與人物設定等既有欄位可查找；即時顯示匹配數與找不到時的空結果，不發出網路請求、不修改原始清單。
- 人物卡直接保留「編輯」；把「複製／刪除」放到原生 details「更多」中。沿用原本的 `data-library-*` 及 callback，刪除仍有原本的 confirm 防誤觸。
- 搜尋記錄只存在這次開啟的人物庫視窗，不寫入 localStorage；切換分頁後可返回各分頁先前輸入的搜尋字串。
- 人物庫與故事中人物設定視窗的晨霧／暮玫色彩使用既有 `--yoru-*` 語義變數；只覆寫平台 UI，不處理作者 HTML 或生成文字。夜港原色維持。
- 新增 `css/actor-library-experience.css`，從既有 `story-persona-manager.js` 自行引入，不更動共用 UI 載入順序，避免與其他正在進行的作品匯入 PR 相衝突。

## 明確不變
Persona、AI 演員／NPC、角色副本／可攜角色、安全篩選、公開作品及自訂卡、既有玩家與角色庫 JSON、儲存欄位、提示詞建構、記憶、快取與模型呼叫不變。本次沒有重構人物關係演算法，也沒有對世界書召回動手。

## 驗證
`tests/e2e/portable-story-actors.spec.cjs` 已加入 390／1280px 搜尋、雙分頁切換、複製、收合、三主題 computed colors 與 GameState 未變檢查；使用現有 product-explore CI 群組，Firefox/WebKit 與其他核心回歸照常執行。

## 合併門檻
PR Draft；等待 Core、Fast Browser、人物／世界書及跨瀏覽器測試通過、確認 main 無衝突後合併。
