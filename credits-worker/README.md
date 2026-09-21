# BAO/LAB 邀請制 Worker — token 額度測試版

此目錄是獨立的 Cloudflare Worker，與 GitHub Pages 前端分開部署。GitHub 提交不會自動更新 Cloudflare 上已運行的 Worker。保留既有 `bao-lab-credits-pilot` D1 資料庫及 `資料庫`（或 `DB`）binding；本版不需資料庫遷移。

## 目前的額度定義

- 先供經管理員邀請的文字 Gemini 使用；**每 100 個 Google 回報的輸入＋輸出 token 算 1 點虛擬額度**，每次向上取整。Gemini 回報的 total token 若包含思考 token，也算在輸出用量內。
- **不再按每日 5／200 次聊天限制**；聊天、摘要與狀態請求均按自己的 token 用量計點。每次呼叫前先預留保守點數，成功後按實際用量結算並退回多預留點數；無使用量回報時保留預留點數並標為 `unverified`，失敗時退回預留點數。
- 為了沿用現有 D1 表格而不重建資料，舊欄位 `balance_microusd`、`cost_microusd` 目前**裝的是虛擬點數，不是美元**。新 API 回傳 `balance_credits` 與 `charged_credits`；舊欄位僅作相容。舊玩家仍使用相同金鑰及原有點數。這些點數是遊玩測試配額，**不是已購買的美元、不代表 Google 實際費率或帳單**。
- 每次文字請求最多 96 KB、100 則訊息、8192 輸出 tokens。前端平時請求 6144 tokens，連線測試請求 1024 tokens。Google 官方模型或免費配額限制仍可能先阻擋請求；Worker 現可區分 Google 429、上游 HTTP 錯誤與沒有文字（如 `MAX_TOKENS`），不回傳上游原始錯誤及對話全文。

## 部署到目前的 Worker

在 Cloudflare → Workers & Pages → `bao-lab-credits-api` → Edit code，把 [最新 index.js](./src/index.js) 的**完整內容**覆蓋原有 Worker 程式，按 Deploy。這個 GitHub PR 是原始碼位置，**不是已部署的正式服務**。不要重建 D1，不要覆蓋現有 Cloudflare 環境變數或加密 secrets；`ADMIN_TOKEN`、`GEMINI_API_KEY`、`ALLOWED_ORIGIN` 沿用原值。確認部署後開啟 `https://bao-lab-credits-api.ghost80076.workers.dev/health`，JSON 應出現 `"credit_unit":"100_tokens"` 和 `"daily_chat_limit_enabled":false`。只有顯示這兩個新欄位才能確定 Cloudflare 已切換成功。網站前端的 `js/credits-pilot.js` 在 `main` 已更新，重新整理網站即可載入。

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