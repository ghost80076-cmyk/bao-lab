# 齊格飛《借來的人生｜公園外的六條救贖路》｜夜灣正式角色卡接入

**正式作品 ID：** `jielai-rensheng`  
**原作者：** 齊格飛（作者 ID：`chicofy`；不是 GitHub 提交者）  
**原作分級：** 成人向／男性向（`rating: adult`、`category: male`）

這次已把原作者提供的完整角色 JSON 接入夜灣的正式角色檔與公開 catalog，發佈效果仍以 PR 合併及 Pages 部署結果為準。

## 原作保全

- `data/characters/general/jielai-rensheng.json`：保留上傳原卡的 `system_prompt`、`author_instructions`、場景規則、主線與副線、共用時鐘／資金、初始狀態，以及世界書 `救贖之路` **13 條完整條目與全部關鍵字**。除了補齊正確作者欄位、封面與恢復原始 HTML greeting，其餘來源核心規則不改寫。原檔 `creator_notes` 附接入註記以澄清先前的 Markdown 草稿說明。
- `roleWelcome_original.html`：作者原版 HTML，逐字保留六人 3D 選角及 12 個原始 `send`。
- `roleWelcome_yorubay.html`：保留轉盤與文案，僅將外平台 `hc-btn`、`hc-collapse` 換為夜灣相容的 `button` 與 `details`。
- `data/characters/general/jielai-rensheng.regex.json`：使用正式作品 ID `jielai-rensheng`；從前述原始 HTML 轉成相容畫面，並利用主站的官方 sidecar 載入流程自動關聯。
- `data/characters.json`：公開作品條目以 `author: 齊格飛`、`author_id: chicofy` 登記；不另建作者、不用管理員「班長」署名。原作《時空之門》保持不變。
- `attribution.json`：記錄正式 ID、作者歸屬及完整原卡已取得。

## 圖片與操作限制

- 正式封面選用作者後補的參考 URL：`https://i.meee.com.tw/BORVsUi.png`。這是**遠端連結**，不是已提交 Git 的圖片。
- 六張主角立繪使用 `assets.json` 保留的原圖 URL；世界書中其他 Cloudinary 圖庫連結也僅是原作者資料，**均未鏡像進倉庫**。不能宣稱所有圖片來源都已可用。
- 正則會跟著作品自動綁定，但**作者互動腳本預設不獲授權**。玩家須在「作者正則介面」自行開啟互動腳本；遠端圖片另需授權外部圖片。未同意時不執行作者 JS，玩家仍可用文字輸入角色名選主線。
- 選角按鈕的 `BAOAuthor.draft()` 只填入原作者的選角訊息，**玩家自行按送出**；不新增 API 呼叫。
- 本作品沒有 `story_startup.opening.posts`，所以原始 greeting 可以由既有 `author-regex-inline.js` 接管；不需要改全站渲染器或跳過玩家安全隔離。

## 回歸檢查

- `tests/chicofy-six-timelines.test.cjs`：驗證原作者身分、catalog 與卡片一致、原版 HTML、6 圖、12 按鈕、Regex 與腳本權限，以及 system_prompt、作者示例、13 條世界書與來源檔雜湊不變；此測試已列入 Core tests。
- `tests/e2e/chicofy-six-timelines.spec.cjs`：390／1280px 正式卡載入、正則自動綁定、沙盒靜態預覽、明確授權後按鈕填入草稿，故事與 token 使用量不變；加入 Fast Browser E2E。
- 角色卡匯入規格驗證與上述 CI 不等於外部圖片主機長期可用，也不等於有現實 API 的完整劇情連續遊玩驗收。

**原作資料語意優先**：六人各自獨立起點，一局一條主線，主線完成後最多接受一次引薦副線；世界日期、角色線日、¥100,000,000 初始資金及不以金錢交換同意等規則完全由作者原卡決定。
