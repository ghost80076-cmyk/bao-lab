# Experience 3.0 · 第十六輪：世界書入口歸位

2026-10-15。承接第十五輪 #665。

## 發現
現有聊天側欄的「人物與世界」分類收納世界模組與狀態欄，但來自 worldbook-library.js 的「📚 世界書」是後續注入的獨立按鈕。chat-tool-navigation.js 的同步程序沒有將這個按鈕納入 world 類別，因此它會被最後的 fallback 移往「其他與支援」。雖然世界書的搜尋、分組與匯入都已實作，玩家仍可能在操作入口找不到它。

## 最小修正
- 把原始帶有 data-open-worldbook-library 的按鈕移入「◇ 人物與世界」，緊鄰世界模組；不複製新按鈕，避免同一功能出現多份入口。
- 讓手機「全部功能」及桌機功能抽屜都透過現有分類產生的 proxy 連回原始世界書視窗。輸入「世界書」查找工具也自然可以找到該按鈕。
- 提升 chat-tool-navigation.js 資產版本，避免客戶端因舊 JS 快取仍顯示錯誤分類。
- 不更動世界書集合、整本啟用、召回條件、原生匯入、世界模組狀態、模型 API 或快取架構。

## 驗證
- 390px 與 1280px 的 Story E2E：world 類別恰有一個原世界書按鈕，other 類別為零；功能抽屜點擊後開啟「世界書擴充庫」並能搜尋，關閉後返回正常，GameState 不變。
- Worldbook MVP、Core、Story controls、mobile-reading、Firefox、WebKit 全部通過再合併。
