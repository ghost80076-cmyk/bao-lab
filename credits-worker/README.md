# BAO/LAB 邀請制 Worker — token 額度測試版

此目錄是獨立的 Cloudflare Worker，與 GitHub Pages 前端分開部署。GitHub 提交不會自動更新 Cloudflare 上已運行的 Worker。保留既有 `bao-lab-credits-pilot` D1 資料庫及 `資料庫`（或 `DB`）binding；本版不需資料庫遷移。

## 目前的額度定義

- 先供經管理員邀請的文字 Gemini 使用；**每 100 個 Google 回報的輸入＋輸出 token 算 1 點虛擬額度**，每次向上取整。Gemini 回報的 total token 若包含思考 token，也算在輸出用量內。
- **不再按每日 5／200 次聊天限制**；聊天、摘要與狀態請求均按自己的 token 用量計點。每次呼叫前先預留保守點數，成功後按實際用量結算並退回多預留點數；無使用量回報時保留預留點數並標為 `unverified`，失敗時退回預留點數。
- 為了沿用現有 D1 表格而不重建資料，舊欄位 `balance_microusd`、`cost_microusd` 目前**裝的是虛擬點數，不是美元**。新 API 回傳 `balance_credits` 與 `charged_credits`；舊欄位僅作相容。舊玩家仍使用相同金鑰及原有點數。這些點數是遊玩測試配額，**不是已購買的美元、不代表 Google 實際費率或帳單**。
- 每次文字請求最多 96 KB、100 則訊息、8192 輸出 tokens。前端平時請求 6144 tokens，連線測試請求 1024 tokens。Google 官方模型或免費配額限制仍可能先阻擋請求；Worker 現可區分 Google 429、上游 HTTP 錯誤與沒有文字（如 `MAX_TOKENS`），不回傳上游原始錯誤及對話全文。

## 部署到目前的 Worker

先部署 [台灣區 Gemini 中繼服務](../gemini-relay/README.md)。在 Cloudflare Worker 的 Secrets 設定 `GEMINI_RELAY_URL`（Cloud Run HTTPS 基底網址，結尾 `/`）及 `GEMINI_RELAY_TOKEN`（與中繼服務一致的隨機權杖）。中繼服務單獨保管 `GEMINI_API_KEY`；Worker 舊有的 `GEMINI_API_KEY` 不再使用，確認新路徑上線後從 Worker 刪除。**切勿先覆蓋正在服務的 Worker 再部署中繼服務**：缺中繼設定時 Gemini 請求會安全失敗。

在 Cloudflare → Workers & Pages → `bao-lab-credits-api` → Edit code，把 [最新 index.js](./src/index.js) 的**完整內容**覆蓋原有 Worker 程式，按 Deploy。GitHub 原始碼**不是已部署的正式服務**。不用重建 D1；`ADMIN_TOKEN`、`ALLOWED_ORIGIN` 沿用原值。確認 `https://bao-lab-credits-api.ghost80076.workers.dev/health` 顯示 `"diagnostic_version":"2026-09-22-relay-1"` 且 `"gemini_relay_ready":true`。這只是設定檢查；最後還需一筆台灣與一筆香港玩家短句測試，核對實際結果及 Google 上游狀態。

Google 官方使用資格及帳單需另在 Google 帳戶核對；本版只為你的現有免費 Gemini 模型邀請玩家進行技術測試，不含正式付款／自動儲值。

## 管理員與玩家驗證

所有管理操作都要帶管理員自己的 `Authorization: Bearer <ADMIN_TOKEN>`，不要放進前端或聊天紀錄。

- `POST /admin/players`：`{"balance_credits":10000}`，建立玩家並**只回傳一次**玩家金鑰；舊 `balance_microusd` 參數仍可用，但含義是虛擬點數。
- `GET /admin/players`：列出玩家 ID 及剩餘 `balance_credits`，不列出金鑰。
- `POST /admin/players/<player_id>/credit`：`{"amount_credits":10000}`，加點，不用重建玩家；舊 `amount_microusd` 亦兼容。
- `POST /admin/players/<player_id>/disable`：停用玩家。
- `GET /admin/usage?player_id=<player_id>`：最新 100 筆用量，包含 `input_tokens`、`output_tokens`、`charged_credits`、`status`。
- `GET /me`：用玩家金鑰查看 `balance_credits`、`credit_unit`，每日聊天用量僅供參考，不再作為阻擋條件。
- `POST /chat`：玩家金鑰、`provider:"gemini"`、允許清單中的模型、`messages`、`max_output_tokens`。成功回傳文字、input/output tokens、charged_credits。

`MODELS_JSON` 現沿用現有的模型允許清單。原先的美元費率欄位不參與本版虛擬點數結算；若日後開放收費模型，必須先設計獨立的真實金流、成本與風險管理，不可把虛擬點數宣稱為美元。

## 測試

Node 22+ 執行：`node --check src/index.js && node --test tests/*.test.mjs`。單元測試涵蓋：密鑰與來源檢查、舊每日限制不阻擋、按 token 計點、額度不足、Google 429、失敗退點、長篇請求和空回覆診斷。部署後務必實際以玩家金鑰測一次短句和一張較長的角色卡，再核對 `/me` 與使用紀錄。不要截圖金鑰，也不要將故事全文寫入日誌；Google 與 Cloudflare 自身的日誌／資料保存政策須另行確認。
## 502 診斷與地區判斷

新版失敗回應提供 `request_id`、`upstream_http_status` 與允許清單中的 `provider_status`。Worker 自訂的 `bao_provider_failure` 日誌記錄診斷編號、玩家 ID、模型、錯誤類別及上游狀態；**不主動記錄 IP、訪客地區、金鑰、故事或 Google 原始錯誤**。Cloudflare 平台自身的請求日誌仍可能記錄玩家 IP，須在 Cloudflare Observability 檢查存取權、保留與關閉不必要的請求記錄；本程式不能刪除供應商層級的日誌。

Cloudflare [HTTP 標頭文件](https://developers.cloudflare.com/fundamentals/reference/http-headers/)指出，Worker 對非 Cloudflare 網站的子請求可附帶原始訪客 IP。新版 Worker **不直接呼叫 Gemini**；台灣區中繼服務重建 Gemini 請求，不轉寄玩家的任何 HTTP 標頭。中繼服務仍需將玩家送出的故事內容傳給 Gemini 才能生成回覆，無法承諾 Google 不處理故事文字。Google 看到的網路出口也應在部署後以實測核對，不應只憑服務區域推定。

GitHub 上的程式更新與 Cloudflare 的線上 Worker 是兩個獨立部署。必須更新 Worker 後，新的診斷欄位才會在線上出現；`/health` 並不實測 Gemini。
