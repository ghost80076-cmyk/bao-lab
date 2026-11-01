# Gameplay UI 編排器 P0

P0 提供編排器的共用匯出、原始草稿診斷與專用 iframe 預覽頁，尚未在創作室加入編排入口。

## 草稿與契約

- 原始 `gameplay_ui` 草稿是唯一編輯來源；節點上限依 core 的先過濾、再裁切與去重順序計算；`analyzeDraft()` 產生的 `schema` 只用於預覽，不能覆寫原始草稿。
- 共用 `BAOGameplayUICore.normalize()`、`normalizePanel()`、`normalizeSection()` 與匯出上限。
- 草稿診斷涵蓋空節點、整體無效、重複 Panel/Tab ID、巢狀 tabs、布局引用失效與項目裁切；它不是完整的儲存核准器，後續編輯器仍須顯示欄位修正與匯出確認。
- 未編輯的未知欄位在草稿中保留；正式 renderer 仍只接受原本的允許清單。

## 最小預覽

`gameplay-ui-preview.html` 共用正式 `gameplay-ui.js` 與 CSS，使用獨立 App/GameState 替身，不載入正式 Storage、模型連線或故事啟動流程。

P0 **只預覽單一 Panel**。`rendered.presentation` 固定為實際呈現的 `panel`；`resolvedPresentation` 是正式 Stage resolver 對該寬度的判斷，不能當成已完成的多欄、場景或 Terminal 舞臺預覽。完整舞臺布局留給後續階段。額外回報 `fidelity: single-panel` 與 `layoutExact`，在正式舞臺為 embedded 時顯示限制提醒。

父頁先載入 protocol 與 client，建立 iframe，再透過 `createPreviewClient(iframe)` 傳入草稿及複製的測試 state。寬度由 `setViewport()` 改變 iframe 的實際 viewport。

- 父頁送出前也用同一協定驗證，拒絕時回傳 `{ok:false,reason}` 並觸發 `error` 事件，保留最後有效預覽。
- 訊息只接受同源父/子視窗、版本與型別正確且不超過深度及 UTF-8 大小上限的 JSON。
- 購買/消耗 effect 只修改預覽 state；`saveStory` 是計數替身。試算需提供 `moduleDefinitions`。
- 純文字 action 填入預覽頁自己的草稿框，不送出請求。
- reset 與重新載入恢復最後一次 render 的初始測試資料。
- P0 不提供圖片；後續由父頁明確提供，不能自動讀取正式故事圖庫。
- 此 iframe 使用同源平台程式，不是執行不可信作者程式碼的 sandbox；禁止載入作者 JS/HTML。

## 離線行為

預覽文件採 network-only。連線失敗時回傳純文字 503，不退回遊戲首頁，也不寫入首頁快取。只有 `/`、`/index.html` 導覽可以刷新首頁離線備援。快取版本升至 v3，清除可能受舊導覽策略污染的 v2。

## 驗證

```sh
node tests/gameplay-ui-composer-core.cjs
node tests/gameplay-ui-engine-core.cjs
node tests/stage-capability-core.cjs
node tests/character-studio-gameplay-ui-core.cjs
node --test tests/gameplay-ui-preview-cache.test.mjs tests/pwa-install-contract.test.mjs tests/pwa-cache-safety.test.mjs
npx playwright test tests/e2e/gameplay-ui-preview.spec.cjs --project=chromium --project=firefox --project=webkit
```

瀏覽器 viewport 模擬不等於實機 Android/iPhone 鍵盤驗證。以實際執行紀錄和 CI 結果判定通過，不能把測試檔存在視為已驗證。
