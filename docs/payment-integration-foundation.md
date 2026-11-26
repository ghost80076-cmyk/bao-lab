# 燈火金流串接：訂單與入帳基礎

本階段是未接入 HTTP 路由的內部模組；不會建立金流交易、不會開放付款，也沒有可以填入金流後台的 Webhook URL。`lights.html` 維持原有準備中狀態。這份文件不是正式上線完成證明。

## 已實作

- 四個 TWD 方案由伺服器決定金額與加值額度，訂單保存建立時的價格。NT$250 在本模組使用 25000 最小貨幣單位；金流 wire format 待 adapter 明確轉換，不能直接假設對方也使用分。
- 玩家與 request key 配對重試回傳同一訂單；換方案或金流環境須使用新的 key。
- 訂單綁定玩家、金流商與 test/live 環境。測試付款不得入正式錢包；sandbox 應使用獨立測試 D1，之後另驗證 sandbox adapter 的端到端交付。
- 正式付款以訂單編號、金流商、環境、金額、幣別、成功狀態與交易編號比對。訂單狀態、錢包餘額、`wallet_topups`、`wallet_ledger` 由同一個 D1 batch 原子提交。任何一筆 SQL 失敗會整批回滾，重試不得再加值。
- `provider + environment + transaction_id` 唯一。每筆新 settlement 使用獨立隨機 ID，以避免重送時再次執行後續錢包 SQL。
- 未取得手續費與實收資料時保存 NULL，不把未知費用寫成零。正式整合前須確認正式 D1 既有欄位允許 NULL；目前 SQLite fixture 沿用既有 wallet integrity 測試的結構，並非正式 D1 schema 稽核。

## 下一階段的必要輸入

1. 金流商名稱、官方 API 文件與 sandbox 申請方式。
2. 建立／查詢／退款 API 格式、金額單位、冪等機制、Webhook 簽章、重送與回應規格。
3. 測試 Token 透過伺服器 secret store 設定，不貼在對話、不放 GitHub。
4. 固定 IP 規定：釐清是否限制 API 出口，再確認 AWS EIP 與實際路由。此階段沒有替 AWS 配置任何服務或 EIP。

## 正式接入時的契約

`initializePaymentOrders` 應由受控 migration/setup 執行。`createPaymentOrder` 的 playerId 取自已驗證的登入 session，provider/environment 取自伺服器設定；瀏覽器只能選 packageId 並提供 request key。建立訂單本身不代表取得付款連結。後續 adapter 必須保存金流交易綁定，處理建立交易逾時與查單，避免重試產生多筆收款。

`fulfillConfirmedPayment` **不負責驗證簽章，也不能直接接收原始 Webhook**。未來 adapter 必須先按官方規格驗證原始 request，再向官方查單，核對商店／收款人、訂單歸屬、交易成功狀態與金額，最後才呼叫此內部函式。瀏覽器付款完成跳轉不得觸發入帳。

Webhook 遇到 D1 失敗必須依金流規格回覆可重試結果；付款已成功但錢包停用、額度到頂或入帳失敗時，要保留待處理／對帳紀錄，不能將付款遺失或向金流誤報成功。這些 HTTP 回應、待處理佇列、交易查詢、定期對帳、退款及扣回額度尚未實作。退款必須待官方契約確認後，處理已消耗點數、重複退款、退款逾時與狀態不確定等情況。

正式環境預設維持停用，待 sandbox 建立交易、查單、通知重送、金額不符、錯誤商店／環境、入帳失敗補償與退款全流程驗收後，才能開啟付款入口。

## 驗證

```bash
node tests/payment-orders-core.cjs
node tests/worker-wallet-topup-integrity-core.cjs
```

涵蓋價格一致、訂單重試、參數竄改、環境隔離、重複交易、餘額中途扣款、帳本失敗回滾後重試、停用錢包與餘額上限。這些是 SQLite 單元整合驗證，不代替正式 D1 與金流 sandbox 測試。
