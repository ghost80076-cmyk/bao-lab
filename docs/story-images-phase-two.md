# 主動生圖、故事畫面與 Phone 收藏

基準：main `4d9e0d22d462a8be455553505ba73735d2018742`（#980）。官方契約查核日：2026-11-26。這是既有畫面工具的擴充，沒有新 Story Engine、後端平台、燈火路由或計費。

## 使用入口與行為

AI 回覆的「畫面」或工具中的「將此刻化成畫面」→「生成場景圖片／角色照片」。進階文字 Prompt 編輯器仍可使用既有文字模型整理 image／negative／continuity，按原有文字費率計費；圖片生成本身不需要先呼叫文字模型。生成面板的「套用現有 Prompt／角色與拍攝設定」會把同一套輸出與拍攝要求組成可修改、實際即將發送的完整提示詞。

玩家選擇獨立圖片供應商、模型、比例、品質與自己的圖片 Key，勾選本次費用及資料傳送確認後才發送一張。成功先預覽，可命名、下載、捨棄、保存到指定回覆與／或本章 Phone 相簿。重新生成需要重新確認；雙擊或另一個面板不能同時再發送。關閉面板會取消等待。取消／逾時不能保證供應商停止計費；沒有自動重試、模型替換或 fallback。

自拍會優先讀作者 `initial_state.npcs` 的 appearance／outfit，補入故事現有 NPC；沒有名單時讀角色 profile／appearance／image_prompt_profile。可編輯這張照片的外貌、服裝、表情、場景與構圖，從不覆寫卡片、作者頭像、canonical state 或時間。僅文字是外觀近似；參考圖經玩家授權及本機縮圖後才傳送，可以改善一致性，不能保證同一張臉。此版本提供本機選圖，不會偷偷抓取作者頭像或私人遠端照片。

## 生圖供應商契約

| 供應商 | 本版路徑／模型 | 狀態與限制 |
| --- | --- | --- |
| OpenAI | `/v1/images/generations`；有參考圖改用 `/v1/images/edits` multipart。GPT Image 2.6 Flare／Sunburst、2.5 Flare／Sunburst、2 | 明確型號 allowlist；官方可能要求組織驗證。1:1／3:2／2:3，low／medium／high；2.5／2.6 另有 xhigh／max。 |
| Gemini | `v1beta/models/{model}:generateContent`；`gemini-3.1-flash-image`、`gemini-3-pro-image`、`gemini-3.1-flash-lite-image` | `responseModalities` 與 `imageConfig`；inlineData 授權參考圖。Flash／Pro 為 1K／2K／4K，Flash Lite 僅 1K；實際權限依帳號。尚未適配 Interactions 新型號。 |
| OpenRouter | 公開 GET `/api/v1/images/models` → POST `/api/v1/images` | 只列宣告 image output 的目錄項目；比例／品質依能力 enum；參考圖依 input_references；需要多張參考圖者拒絕。模型級能力是各端點聯集，供應商仍可能拒絕參數；原樣報錯，不擅改付費設定。`allow_fallbacks:false`。 |
| 自訂中轉 | 明確 HTTPS `/images/generations`，OpenAI Images 最小文字生圖協議 | 精確端點＋模型重新確認、獨立 Key，可能受 CORS 限制；不宣稱已驗證任何中轉。無猜測品質、尺寸、參考圖能力。 |
| Imagen／其他協議 | 未提供生成路徑 | 查核時 Google Imagen 文件已標示停用。文字／Vision 型號不因此取得生圖資格。 |

本版所有供應商均僅完成合約及模擬回應測試，**沒有真實付費生成、品質、帳號權限或帳單驗證**。目錄查詢是公開唯讀請求，與付費生圖分開。

官方來源：
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/reference/resources/images/methods/generate
- https://developers.openai.com/api/docs/pricing
- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/image-generation
- https://ai.google.dev/gemini-api/docs/imagen
- https://ai.google.dev/gemini-api/docs/pricing
- https://openrouter.ai/docs/guides/overview/multimodal/image-generation

OpenAI 直連生命週期：[官方退役公告](https://developers.openai.com/api/docs/deprecations) 列明 GPT Image 1.5／1 Mini 於 2026-12-01 停用，夜灣提前移出直連選單並拒絕舊直連請求。Flare 仍為原有預設，不替玩家自動換模型；相簿、備份及歷史來源標示不遷移。GPT Image 2 的停用日另為 2027-02-10，這次仍保留，需在停用前另行對齊。OpenRouter 與自訂中轉仍以各供應商契約為準。

價格查核：GPT Image 2.5 官方指南列圖片輸入 US$8／百萬 token、圖片輸出 US$30／百萬 token、文字輸入 US$5／百萬 token；每張成本隨尺寸與品質消耗而變。Gemini 3.1 Flash Image 公布 1K 圖片輸出約 US$0.067，另計輸入／文字；3 Pro Image 的 1K／2K 圖片輸出約 US$0.134。OpenRouter 依所選模型與服務端點；不把 `:free` 當永久承諾。UI 提供官方價格連結而不寫死每張台幣價格；實際帳單為準。

## 資料與儲存

`storyImage` 完全維持第一階段玩家 Vision 訊息附件。新圖片不放進訊息、GameState、Phone schema、Prompt、記憶或各分支快照。

新 IndexedDB `yorubay-visual-assets` v1：

- `assets`：`sha256-<圖片位元組雜湊>`、ArrayBuffer、MIME、width／height／size。使用位元組而非直接持久化 Blob，沿用既有圖集的 WebKit 相容經驗。size index 支援不載入原圖的容量檢查。
- `thumbnails`：同一 asset ID 的 320px JPEG 預覽。畫面及相簿懶載入縮圖，檢視／下載時才讀原圖。
- `links`：storyId、chapterId、messageId、assetId、標題／描述、角色、章節標籤、取得時間、provider／model、scene／selfie、`sourceType:player-generated`、inStory／inPhone；不保存 Key 或原始生圖請求。

生成結果先在記憶體。驗證 MIME、位元組 signature、16 MiB 與 32MP、實際瀏覽器解碼後建立雜湊及縮圖。玩家保存時，圖片／縮圖／引用在同一 readwrite transaction 提交；提交成功後才顯示已保存。拒寫／配額不足仍保留結果讓玩家下載與重試保存，從不重新付費生成。每故事最多 128 引用，原圖總量最多 256 MiB（縮圖與 IndexedDB overhead 額外計算，裝置可能更早耗盡）。

暫時網址立即無憑證下載並保存實際位元組，拒絕 HTTP、主動內容、redirect 及 MIME 不符。不轉發 API Authorization、cookie 或 referrer 給圖片 CDN。若 CORS／下載失敗，只報錯，絕不重發生圖。原圖供應商可能包含 metadata；本版不聲稱剝除所有生成圖片 metadata。

### 分支、回溯與刪除

每個引用屬於明確章節及 assistant message ID。只有仍存在於本章的回覆才會顯示故事畫面／Phone 收藏。新分支不自動繼承生成照片，也不因此讓 NPC 知情；可在「本故事所有章節」圖集手動保存到目前回覆，重用相同 asset。

回溯不刪 bytes，原圖仍可在完整圖集管理；刪掉的故事章節之圖片在含圖備份標為 archived，匯入後只在完整圖集出現。刪除是刪該章節引用，只有資料庫內最後引用移除後才刪原圖與縮圖，三者同一交易。不同故事／匯入副本共用的 asset 保留。此版本不對刪除的整個故事自動 GC，避免破壞未完成還原；應於刪故事前用完整圖集備份並整理圖片。

### 匯出、匯入與 Drive

一般故事 JSON、TXT、既有 Drive 同步**不含新生成圖片**；舊 Vision 附件的原有備份行為不變。一般備份入口及圖集內都明示差異。

「下載故事＋生成圖片備份」產生 `yorubay-illustrated-story` v1：既有 StoryBackup bundle 加上去重的圖片資產與引用。匯入先完整驗證格式、大小、圖片解碼與 SHA256，再呼叫既有 StoryBackup 匯入故事，透過其 chapterMap 重映射引用，最後以圖片庫交易提交；圖片階段失敗時刪除這次新匯入故事，不改現有故事。匯入後從書庫開啟新故事。此格式只由畫面工具的專用匯入器接受，不交給舊故事匯入器猜測。匯入不是跨 DB 原子交易：突然關頁時可能留下無圖的新匯入副本，原故事及備份不受影響；不能宣稱跨庫 crash-atomic。

## Phone 與資訊隔離

Phone 沿用既有相簿。原有圖片標示「作者預先提供」或「故事事件取得」（由既有 phoneUI 動態來源判斷）；玩家生成收藏是獨立區塊，不合併進 phoneUI、knowledge、notifications、關係或事件。即使同一角色的自拍已收藏，也沒有任何自動分享。故事中要讓 NPC 看見照片，仍須玩家明確描述展示／傳送事件，或透過第一階段圖片附件選圖送出。

## 安全、回退與驗收

圖片 Key 僅保留本頁記憶體，不加入 App.config、localStorage、備份或診斷。直接向使用者選定供應商送出，不讀夜灣 Key、不經 AWS／Worker、不碰燈火。預覽生成素材不自動送入後續文字對話。

Core 合約：`tests/story-image-generation-core.cjs`。跨瀏覽器：`tests/e2e/story-image-generation.spec.cjs`，包含 320／390／834／1440px、真實瀏覽器圖片 decode／IDB、mock provider、回溯／分支／刪除引用、含圖備份、敏感錯誤、取消、參考圖、鍵盤及大量圖片分頁。沿用 Story images 三瀏覽器 CI，加跑原有 Vision、保存復原與 Prompt 測試。真實供應商生成、實體手機鍵盤與帳單未驗證；實跑狀態以 PR 與 Actions 為準。

回退：revert 本 PR，保留新 IndexedDB 不自動刪除；故事本體沒有新增引用，所以舊版仍能正常開啟。已下載的含圖備份可在再次升級後匯入。

下一階段語音可沿用「使用者主動確認 → 獨立 provider adapter → 媒體資產 → 章節／回覆引用 → 專用備份」的邊界；本版圖片 store 及 MIME 白名單不直接拿來存音訊，需先擴充版本契約。

## Phone 雙向照片：後續驗收順序（尚未實作）

1. **單角色私訊**：玩家可以把照片當訊息送給收件角色。支援 Vision 的聊天路徑只取得該對話有權存取的附件；純文字路徑明示看不到照片，不假裝辨識、不自動換模型或轉交另一家 API。收藏到相簿不是發送。
2. **角色回傳生活照**：RP 模型只提出符合情境的照片意圖，例如「剛買的宵夜，要看嗎？」；夜灣管頻率與費用，玩家明確確認後由獨立圖片模型出一張。沒確認、超出限額或生成錯誤，文字聊天照常；不自動重試、不換模型。先驗證聊天不等生圖、連點只發一次、角色自拍一致性，再決定是否開放自動模式。
3. **群聊與世界內 X**：沿用同一套照片引用，分享時明確指定可見範圍。沒有收到私訊或轉發的角色不能從相簿、群聊、X 或分支快照推知照片。驗收至少要涵蓋私訊保密、轉發後才可見，及切換／回溯後不串線。

模型驗收分開看：RP 測回覆是否自然、Vision 測看圖理解與資訊隔離、圖片模型用同一組晚餐／風景／自拍測出圖延遲、單張成本、畫質與角色辨識度。預設型號不代表最佳品質，合約與 mock 測試不等於真實供應商品質驗收。
