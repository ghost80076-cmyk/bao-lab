# P1 核心流程結案核對（2026-10-18）

## 判定與停止線

**六輪「正文、記憶、世界書、狀態與用量歸屬」的工程回歸基線通過；整個 P1 尚未結案。**

本次核對的產品版本為 [`ba4874e9712a36a84cc4c95db80bccfe60a4a226`](https://github.com/ghost80076-cmyk/bao-lab/commit/ba4874e9712a36a84cc4c95db80bccfe60a4a226)。P0 已另行結案；此處不重新開啟儲存或路由重構，也不把每項相容限制改列為新的 P0。

P1 原本還包含「核心呼叫鏈剩餘耦合」。這六輪改善了重要的非同步邊界，並未將所有直接覆寫 App.sendMessage 的介面、預覽與修訂入口遷入具名 hook。這部分保留為下一個有限盤點，不以本報告代替完成。

本次退出條件：限定回歸全部通過、來源與主線一致、六輪 PR 均合併、瀏覽器／部署證據可追溯、限制明列；最後須確認本 PR 修正後的 [Credits pilot frontend verification](https://github.com/ghost80076-cmyk/bao-lab/actions/workflows/credits-pilot-integration.yml) 在合併主線後成功。

## 證據摘要

- 219 個相關檔案以 Git blob SHA 核對主線，全部一致；清單包含全部 js 檔、33 支限定測試及所需工作流程／資料 fixture。
- 本地重新執行 **33 支測試腳本，33 通過、0 失敗**；這是腳本數，不是斷言數。Node `v24.19.0`，global fetch 預設禁用，測試各自提供 mock。沒有呼叫付費 Provider、修改正式 D1 或玩家錢包。
- 同一產品版本的 [Core tests](https://github.com/ghost80076-cmyk/bao-lab/actions/runs/39112848540) 使用 Node 22，成功。
- [Fast Browser E2E](https://github.com/ghost80076-cmyk/bao-lab/actions/runs/39112848519) 的 Chromium 各組及 Firefox／WebKit smoke 成功。這不是宣稱三種瀏覽器都執行所有 P1 競態案例；延遲競態的主要證據是 Node mock 回歸。
- 原版本共有 24 個主線檢查：23 成功、1 失敗。Pages build/deploy、pages-live、verify-live-pages、reading-scroll 成功；失敗項是下面說明的燈火資產檢查，不掩寫為全綠。
- 原始責任表及每輪細節見 [post-turn-ownership.md](post-turn-ownership.md)，機器可讀清單見 [p1-core-closeout-evidence-2026-10-18.json](p1-core-closeout-evidence-2026-10-18.json)。

## 六輪完成項目

| PR | 完成的邊界 | 主要驗收 |
| --- | --- | --- |
| [#723](https://github.com/ghost80076-cmyk/bao-lab/pull/723) | 背景摘要的 task／故事／來源歸屬 | 舊 finally 不解除新摘要鎖；晚到成功、失敗與 JSON 修復不覆寫新故事；舊格式錯誤不啟動新修復 |
| [#724](https://github.com/ghost80076-cmyk/bao-lab/pull/724) | 正文提交與串流泡泡 | 提示、provider、memory 等待後檢查來源；舊 delta／frame 不覆寫新泡泡 |
| [#725](https://github.com/ghost80076-cmyk/bao-lab/pull/725) | 完成回合到狀態模組的派送 | 使用完成憑證識別原 user/assistant；同頁同故事的 assistant ID 在 await update 前去重；獨立模型與同模型附錄路徑分別有回歸 |
| [#726](https://github.com/ghost80076-cmyk/bao-lab/pull/726) | 記憶召回的提示組裝歸屬 | 故事、訊息來源、角色與 config 改變時不增補舊提示；世界書既有 owner／設定替換檢查有延遲測試 |
| [#727](https://github.com/ghost80076-cmyk/bao-lab/pull/727) | 場外評論與生成前／後解讀 | 24 個過期情境不寫新故事、不啟動後續請求；顧問任務按物件歸屬清理；正常輸出保留 |
| [#728](https://github.com/ghost80076-cmyk/bao-lab/pull/728) | 晚到用量集合與畫面 | 16 個一般入口案例及四種 Hosted 管線順序；舊 Token／回報費用留在捕捉的集合，新計數器、UI 與 Context 壓力不變 |

## 核對時發現並修正的 CI 問題

[#728](https://github.com/ghost80076-cmyk/bao-lab/pull/728) 更新了燈火載入 URL，但 push-only 工作流程仍要求精確字串 `creditsScript.src = 'js/credits-pilot.js'`，因此合併後的 [線上資產工作](https://github.com/ghost80076-cmyk/bao-lab/actions/runs/39112848474) 失敗。當時的 PR CI 與部署檢查通過，不能代替這個後續工作。

本 PR 改為以 commit query 抓取 adapter／loader，再與 checkout 的兩個檔案逐位元組比較，不依賴過時字串。也新增 pull_request 觸發，本機語法／隔離測試會在 PR 執行；線上比對只在 push／手動工作執行，避免要求未合併版本已上線。

本地檢查包含 bash 語法，以及 mock curl 的三個情況：兩檔相同成功、adapter 過期失敗、loader 過期失敗。合併後仍須看上述工作流程的實際綠燈，不以 mock 代替部署證據。

## 保留限制

| 項目 | 明確界線 |
| --- | --- |
| 狀態派送去重 | 頁面生命週期內此 hook 的保護；不是跨重載 exactly-once，也不涵蓋其他直接 update 入口 |
| 晚到正文 | 已送出的過期正文會被捨棄；沒有背景故事回應回收，也不取消已產生的 Provider 用量 |
| 晚到用量 | 原集合以在途記憶體參考保留；不自動回寫非作用中／重新載入的故事存檔，關頁後沒有持久化回收承諾 |
| 世界書 | 已驗證故事切換與設定物件替換，不是所有原地修改欄位的時序矩陣 |
| 評論／解讀並行 | 已驗證指定等待點的 owner／來源隔離，不是所有同故事並行顧問與重複呼叫的完整證明 |
| 相容載入 | 保留舊核心／legacy wrapper fallback；不能把正式模組路徑的證據推論到所有任意載入順序 |
| 正式帳單 | 沿用 P0 的營運待確認項；未做玩家錢包與 Google／OpenRouter 帳單逐筆對帳 |

## P1 剩餘呼叫鏈盤點

基準版本的靜態盤點有 20 個檔案涉及 App.sendMessage 包裝：8 個含具名註冊，16 個含直接賦值，其中 4 個是同一具名模組的舊快取 fallback。**直接賦值不等於已證實有錯，也不以刪光所有 wrapper 為完成標準。**

| 剩餘類別 | 檔案 | 下一步 |
| --- | --- | --- |
| 故事狀態／等待入口 | character-status-ui.js、story-revision-state.js | 優先核對「等待後讀取當前狀態」及還原／修訂切換；先補可重現測試再決定修正 |
| 閱讀與畫面更新 | chat-experience-repairs.js、chat-reading-scroll.js、scene-chat-integration.js、scene-render-integrity.js、story-reader.js | 盤點結果／參數傳遞、原 DOM 與當前 DOM；已有閱讀回歸不等於全部 owner 情境已驗證 |
| 三個作品介面 | host-club-simulator-ui.js、night-sky-magic-academy-ui.js、k-idol-survival-simulator-ui.js | 核對晚到的選項重繪與作品切換；保留既有玩法 |
| 離線／本機預覽 | no-api-world-preview.js、player-settings.js | 保留零額外模型請求；單獨判定相容入口是否需要遷移 |

下一批先處理第一列，其他列逐項歸為「已驗證保留／可重現修復／相容保留」。UI／CSS 視覺重排、Workflow 一般去重與舊文件仍屬原 P2，本輪沒有藉結案擴張功能範圍。


### 後續進度

第一列的 character-status-ui.js 與 story-revision-state.js 已新增具名 send hook、過期呼叫／快照保護與回歸，詳見 [責任表的後續批次](post-turn-ownership.md)。這是原 12 個一般直接入口中的 2 個；餘下 10 個仍待判定，六輪基準證據維持原版本記錄。

第二批完成五個閱讀／畫面入口判定：chat-experience-repairs、chat-reading-scroll 增加歸屬保護與具名 hook；story-reader 補齊參數轉交；scene-chat-integration、scene-render-integrity 經當前狀態／DOM 對齊邏輯檢視保留。累計 7／12 已判定，剩餘三個作品介面與兩個離線／本機預覽入口（5 個），詳見責任表。這不是全畫面競態的完整證明。

### 最終清單結案

第三批補齊三個作品選項 hook 的故事／設定／角色歸屬與 timer 檢查，並修正兩個離線／本機預覽入口的參數轉交。remaining-send-hooks-core.cjs 覆蓋 60 個延遲選項案例、實際 request-lifecycle、provider 錯誤、正常傳遞及兩種預覽載入順序的零底層送出行為。

原 12 個入口現為 **12／12 已判定（10 修正、2 程式碼檢視保留）**；逐檔判定及驗證界線見 [責任表](post-turn-ownership.md)。六輪核心加原清單的 P1 工程範圍到此結案，不因後續看到其他 wrapper 就自動擴大。P2 視覺／CSS、一般 workflow 去重、舊文件另列；真實 provider／wallet 對帳仍待驗證。本文件前段與 JSON 證據仍保留六輪基準時點，不冒充最新全站驗證。
