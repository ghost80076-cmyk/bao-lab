# 角色頭像對話第一版

在故事工具「畫面與操作 → 對話顯示」切換標準模式／角色頭像對話。標準模式保留既有作品 HTML、正則演出及場景樣式；頭像模式將姓名台詞與旁白分開閱讀。此設定屬於個別故事，會隨備份保存。

作者可在創作工作室設定建議模式，加入主角色或固定 NPC 的姓名、別名與頭像。最多 12 位作者預設人物；不要求歷史作品補圖。玩家人設、AI 人物庫、故事中的新增人物也可選擇圖片。故事內的「設定角色頭像」可覆寫已知 NPC／作者角色圖片，只影響該份故事。

本版圖片是 256 × 256 中央裁切的頭像，不是原圖庫。接受 PNG／JPEG／WebP，輸入上限 10 MB，壓縮後每張最多 65,536 字元。縮圖直接保存在既有角色／人設／故事資料中，每位人物一份，不複製進訊息；因此角色 JSON、人物庫 JSON 與故事備份可攜，不需要新伺服器或雲端圖片空間。清除瀏覽器資料前仍需匯出備份。原尺寸場景圖與 CG 繼續使用既有作品包附件機制。

## 資料契約

夜灣 1.x 新增可選 `presentation.dialogue`，正規化後為 `character.dialogue`：

```json
{"version":1,"mode":"avatar_chat","cast":[{"id":"main","name":"小雨","aliases":["雨"],"avatar":"assets/characters/rain.png"}]}
```

- mode：`standard`（預設）或 `avatar_chat`；玩家的 `config.dialogueMode` 優先。
- cast：穩定 id、姓名、最多八個別名、一張 avatar。avatar 支援 HTTPS、本站 assets、受限 raster data URL、既有 `yorubay-asset://id`。
- 玩家 persona 與 storyActors.hostedCharacters 使用可選 `avatar` 欄位。
- `config.portraitOverrides` 以 `player`、`author:<cast-id>`、`actor:<actor-id>`、`npc:<npc-id>` 為索引，明確空字串表示移除圖片。故事快照包含資料，修改不回寫作者作品。
- 外部作品包引用需保留相應圖片附件；不能只匯出一個無附件的參照。

## 發話者及相容性

`人物姓名：台詞` 或 `**人物姓名**：台詞` 可辨識；別名僅在唯一對應時使用。重名、未登記姓名、無發話者的引號、一般敘述保留為旁白，不猜測歸屬。世界卡不把作品封面視為所有 NPC 的臉。無圖片顯示姓名首字。

頭像模式使用既有單次故事回覆，只追加簡短排版提示；不增加圖片生成、發話者辨識或其他 API 呼叫。圖片 bytes／URL 不加入人物 prompt 或行動靈感 prompt。原始訊息、記憶、分支、編輯內容保持原文。

頭像模式暫停作者 rich HTML 正則框與場景裝飾；純文字正則及玩家文字替換仍套用在顯示文字，不能改變原文發話者配對。切回標準模式恢復原設定。狀態欄維持原有獨立顯示流程。

## 驗證

`node tests/avatar-chat-core.cjs`：姓名／別名／重名、旁白保留、URL／大小限制及輸出轉義。

`npx playwright test tests/e2e/avatar-chat.spec.cjs --project=chromium`：行動版切換、多人對話、備份還原、作者工作室、玩家人物庫、NPC 圖片、prompt 隔離。

本次不含多表情、場景 CG 觸發、圖片生成或圖鑑。MCP 依相同 presentation.dialogue 契約對齊後再提供作者工具參數。
