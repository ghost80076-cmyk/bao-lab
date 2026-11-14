# 手機故事閱讀效能稽核與修復

日期：2026-11-14（台北）

## 範圍與基準

基準是 PR #956 合併後的 main `408966bae38a0d51a584ccba9af797411e12d28d`。本次只處理 Story 閱讀殼層與 Phone 時鐘的無效 DOM 寫入，不重新稽核全站、不修改 Story Engine、不新增狀態系統或 UI。

已閱讀 AGENTS.md、Stage Capability contract、Player UI v2、UI style ownership、visual direction、PR regression contract，以及現有長篇、閱讀版面、Stage、Phone 與作者隔離測試。既有手機版面、composer、Stage routing、Phone 關閉清理、圖片 lazy loading、正則 worker timeout 與作者 iframe 隔離均沿用，不重做既有修正。

## 已重現的根因

1. `js/chat-experience.js` 的 MutationObserver 監看整個 chat-view 子樹。sync → ensureRail 每次把相同內容重新指定給 `.bao-status-empty.textContent`，包括提示已隱藏的情況。瀏覽器仍產生 childList mutation，再排下一個 requestAnimationFrame；靜置也持續循環。
2. 同一 DOM mutation 又喚醒 `work-package.js` 與 `player-shell-v2.js` 的既有監聽。長篇增加訊息掃描與樣式重算負擔。問題是無效寫入的擴散，不需要移除那些正常功能的監聽器。
3. Phone 時鐘每秒重寫顯示到分鐘的時間與日期，連固定故事時間也如此；原本沒有 document.hidden 早退。這是另一項可觀測的無效 DOM 工作，並非已證明的計時器洩漏。

第一次未修補基準跑兩次，長篇靜置主執行緒忙碌率為 44.33% / 45.04%；60 秒閱讀為 46.92% / 46.85%。每 10 秒約 601 次 chat-experience 回呼與 601 次 DOM 變動，另有兩個模組各約 301 次回呼。CPU 數字是降速環境中的 renderer main-thread duty，不是手機整機 CPU、耗電或溫度。

修補：狀態提示與 Phone 時鐘只在文字改變時寫入，Phone 時鐘在隱藏頁面略過更新。維持原有時鐘計時器與 media lifecycle，恢復可見後下一個 tick 更新時間。同步更新載入版本及既有 extension-chain 版本契約。

## 渲染與資源檢查

| 表面 | 檢查結果／處置 |
|---|---|
| Story DOM／監聽 | 修正上述回授迴圈。未引入虛擬列表或切斷必要 observer；全歷史 DOM 的進入／切換成本仍量測並列入剩餘風險。 |
| Stage | pure resolver 不寫 state；現有 adapter 沿用 reader/game-ui/phone 與斷點。由既有 Stage browser cases 驗證。 |
| Phone timer／事件 | open/render 保持單一 clock；close／離開／更換 owner 沿用 clearTimers、stopMedia、overlay remove、inert 與 focus 還原。通話、Spotify 及拖曳邏輯未重寫。 |
| 圖片 | chat-markup sanitizer 與 Phone renderer 已設 lazy loading／安全 URL；未新增圖片預載。外部圖片尺寸與解碼記憶體仍取決於作品。 |
| 動畫／背景 | 未變更現有 backdrop blur、作者外觀或動畫。包包 tick 已檢查 hidden／reduced-motion 並略過不可見 sprite。GPU fill、模糊與影片解碼成本不是 CDP heap 能證明的事項。 |
| 作者 HTML | inline/dock 使用既有 sandbox iframe、切故事／離開時 clear；正則使用受 timeout 保護的 worker。未放寬 sandbox、未執行作者 JS 於主頁。任意作者 iframe 的 CPU 不在本次合成故事量測範圍。 |
| 狀態與資料 | 未改 Local-first、schema、memory、world state、revision、branch、API／模型路由、wallet 或 backend。browser regression 比對靜置前後 state/messages/summary/config。 |

## 量測方法

`scripts/mobile-reading-performance.cjs` 只讀本機專案、使用合成故事、攔截非本機網路，不呼叫任何模型。GitHub Actions 同一 runner、同一 Chromium 依序測 #956 與 candidate，390×844、DPR 3、touch/mobile emulation、4× CPU slowdown。

場景：5 輪短篇、100 輪長篇（200 則訊息）、60 秒持續捲動、輸入與工具選單、10 次合成故事 owner 切換、切換後靜置、固定時間 Phone、5 秒隱藏／恢復模擬、Phone 關閉後靜置。切換測試是 renderer/owner 切換，不代表跨裝置同步。

記錄 CDP Task/Script/Layout/RecalcStyleDuration、JS heap、DOM nodes／listeners、DOM mutation、按來源分類 rAF／interval callback、scene render 呼叫次數、Long Tasks（>50ms）與 Event Timing（>=16ms）。GC checkpoints 使用同樣長篇內容前後比較。堆積記憶體不包含 GPU／全部媒體解碼／瀏覽器整體 RSS。

測試儀器本身有成本，數值適合這組配對比較；不可換算為所有手機的節省百分比。無 Event Timing entry 代表沒有觀測到達門檻的事件，不等於 INP 為零。第一次 CDP freeze request 未使 headless 頁面實際凍結，故不作背景暫停證據；正式比較改用明確標示的 document.hidden lifecycle 模擬。

## 修改前後數據與驗證

量測來源：[配對實跑](https://github.com/ghost80076-cmyk/bao-lab/actions/runs/43570802988)；量測 candidate `0cee18f3adde91bafb07517719ca2be2f2b06ca9`，產品修補與最終提交相同。完整原始數據保存在 [evidence/mobile-reading-2026-11-14.json](evidence/mobile-reading-2026-11-14.json)，不是預估。

| 場景 | 主執行緒忙碌率：前 → 後 | DOM 變動：前 → 後 | 其他數據 |
|---|---:|---:|---|
| 短篇靜置 10 秒 | 30.24% → 0.24% | 601 → 0 | Task 3028.54 → 24.35ms |
| 長篇靜置 10 秒 | 47.28% → 0.19% | 601 → 0 | Task 4732.51 → 19.24ms；樣式／腳本更新鏈停止 |
| 持續閱讀約 60 秒 | 45.30% → 2.01% | 3644 → 0 | Task 27519.90 → 1205.92ms；兩邊皆無 >50ms long task |
| 10 次切換後靜置 10 秒 | 45.45% → 0.20% | 602 → 0 | 三個模組合計約 1204 → 0 個 rAF callback |
| Phone 固定時間靜置 10 秒 | 28.90% → 0.14% | 627 → 0 | 仍保留原有 1 秒 timer；文字沒有變時不寫 DOM |
| 模擬隱藏／恢復 6 秒 | 28.04% → 0.12% | 377 → 0 | 只驗證 app visibility 行為，非 OS 休眠／電量 |
| Phone 關閉後靜置 5 秒 | 28.63% → 0.14% | 301 → 0 | Phone interval 已清除，只剩既有包包 timer |

**沒有改善或尚無法下結論的數據：**

- 長篇靜置樣本 heap 4.78 → 4.16 MiB，但 GC 後長篇 4.16 → 4.15 MiB、10 次切換後 5.85 → 5.84 MiB，差異很小；不能宣稱修好記憶體洩漏。切換前後可見 DOM 3796 → 3798（工具／草稿差異），兩邊 GC 後 listeners 都是 1569 → 1582；關閉 Phone 並 GC 後兩邊都是 823。這 10 次切換沒有顯示因本修補而增加的 retained DOM/listeners，但不是長期無洩漏證明。
- 輸入＋工具選單仍各有 3 個長任務。最大 long task 204 → 225ms；最大觀測事件 duration 304 → 304ms。這次沒有改善最慢的互動延遲，也未聲稱 INP 改善。
- 10 次切換 elapsed 5665 → 6419ms、Task 5382.00 → 5975.98ms；受完整歷史渲染／裝飾與排程影響，並未改善，單次 runner 比較不足以判定穩定退化。保留為剩餘瓶頸，不以漂亮的平均值掩蓋。
- 最終 passive-reader 動畫清單在兩邊均為空；未涵蓋作者 iframe 與真實多媒體解碼。

**驗證：** 本機 Core 211/211 workflow run steps、Maintenance 24/24、Regression Impact Gate 10/10 connected files 與 gate-selection 16/16 通過。Phone core 28/28 通過。[最終分支跨瀏覽器實跑](https://github.com/ghost80076-cmyk/bao-lab/actions/runs/43571317927)：Chromium 64 passed；Firefox 63 passed / 1 skipped；WebKit 63 passed / 1 skipped，無失敗或重試。兩個 skip 均為既有 story-integrity 中限定 Chromium 的 Android emulation case，不當作通過；該案例在 Chromium 實際執行。新增的 5 個效能／visibility 案例三瀏覽器全部執行通過。

涵蓋 mobile-long-reading-touch、Stage capability、Phone apps／interactions／story-sync／player settings、reading layout、story integrity 與 author-regex-inline，含作者 iframe script permission 與 parent storage 隔離。分支重跑只改測試 fixture；配對效能 job 已在前次 run 成功，刻意不重複。正式工作流程只保留 workflow_dispatch 與相關 PR 觸發，移除本次測試用的分支 push trigger。PR checks 的最終狀態另見 PR 的 Checks 頁。

首次跨瀏覽器執行發現新增 visibility 測試 fixture 漏了 phoneUI.version，既有 mergeDisplay 正確忽略無效 overlay；已修正測試為使用 BAOPhoneStoryCore.empty()，未修改產品狀態驗證或擴大修補。

## 剩餘風險與回退

- 真實 Android／iPhone 的 20–30 分鐘閱讀、手機溫度／耗電／降頻、Safari background suspension、OS keyboard 與記憶體壓力尚需實機驗證。本次證明無效 DOM 更新與忙碌負擔的變化，不能宣稱所有發熱來源已解除。
- 長篇首次渲染、重建與切換仍有全歷史 render/decorate 成本；不因一次迴圈修補就宣稱沒有長任務。
- 外部大圖、背景模糊、影片／音訊與作者隔離頁的動畫或腳本仍可能造成個別作品的持續負擔；需要帶該作品與實機另外量測，不能直接刪除作者功能或視覺風格。
- 本機瀏覽器啟動被環境限制，瀏覽器數據與測試以 GitHub Actions 的實跑證據為準。Core 與 regression gate 另於本機執行。
- 回退採 revert 本 PR 並遞增對應 loader／index cache versions。沒有資料遷移，不回寫／清除玩家故事。
- 本次只建立待審查 PR，不合併、不部署、不執行正式站 smoke。Pages、Worker、AWS 都沒有變更。
