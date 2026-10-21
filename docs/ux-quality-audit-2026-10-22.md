# 夜灣 UI／UX 品質審查｜2026-10-22 第一輪（程式碼證據）

## 範圍與證據等級

本次讀取主頁入口 `index.html`、`css/base.css`、`css/bao-brand-v2.css`、`css/player-shell-v2.css`、`css/mobile-reading-layout.css`、`js/app.js`、`js/player-shell-v2.js`、既有 UX／CSS 責任文件與 Playwright 測試案例。**這是程式碼與既有測試覆蓋審查，並非正式站逐頁實際操作、Lighthouse 測量、真實裝置驗收或完整視覺設計評分。** 不能據此宣稱已達 Awwwards／Webby／FWA 得獎作品標準。

## 現有設計資產：保留

- 以故事閱讀為主體、工具為次要層的 Play／Studio 結構，見 `js/player-shell-v2.js` 和 `css/player-shell-v2.css`。
- 手機閱讀固定輸入區、安全區、工具抽屜，見 `css/mobile-reading-layout.css`。
- 主題語義色、暖光意象、海報優先的作品探索，見 `css/bao-brand-v2.css` 與既有設計文件。
- 新手、帳號額度、BYOK、自訂服務和本機模式的差異化設定入口；不可為視覺簡化破壞既有流程。
- 回歸工具包括 390px／1280px 的 Playwright 版面、角色預覽與閱讀操作測試；覆蓋「存在」不代表每版都通過。

## 問題分類與優先序

| 優先 | 類型 | 可觀察依據 | 影響與處置 | 現況 |
| --- | --- | --- | --- | --- |
| P1 | UX／鍵盤可及性 | 首頁原始 DOM 的重複頂部導覽之前無跳至主要內容連結；`main` 原本無錨點。 | 鍵盤使用者需逐次穿越導覽；補視覺聚焦時才顯示的跳轉入口及可聚焦的 `main`。參照 WCAG 2.2 SC 2.4.1。 | 本 PR 已新增，等待瀏覽器與 CI 驗證 |
| P1 | 功能／鍵盤可及性 | `css/base.css` 原使用 `.choice-card input{display:none}`；建立故事的模式卡以原生 radio 包在 label 內。 | `display:none` 讓原生選項無法取得鍵盤焦點；改用保留可存取性的視覺隱藏、以 `:focus-within` 呈現焦點，保留選取事件。 | 本 PR 已新增，等待瀏覽器與 CI 驗證 |
| P2 | 技術／視覺一致性風險 | `docs/ui-style-ownership-2026-10-18.md` 記錄多套 CSS 載入責任、後載覆蓋及部分 `!important`；並已修一個重複載入案例。 | 不等於當下有樣式錯誤；應逐區取 computed style 並檢查 390／820／1080／1280px 與五主題，才刪重複規則。 | 待實測 |
| P2 | 技術／載入效能風險 | 首頁宣告多份 CSS／JS，另有動態功能鏈；`base.css` 同時包含歷史元件與整合層。 | 審查 waterfall、FCP/LCP/INP、JS 長任務，避免改成新框架或加入大型動畫；沒有測量前不下效能差結論。 | 待實測 |
| P2 | UX／閱讀可及性待查 | 主題與手機閱讀 CSS 含多個明暗變體，已有 focus-visible 及閱讀字級設計。 | 在五主題測閱讀／次級文字對比、縮放 200%、鍵盤焦點被固定浮層遮住、長文／鍵盤打開後是否可操作。 | 尚未驗證，不列為已確認缺陷 |
| P2 | UX／新手任務待查 | 設定流程涵蓋模型服務、金鑰、長期記憶與展示模式，另已有既往 UX 改善。 | 用無技術背景新玩家測從選作品到第一句成功回覆的任務耗時與失敗原因；不可把複雜功能一律刪掉。 | 待訪談與任務實測 |
| P3 | 視覺精修 | 暖光、海報與深色閱讀已形成品牌方向。 | 再評估字體層級、留白、選中狀態與輔助資訊密度；先修功能與可及性，禁止全站無差別換色。 | 候選，不視為缺陷 |

## 本輪最小實作

- 新增首個可鍵盤聚焦的「跳至主要內容」連結，只在聚焦時浮出，避免日常畫面干擾；採既有暖色 token，不修改站內視圖切換或玩家行為。
- 為 `main` 增加錨點和 `tabindex="-1"`，讓跳轉後焦點進入主要內容；保持 `App.showView` 和原導覽不變。
- 系統偏好減少動態時取消全域 smooth scrolling。
- 故事設定的 radio 不再以 `display:none` 從鍵盤導覽移除；新增可見焦點指示，保留卡片外觀及原生勾選操作。
- 新增 Chromium／Firefox／WebKit 可共用的 Playwright 回歸案例，含 390／1280px、切換至探索視圖後的跳轉、故事模式鍵盤切換、偏好減少動態與水平溢出檢查。

## 驗收門檻與限制

1. 執行 `npx playwright test tests/e2e/keyboard-main-entry.spec.cjs --project=chromium`，必要時再跑 Firefox/WebKit；以實際 CI 結果判定是否通過。
2. 桌面 1280px／手機 390px 截圖確認聚焦前隱藏、聚焦後可見、主內容不被固定元素覆蓋；測 320／820／1080px 並檢查焦點順序。
3. 進行視覺與 UX 深度審查前，必須能存取正式站或瀏覽器工件；只有 GitHub 程式碼不等於正式站驗收。
4. 本批不修改角色卡、存檔、API、收費、正則、世界狀態與玩家原本操作習慣；無證據不宣稱完成國際級品質認證。

參考：[WCAG 2.2 SC 2.4.1](https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html)。

## 第二輪：四套可選主題的語義文字對比與畫面證據（2026-10-22）

**已確認的色彩風險**：在變更前的語義 token 檢查中，「月白」的控制色與暖光色、「晨霧」的 muted／控制色、「暮霞」的控制強調色，以及「夕燈」的 muted／控制色，對指定語義背景有低於 4.5:1 的組合。這不是聲稱每個元件都已出現可見障礙，而是文字／小尺寸控制標記若使用該組 token，便有對比不足風險。

本批只在 `css/experience-preferences.css` 微調四套可選主題的文字／accent tokens，保留夜港、surface、圖片、字級、布局和故事行為。測試以頁面實際載入的 CSS 自訂變數計算對比，並對五套主題分別擷取 390px／1280px 的首頁與閱讀區 screenshot，檢查文件水平溢出。不將已生成截圖等同於人工完成視覺評審；需實際查閱工件。

驗收：`tests/e2e/semantic-theme-contrast.spec.cjs` 加入既有 `Fast Browser E2E` 的 story-experience 分組；所有組別 CI 綠燈才能合併。原有其他瀏覽器的閱讀／導覽 smoke 仍獨立維持。

**界線**：4.5:1 為一般大小文字的 WCAG AA 對比目標；這個 token matrix 不是全站逐像素對比證明，亦不取代作者自訂 HTML 及使用者可自訂氣泡色的評估。
