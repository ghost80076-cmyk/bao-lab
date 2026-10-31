# Creator Studio：手機草稿操作與完成頁精修 · 2026-11-01

## 最新主線基準

從 `b433f9f1a8e9696c1d1e294635208aa9c8a9a285`（已合併 #905）建立。
- #871 / #873 / #877 建立 Codex 的 game-ui-ux 與 Impeccable 審查流程；這些 Skill 不在網站 runtime 執行。
- #866 已有玩家與作者完整旅程瀏覽器稽核；#878、#894、#904、#905 分別處理手機 Story 操作、Explore、首頁／詳情與觸控平板 Story／Stage。本批不重做它們。
- #864 的角色卡六階段與生命週期收斂、#875 手機作者入口及 #901／#903 作者署名路徑均保留。

## 來源確認的 UX 缺口

1. `css/character-studio.css`：在 530px 以下，草稿「封存草稿／永久刪除／還原草稿」是 10px 文案、4px 上下 padding，沒有最低點擊高度；觸控與誤操作風險高。封存清單切換按鈕同樣只有 40px 最低高度。
2. `css/character-studio-lifecycle.css`：在 520px 以下生命週期的 4 張狀態卡強制單欄，佔用完成頁高度；「建議下一步」及原生 `details > summary` 也未明定 44px 點擊高度。
3. 完成頁已有準備度、試玩、投稿狀態及下一步的真實邏輯；不是缺新模組，也不應再做一套發布流程。

## 本 PR 內容與邊界

- 草稿封存、永久刪除和還原仍為原有原生按鈕，保留清楚的動詞、原 `aria-label`、確認視窗、資料庫動作與草稿保存行為。將實際點擊盒提高到至少 44px，手機文案不縮到 10px。
- 手機完成頁將四個生命週期狀態以兩欄呈現，長文案可換行；不隱藏重要公開或欄位狀態。後續操作與兩個可展開指南保留原生 disclosure marker，給予至少 44px 的可點區域。
- 沿用現有的 `--yoru-*` token、`character-studio.css` 和 `character-studio-lifecycle.css` 責任檔；更新 `character-studio.html` 預載樣式版本。
- 不修改角色資料、草稿結構、IndexedDB、JS handler、發布規則、作者署名、MCP、Worker、API、模型、Story／Stage、金流與品牌。

## 驗收

已加入 `tests/e2e/character-studio-lifecycle.spec.cjs` 320×568 與 390×844 的瀏覽器測試：
- 驗證四個狀態卡的 2×2 排列、狀態文案不被截斷、沒有水平溢出。
- 生命週期下一步與投稿展開操作的實際點擊高度及原生 disclosure 保留。
- 保存本機草稿、確認封存、查看封存、還原，並檢查三個操作按鈕的實際尺寸和文案。
- 擷取 `test-results/creator-mobile-review-320.png`、`creator-mobile-review-390.png`；與原有 Flow、Lifecycle、人物能力及正式站快取回歸一起驗證。

目前僅提供 PR 與自動測試，必須依 GitHub Actions 最新 HEAD、截圖核對後才評估合併。瀏覽器尺寸模擬不等於真實 Android／iOS 虛擬鍵盤或觸控實機驗收。

## 後續

下一批建議先依實際截圖和既有 `Control Center` 測試收斂工具導覽、焦點與過長說明的閱讀負擔，再處理管理頁的表格／表單操作。不要一次混入作者審核、資料結構或記憶演算法。
