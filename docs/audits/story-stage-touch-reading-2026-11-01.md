# Story／Stage 觸控平板閱讀與操作層級精修 · 2026-11-01

## 基準與已完成事項

Main baseline: `361a6b9a4eb156a6d0ffd2da2e3a63cec797efb9` (含 #904)。本項工作延續 `docs/audits/ui-polish-alignment-2026-10-31.md` 的 Story/Stage 段落，並以 `docs/stage-capability-contract.md` 的 820／821、1080／1081、1279／1280、1429／1430 分界為契約。先前 #866 已完成全站玩家／作者旅程瀏覽器稽核、#878 已修正 **<=820px 手機**四個觸控熱區，不能重複宣稱缺少這些工作。

## 已確認的原始設計缺口

- `css/player-shell-v2.css` 對 `821px+` 的 Story／Stage／Control 分頁設定 `min-height:32px`。觸控平板也會套用桌機規則，因此高度沒有達到產品採用的 44 CSS px 舒適點擊區目標。
- 同檔 Play 模式對訊息操作列設定 `opacity:.22`，只在 `:hover` 或 `:focus-within` 提高至 1。沒有可靠 hover 的平板在觸碰前很難發現訊息操作。
- 桌機滑鼠低干擾閱讀是刻意設計，不應因此改為全站常顯示所有工具。手機 <=820px 已由獨立的 mobile reading stylesheet 管理。

## 實作界線

- 只在 `(min-width:821px) and (hover:none) and (pointer:coarse)` 下提高第一方 Story／Stage／Control 導覽按鈕、訊息工具按鈕／展開摘要為至少 44px，並讓訊息操作列保持可見；有 hover 的桌機原設計不變。
- 直接在 `css/player-shell-v2.css` 原責任檔末尾修改，不建立新布局或 UI 框架。刷新 `index.html` 與既有 `js/player-shell-v2.js` fallback 的 CSS cache version。
- 不更改 Stage Capability 或 Gameplay UI renderer、Phone、Story 模型請求、上下文與記憶、存檔、作者 HTML、內容規則。
- 調整是第一方觸控舒適度標準，不直接宣稱原 32px 一定違反 WCAG。

## 驗證範圍

- `tests/e2e/reading-layout-foundation.spec.cjs` 透過 Chromium `hasTouch` context 於 820/821、1080/1081、1279/1280、1429/1430px 檢查 Stage presentation 保留、實際第一方按鈕尺寸、訊息 toolbar 樣式、閱讀區可達性與水平溢出；產生 820/821/1080/1081 截圖。
- 現有 `tests/e2e/stage-capability.spec.cjs` 已對 820/821、1080/1081、scene 1279/1280、RPG 1429/1430 的嵌入／面板轉換、焦點、state 保持提供獨立驗收，本 PR 不造第二份 renderer。
- 驗收須看 Playwright screenshots 與 `Fast Browser E2E`、Gameplay UI 等相關 CI。實機 iOS／Android 軟鍵盤、手勢與觸控驗收無法單憑 Chromium `hasTouch` 宣稱完成。
- 僅 PR，未經下一輪明確授權不合併部署。
