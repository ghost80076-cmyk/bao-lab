# 齊格飛六條時間線開場｜夜灣作者歸屬與相容適配

> **來源作者：齊格飛（作者 ID：`chicofy`）**。此處僅保存作者提供的開場適配，**尚不是已公開上架的作品**。GitHub 提交者 `ghost80076-cmyk` 是夜灣專案維護帳號，不是這部故事的創作者。

## 作者歸屬（正式接入時不得丟失）

- `attribution.json` 是這份待接入稿的作者歸屬紀錄；`author_id` 為 `chicofy`，顯示名稱為「齊格飛」。
- 正式角色卡 `meta.author`、`meta.author_id`、`meta.creator`、`meta.creator_id` 必須使用 `attribution.json.character_meta` 的值，而不是 PR 提交者或網站管理員「班長」。
- 作者資料已存在於 `data/authors.json`，原有作品《時空之門》亦以 `chicofy` 上架；不要新增第二個同名作者。
- `chicofy-six-timelines` **目前只是開場 adapter 的暫定 ID**，並非已確認的原作作品名稱或正式上架 ID。
- `tests/chicofy-six-timelines.test.cjs` 檢查上述歸屬、來源、原圖網址、十二條按鈕 payload、Regex 相容性及尚未發布狀態；已列入 Core tests CI。

## 原作與資料界線

| 檔案 | 作用 |
| --- | --- |
| `attribution.json` | **待上架作品作者歸屬**（`chicofy`／齊格飛），不是公開作品目錄 |
| `roleWelcome_original.html` | 作者原版 HTML，原文、外部素材網址、六條獨立故事線與 12 個選角 `send` 全部保留 |
| `roleWelcome_yorubay.html` | 僅轉換外平台 `hc-btn` 成夜灣 `BAOAuthor.draft()` 按鈕，`hc-collapse` 成 `details`，保留原有轉盤，補足 iframe 內樣式與鍵盤操作 |
| `welcome.regex.json` | 只匹配作者原始開場的相容規則；玩家須授權作者互動腳本 |
| `assets.json` | 六張原圖與封面參考網址，**目前僅保存遠端 URL，尚未鏡像圖片二進位檔** |

## 正式上架的前置條件

1. 取得作者的**完整原版角色卡**和正式作品名稱／ID，保留人物、世界書、角色關係、NPC、時間線、狀態欄及主要／副線規則；不可僅憑開場資料補寫世界設定。
2. 依 `attribution.json.character_meta` 在正式角色卡寫入作者欄位，並讓 `data/characters.json` 或社群目錄對應的 `author` 和 `author_id` 也是「齊格飛」／`chicofy`。正式角色 ID 確認後同步修正 `welcome.regex.json.characterId` 及 sidecar 配置。
3. 確認六張原圖的可下載性及重用權利後鏡像進作品素材；作者原始 HTML 備份不覆蓋。後補網址 `BORVsUi.png` 的圖片用途仍需確認。
4. 驗收主站 iframe 隔離、互動 JS 與外部素材的玩家授權、桌機與手機轉盤、箭頭／滑動、十二個按鈕僅填草稿不自動送出、六線劇情起始時間及存檔還原。
5. **完整角色卡與公開目錄實際建立之前，不得稱此適配為「作品已上架」。** 本 PR 與後續靜態 Pages 部署都不會自動讓作品出現在探索頁。

## 夜灣現有權限機制

玩家須在作者正則介面允許互動腳本才能運行原始轉盤 JS；只有遠端圖片網址時還需允許外部圖片。原開場送出的文字由 `BAOAuthor.draft()` 填入輸入框，仍由玩家自行確認送出，不會自動呼叫模型。不要為了省略授權而繞過隔離設定。沒有使用 `story_startup.opening.posts`，避免夜灣原生開場阻止作者正則接管畫面。
