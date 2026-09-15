# BAO/LAB 現況審計與第一階段修正

審計基準：本輪即時讀取 main `5da25acf5f3165144e8a23071530a097f411f16d`，不是舊對話 SHA。

## 審計的 11 個問題

1. **正文**：`character-ui`/`CharacterEngine.composeSystemPrompt` 提供平台規則、角色核心、選擇啟用的完整設定、作者指示、Persona、世界觀、Lore、初始 NPC 與固定輸出規則；其餘 wrapper 加入回覆與敘事偏好、啟用筆記、已確認 Canon/Context Pack、core/relevant 人物與世界狀態，以及依近期文字挑選的動態角色提示。`prompt-cache.buildMessages` 再合併長期摘要、近期原文與最新玩家輸入。
2. **狀態**：實際執行的是 `world-modules` 覆寫的 `WorldStateEngine.update`。固定追蹤指示、現有時間/位置、最多 30 NPC、8 筆事件、到期模組、最多 4 人追蹤欄位、累積尚未處理玩家輸入與正文。不讀 `Chat.context`。
3. **記憶**：自動摘要取既有摘要加 `summarizedUntil` 後、近期保留範圍前的原始訊息；手動工作台可選最近/未整理/全部/全部加筆記；Canon 與 Context Pack 有另外的分段、合併、確認流程。
4. **完整歷史重複**：一般三模型沒有共同重送全歷史。正文 `full` 與玩家明選全部重建例外。手動工作台舊的「全部」路徑本身仍是單次大請求，不應等同已有分段的 Context Pack 管線。
5. **記憶時機**：修正前在 `Chat.context`（下一輪正文之前）觸發。溢出檢查與至少四則新訊息門檻，另有 Context 壓力與手動整理。尚未有自動判斷章節結束/重要劇情完成的觸發器。
6. **狀態時機**：`world-state-hook` 每輪正文完成後檢查；`world-state-cost` 按間隔累積。UI 預設 2 輪，缺省世界模式 2、其他模式 3。模組另有 high/medium/low 排程。不等於每輪三次 API。
7. **Cache**：`prompt-cache` 將提示分為 stable/memory/dynamic。Gemini 不建立 explicit cache 物件；OpenRouter 傳故事 `session_id`，只在已設定支援的 model 加首 system block 的 `cache_control`；官方 Anthropic 也在首 block 加 ephemeral；custom 不假設支援。標題字串切割對動態區塊內的巢狀標題仍可能誤分類，待第二階段修正。
8. **Usage**：`API.normalizeUsage` 已統一 input/cached/cache write/output/total；Anthropic input 會補上 read/write。缺失維持 null，本輪 UI 為「未知」。累計以 0 吸收未知值，且各用途費用仍混用同一費率；不是準確跨模型帳單。預設模型 JSON 還存在靜態參考價，與不硬編碼價格的產品方向有落差。
9. **AI 上文改寫**：`story-reader` 存在手動編輯、AI 改寫、重新生成、variants 與原文。直接修改限最新 AI 回覆，歷史訊息可經 `story-branches` 建立分支後改寫。分支需有當時 checkpoint；功能上線前的舊回覆無 checkpoint 時會拒絕。改寫後人物/世界狀態重算仍待第三階段檢查。
10. **載入**：`index.html` 載入 `site-ui`，依序載入 `story-tools → story-library → prompt-cache → story-reader → story-branches`，不是孤立的未使用檔案。
11. **既有部署**：審計 SHA 的 Pages run 34978375735、Core run 34978378088、Browser run 34978378075 均 success。直接取線上首頁未成功，不能用部署 success 代替互動驗證。本次另新增 CI 實際 Pages 檔案比對與 live browser smoke。

## 第一階段的最小修正

- 自動摘要移到正文及狀態完成後執行，下一輪使用；正常情況暫留一個整理間隔的未摘要原文。
- 依未處理新內容計算整理頻率。每次摘要設字數批次預算，完整保存未處理原文；單則超長訊息仍保持完整，並非精確 token 硬限制。
- 自動與手動摘要要求四類事實 JSON，再以允許欄位轉成固定條目。無效回傳不覆蓋原記憶；來源或故事已變更時不套用遲到摘要。
- 狀態回應在寫入前限制 NPC 欄位、人物 track 欄位、當次模組與型別。明確 schema 丟棄未知欄位；舊無 schema 模組只接受既有純量欄位或固定的基本欄位。原存檔及手動編輯資料不被重新清洗。
- 手動筆記由正文即時讀取，修正 closure 舊副本問題。
- 記憶設定顯示省錢/平衡/長篇/自訂，保留既有控制項與 handler，在進階區收納。預設對應工具的輸入預算，不宣稱是模型真實 Context Window；有相符 provider/model 的 context metadata 時才自動縮小預算。
- Helper 使用量不改寫正文 Context 壓力指標。

JSON/type 驗證能排除未知欄位與格式錯誤，不能保證允許文字欄位中的每句話都是真實。Canon/Context Pack 繼續保留玩家確認；自動記憶的語義驗收仍需真實 API。

## 保留的後續工作

第二階段修正 structured prompt 分區與 cache/usage/成本細節；第三階段查改寫後狀態一致性。既有狀態管理、世界模組、IndexedDB、故事書庫、備份與 Context Pack 不重做。正式 GLM、整站重設計、SEO、Discord、品牌與網域依原優先順序另處理。尚無玩家 API 的真實三供應商品質/費用驗收。

## 官方資料重新核對

- [OpenRouter caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching)：session_id 支援 request body，支援模型才用 explicit 標記，讀取 provider usage。
- [Gemini generateContent caching](https://ai.google.dev/gemini-api/docs/generate-content/caching)：implicit caching 與固定 prefix；本工具沒有為 cache 故意灌 token。
- [Anthropic caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)：cache_control 與 read/write usage 分開。

不將最低 cache token 門檻作永久硬編碼。
