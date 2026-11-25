# 玩家圖片與 Vision：第一階段契約

基準 main：63b91470f3789ad3774c6a6d0739c7aae25def23（#973 已合併）。

## 復用與邊界

- 復用 Chat 訊息 ID、Storage 原子保存／失敗重播／拒寫保護、Story Library messagePayload、完整故事 JSON 備份及分支／回溯。選擇新增可選 `message.storyImage`，不改 DB version 或既有純文字 content。
- Phone 相簿是作者／世界狀態媒體，角色頭像會裁切成正方形；兩者均不適合直接存玩家照片。新圖片保持長寬比，不自動寫入 Phone、NPC 知識、角色卡或世界書。
- 不建立外部附件 store：這一階段的有限圖片隨訊息一起提交，避免跨資料庫引用、孤兒 Blob、備份缺圖及分支引用到其他故事。代價是備援、章節與分支仍會複製圖片；限制大小並沿用配額失敗保護，不宣稱零儲存成本。
- 現有燈火 Worker `modules/chat-input.js` 只接受 string content。AWS 為 Hosted 路由邊界，沒有新增通用圖片代理。本功能拒絕燈火圖片請求，不改後端或金流。

## 本機資料

每次 1 張 JPEG／PNG／WebP，原檔上限 8 MiB／32 MP。瀏覽器解碼後等比例縮至最長 1280 px，再以 JPEG 壓縮；透明處填白，原始 EXIF／檔名不存入訊息。編碼圖片最多 270,000 個字元（約 198 KiB 二進位）。一段訊息歷史最多 20 張，合計 2,700,000 個字元（約 2 MiB 二進位）。不自動刪除舊圖；達上限需備份並開新章節。

`storyImage = {version:1, data:"data:image/jpeg;base64,...", width, height}`。舊存檔沒有此欄位時行為完全不變。匯入會驗證 MIME、尺寸、數量與容量；拒絕不合法附件而非偷偷丟棄。圖片從同一訊息取得，不靠全域索引或內容字串配對。完整 JSON 備份含圖，TXT 僅是文字匯出。

預覽只存在目前故事記憶體，重載會清除未送出的草稿；切換故事不會帶入另一故事的圖片。物件 URL 與解碼畫布處理完即釋放。發送／取消失敗保留草稿；成功回覆後交給既有持久寫入保護，拒寫時保留本頁完整回合與圖片並提供重試／備份。圖片不可能消除裝置配額不足，不能把 accepted save 當成 durable save。

## 請求與資訊邊界

文字 Prompt 管線照常執行；圖片經本輪專屬 WeakMap ticket 在 API stage 129 才組裝，位於文字處理、診斷與 ledger 之後、LM Studio／Hosted transport 之前。ticket 綁定 model／protocol／endpoint，禁止轉成 helper 或不同路由。不把 Base64 放進診斷、摘要、記憶、模型選擇器或日誌。

本輪 user content 轉成 `text` + `image_url`；Gemini serializer 轉為 `text` + `inlineData`。圖片只傳送於玩家按下送出的回合。歷史圖片保留在本機，後續 Prompt 標示未重送；摘要只讀實際文字回覆已記錄的觀察，不產生額外 Vision／摘要呼叫。需要重新看圖時明示重新選圖；重新生成／改寫不會暗中重送舊圖。

圖片是低信任參考素材，圖中文字不能改寫系統規則。僅本次圖片請求補充現有認知與玩家自主權的適用範圍；未說明展示對象，不推定所有 NPC 知情。模型是否確實遵守仍是模型行為，程式不把推測寫入確定事實。

## 模型與費用

| 路由 | 第一階段 |
| --- | --- |
| 官方 OpenAI Chat Completions | 已知 Vision 型號直接允許；其他型號需明確確認 |
| 官方 Gemini generateContent／streamGenerateContent | 已知 Vision 型號允許，使用 inlineData |
| OpenRouter、OpenAI-compatible 中轉 | 支援格式；未知模型需玩家確認該模型及端點支援 Vision，不依供應商名稱猜測 |
| LM Studio | 同樣使用 OpenAI content parts；需載入 Vision 模型並確認，永不轉雲端 |
| 已知純文字模型 | 阻擋並提示換模型或移除圖片 |
| Anthropic 原生協議、燈火 | 本階段未開放；文字原流程不受影響 |

能力確認綁定精確模型、協議與 URL；更換其中一項就失效。供應商實際拒絕時還原輸入，不把檔名當成看過圖片。自訂中轉是否真正保留 Vision 無法僅靠協議保證，需供應商契約或真實呼叫確認。

圖片只在發送時交給玩家選定的端點；模型供應商可能依圖片輸入 Token、尺寸／細節或圖片價格計費。OpenAI 與 Gemini 依模型的圖片輸入計算，OpenRouter 依底層模型／供應商價格，本地模型沒有夜灣新增模型費。預估文字 Token 不含完整圖片成本，實際 usage 與供應商帳單為準。不使用玩家個人 Key 驗收，不產生付費呼叫。

官方契約（2026-11-25 核對）：
- https://developers.openai.com/api/docs/guides/images-vision?api-mode=chat
- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/pricing
- https://openrouter.ai/docs/guides/overview/multimodal/image-understanding
- https://lmstudio.ai/docs/developer/openai-compat/chat-completions

## 驗證與後續

Core 覆蓋實際 serializer、路由綁定、文字／helper 隔離、敏感錯誤過濾、持久訊息與分支。專用 CI 於 Chromium／Firefox／WebKit 執行圖片流程、320／390／834／1440 px、完整備份、重載、資訊隔離、拒寫／配額與既有故事保存及 Prompt 測試。執行結果記於 PR；未跑的測試不視為通過。

無真實 Key 驗證供應商理解品質／帳單，無實機手機鍵盤驗證。回退可 revert 本 PR；圖片欄位保留在完整 JSON，舊版不會渲染／傳送該可選欄位。

下一階段生圖可復用有界圖片處理、訊息附件顯示及保存契約；生成供應商、付費授權與產圖操作另行實作，本階段不預建生成服務。
