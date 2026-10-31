# 齊格飛（chicofy）六條時間線開場｜夜灣相容草案
**狀態：開場適配 PR／尚未正式上架。** 本目錄不是完整角色卡，不加入公開角色目錄。作者身分依 `data/authors.json`：`chicofy`（齊格飛）。

## 原作優先
- `roleWelcome_original.html`：作者提供原始 HTML，保留原文、風格、六位人物、3D 選角及十二個 `send` 訊息。
- `roleWelcome_yorubay.html`：只把原平台 `hc-btn` 換成普通按鈕呼叫 `BAOAuthor.draft()`，把 `hc-collapse` 換成 `details`，補上 iframe 需要的 CSS 與鍵盤操作。按鈕只填草稿，不自行送出。
- `welcome.regex.json`：原始開場 → 相容畫面的一條 Regex；只匹配原始六線開場，不套用後續敘事。
- `assets.json`：六張人物圖原始 URL 及對應名稱，另記錄作者後補的封面參考網址；**尚未成功取回圖片二進位檔，也沒有將它們寫進 Git。** 不得以不同圖替代作者原圖。

## 正式接入條件
1. 補入作者本人**完整**原版角色卡內容（設定、世界書、NPC、分支及狀態規則），不可憑這份開場文案臆造。角色 `content.greeting` 應使用 `roleWelcome_original.html`；Regex 由 sidecar 隨卡綁定或由玩家匯入。
2. 取得並確認六張遠端原圖可下載及授權後，鏡像到 `assets/characters/chicofy-six-timelines/`；同步改相容介面引用及素材映射，原始 HTML 不改。
3. 依作者指定的真實作品 ID 對齊 `welcome.regex.json` 的 `characterId`，將作品登錄至既有上架目錄前先做審核。現用 ID `chicofy-six-timelines` **只是暫定 adapter ID，不應視為作者正式作品名或 ID**。
4. 玩家須先在作者正則設定勾選「啟用自訂介面」並授權「允許互動腳本」，才可使用轉盤滑動、箭頭及確認按鈕。只有遠端圖時另需授權外部圖片，鏡像後不需要額外對外連線。
5. 本作品的原始按鈕先填訊息，**由玩家自行送出**。原作說明的六線切換、一億圓保險金、主線／副線規則不能僅靠表面 UI 推定已被遊戲引擎落實，須用完整原卡及故事實測。
6. 不要直接疊加 `story_startup.opening.posts` 替換本開場，因 `js/author-regex-inline.js` 會略過此類原生開場，以避免覆蓋原生選項。
7. 合併前驗收：主站隔離 iframe、Chrome／Firefox／WebKit、桌機／手機、左右箭頭與滑動、12 個按鈕填草稿、不自動送出、圖片打包、正式劇情起點與重新讀檔。

## 已做的驗證
- 已以來源與相容 HTML 比對：十二個按鈕的 `send` 訊息及六張圖片網址完全一致。
- `tests/chicofy-six-timelines.test.cjs` 用 `BAOAuthorRegexCore` 驗證轉換、權限切換、原文／按鈕／圖片對應、後續劇情不誤觸。
- 尚未完成真實主站／CI、人物原圖鏡像及完整作品上架驗收。

---
原先相容版製作備註：

# 齊格飛・六線開場 — 夜灣相容適配（尚非正式上架卡）

## 原作保留政策
- `roleWelcome_original.html`：作者原始開場，逐字保留，請勿覆蓋。
- `roleWelcome_yorubay.html`：僅將 `hc-btn` → HTML button + `BAOAuthor.draft()`；`hc-collapse` → 原生 details；另補足 iframe 中的字體、按鈕樣式及鍵盤操作。原有 3D CSS 透視、角色排序、圖片來源、滑動轉盤、箭頭計算及 12 條角色按鈕完整訊息皆保留。
- `siegfried_welcome.regex.json`：夜灣作者正則檔，只針對原版六路線開場 HTML 生效，不應套用在後續 AI 劇情回覆。
- `siegfried_welcome_preview.html`：純本機離線預覽，測試點擊後的草稿填入，不會聯繫模型、也不會送出訊息。
- `cover_uploaded_original.png`：本次對話最初上傳的原始場景圖片。
- `siegfried_asset_references.json`：本次提供的圖片網址及六張人物原始來源，保留待驗證。

## 正式角色卡接入（保留原作其他設定）
1. 使用**作者原本的完整角色卡**。請保留 system_prompt、world、lore、角色關係、時間線、狀態欄、故事規則等欄位，不可用這裡的測試資料替代。
2. 將 `roleWelcome_original.html` **完整原文**放在角色卡開場 (`content.greeting`／原平台轉換後 greeting)；不要先改掉原字句。
3. 將 `siegfried_welcome.regex.json` 作為夜灣獨立作者正則，或加入正式角色卡對應的 work package `regex` 檔，再將卡片和原圖打包；ZIP 載入後作者正則預設停用，必須由玩家自行授權。
4. 玩家在「作者正則介面」啟用該作品排版，並勾選「允許互動腳本」後，轉盤左右箭頭、手機橫向滑動、確認按鈕才能運作。原圖網址仍來自 objects.lunatalk.ai，沒有打包原圖時還需要同意「外部圖片、字型與媒體」。
5. 點擊按鈕只會把原版 `send` 字串填入夜灣輸入框。**玩家自行按送出，沒有自動發送 API**；玩家輸入框已有未發送文字時，夜灣可能先要求確認覆蓋。
6. 如果不授權腳本，靜態排版可顯示，但互動無法完整運作；這是夜灣目前的權限設計，不能偷偷跳過。
7. **不要在這個相容模式疊用 `story_startup` 產生的原生 `opening.posts`**。夜灣現有 `author-regex-inline.js` 會避開它，以免 iframe 蓋住原生選項；本作依作者原始設計透過送出原訊息選路線。

## 尚待實際網站驗收
- 目前只有作者的開場 HTML 與指定封面網址，沒有完整角色資料，因此本 ZIP **不是完整可上架角色卡**。
- 已保留最初對話上傳的場景圖片 `cover_uploaded_original.png`，也在 `siegfried_asset_references.json` 留下後續提供的 `BORVsUi.png` 網址；目前無法驗證這個新網址的圖片內容，因此**不會擅自宣稱兩張圖相同或替換作品封面**。六位角色圖目前仍為外部連結，正式上架應先備份原圖並確認使用權。
- 已測試原始文字、圖連結、12 個按鈕訊息等資料一致性；仍須在正式夜灣（桌機與手機）驗證同意腳本、外部圖顯示與後續開場劇情銜接。
- 如果作者未來需要無 JS 授權仍可操作的選角，須在夜灣新增受控選角元件，屬平台能力擴充，不應偷偷修改這份作品。

原作起點：2026/10/21 夜線五人；2026/10/22 09:20 日線詩織。保留一億日圓、SOSHIN、主線完成後一次引薦副線等規則。
