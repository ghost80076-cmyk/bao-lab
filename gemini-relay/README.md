# Gemini 固定區域中繼服務

此服務單獨在 Google Cloud Run 的 `asia-east1`（台灣）部署。玩家 → Cloudflare Worker（驗證、D1 額度）→ 此服務（持有 Gemini API Key）→ Gemini。服務建立新 HTTP 請求，只傳 Gemini 必須取得的模型、故事文字及生成設定；不傳玩家 IP、玩家金鑰、Cloudflare 標頭或前端 User-Agent。請求內容不寫入應用程式日誌。Cloudflare 和 Google Cloud 的平台請求日誌仍需另外管理。

## 部署順序

1. 建立 Google Cloud 專案並啟用 Cloud Run、Artifact Registry、Cloud Build 與 Secret Manager。這一步涉及你自己的帳單。選擇 `asia-east1`；先確認 Gemini API 金鑰的使用資格與該區可用性。
2. 在 Secret Manager 分別建立 `bao-gemini-api-key`（你的 Gemini 金鑰）及 `bao-relay-token`（新產生的高熵隨機字串，例如 32 bytes），不要寫進 GitHub 或終端輸出。Cloud Run 的執行服務帳號只給這兩個 secret 的存取權。
3. 在 `gemini-relay/` 目錄用 `gcloud run deploy bao-gemini-relay --source . --region asia-east1 --allow-unauthenticated --set-secrets GEMINI_API_KEY=bao-gemini-api-key:latest,RELAY_TOKEN=bao-relay-token:latest --set-env-vars ALLOWED_MODELS=gemini-3-flash-preview` 部署。`ALLOWED_MODELS` 要與 Worker 的 Gemini 允許清單一致；多個模型用逗號。Cloud Run 允許公開 HTTP 入口，但 `/generate` 必須用中繼專用 Bearer 權杖，不能使用玩家金鑰。請限制 Cloud Run 併發及最大實例數以控制費用。
4. 將 Cloud Run 顯示的 HTTPS 基底網址（結尾 `/`）存到 Cloudflare Worker 的 `GEMINI_RELAY_URL`；同一個中繼權杖存入 Cloudflare 的 `GEMINI_RELAY_TOKEN` 加密變數。不要將 Gemini 金鑰放進玩家網站。
5. 最後更新 Worker 程式，確認 `/health` 的 `gemini_relay_ready:true`，先由自己測一筆短句，再請一位香港玩家測一筆。檢查失敗的 `request_id` 和 `provider_status`，不要請玩家傳金鑰或故事。成功後刪除 Worker 裡舊的 `GEMINI_API_KEY`。

> `--allow-unauthenticated` 只讓 Cloudflare 可從網際網路連到 Cloud Run；服務程式驗證另一把中繼權杖。需要更強的來源限制時，可再加 Google Cloud IAM 身分驗證或私人連線。預設 Cloud Run 出口 IP 不固定；`asia-east1` 是服務執行區域，不能單憑設定保證 Google 的地理辨識。若需要固定單一出口 IP，可配置 VPC + Cloud NAT，再核對實際出口。

本地執行 `npm test`。部署後若還有 Google 400/403，依 Google 的安全錯誤代碼檢查帳號、金鑰和區域政策；不要繼續轉送玩家 IP，也不要用規避服務商地區限制的方式隱藏實際使用者。
