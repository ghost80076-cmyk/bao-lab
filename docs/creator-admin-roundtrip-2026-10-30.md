# 創作室、管理頁與 Creator MCP 對齊

本批以主線 affbf8f1 檢查後的資料遺失為修正範圍，不變更故事 Prompt、玩家授權、金鑰或發佈權限。

創作室 JSON 匯出補回關係開局、演員模式、時間政策、閱讀背景、特殊開場、開場背景、資訊顯示位置、圖片清單與探索標記。管理頁由正規化結果寫回相同能力，讓原生分區格式與扁平格式都能送入既有上架 Worker；原生來源的額外區塊仍保留，私人 preserved_source 不公開。玩家入口名稱統一為「角色卡創作室」。

Node 往返檢查實際呼叫創作室匯出、管理頁 payload 與 Worker 發佈格式函式，以林祐真原作為基底比較能力與初始狀態，並確認來源未被修改。空圖片清單在 Worker 發佈時仍按既有規則省略。圖片檔案的替換與缺漏檢查沿用 admin-work-package 測試。

新增 390px 與 1280px 瀏覽器案例，走匯入、改名稱、儲存草稿、重新載入及下載 JSON。已加入既有 product-explore CI 群組。本機標準 Chromium 下載損壞，改以 Chromium 153 補跑單項驗證；完整瀏覽器結果仍以 CI 為準，不宣稱真機驗收。手機測試依既有流程先按「完成編輯」再切換完成階段，重載後確認草稿已載入再匯出。

配套 yorubay-creator-mcp 0.20 增加 builder.kind、fields[].presentation、choice_groups[].ordered 及可選 story_startup。MCP 的結構驗證、JSON／PNG／ZIP 打包與工具發現測試使用同一規格；主站與 MCP 分別通過 CI、合併及部署後才算線上同步完成。客戶端可能還需刷新 MCP 工具清單。
