# BAO/LAB｜AI 作者協作理解包 v0.1

> 2026-09-21 整理。這份公開說明可直接複製或交給作者慣用的 AI（GPT、Claude、Gemini 等）參考；它不是自動轉檔器、相容保證或完整 SDK。**不要將 API Key、密碼、私人故事備份交給 AI 或其他作者。**

## 先給作者：5 步驟

1. 把這份說明與你的角色設定、世界書或既有角色卡交給 AI。
2. 說明想要「單角色／多 NPC 世界」，是否要手機、圖鑑、開屏或狀態面板等互動。請 AI **先檢查相容性**，再寫檔。
3. 先產生一份 **BAO/LAB 角色卡 JSON**；需要自訂互動才另外產生一份 **作者正則 JSON**。單純聊天角色卡不需要正則。
4. 在 BAO/LAB 的角色卡創作／匯入功能驗證角色卡；進入故事後，在「作者正則介面（測試版）」匯入正則 JSON，先以開場畫面預覽。玩家自行選擇是否啟用作者腳本、外部素材、世界狀態讀取及小量介面偏好存檔。
5. 分別測試桌機、手機、無 JS 靜態模式、按鈕、跨回合、繼續故事與存檔還原。**匯入成功不等於互動完整相容。**

## 角色卡與正則：兩份不同的檔案

- **角色卡 JSON**：名稱、簡介、開場白、角色人格、世界規則及初始狀態。使用 `schema_version: "1.5"` 的頂層物件，主要區塊是 `meta`、`content`、`gameplay`、`presentation`。`meta.id` 建議英數開頭、總長 1～64，其他字元僅限英數、底線及連字號。`meta.category` 是作品受眾分類（`male`／`female`／`r18`），**不是角色性別**。`content.greeting` 是故事開場；`content.system_prompt` 是人格與行為規則；多 NPC 世界的規則可寫進 `content.world`、`content.npc_rules` 等欄位。`presentation.supported_display` 至少讓 `text` 或 `ui` 之一為 `true`。原生 `ui` 不會自動替作者開啟自訂正則。
- **作者正則 JSON（選用）**：獨立的 `regex_scripts` 陣列，每條含 `scriptName`、`findRegex`、`replaceString`，將開場或 AI 輸出的標記替換成預先設計的 HTML／CSS／JS。也接受規則陣列或 `rules` 格式。作者正則負責視覺與點擊，不是第二份角色人格。

目前角色卡結構檢查**不支援直接把 SillyTavern V2/V3 或其他平台整張卡自動轉換**為 BAO/LAB JSON；請 AI 參照模板改寫，再單獨匯入正則，逐條驗證舊平台專用的 DOM、全域函式及多腳本依賴。若來源匯入流程保留 `extensions.regex_scripts`，可能會綁定該角色卡的本機正則設定，但仍預設停用，不保證所有格式都可用。

正式模板：[基礎角色卡](../../data/characters/character-basic-template.json)｜[進階世界卡](../../data/characters/character-template.json)｜[作者沙盒與權限](../author-regex-dock.md)。本協作包另附：[示範角色卡](./example-character.json)｜[示範互動正則](./example-regex.json)。

## 哪些交給 AI，哪些交給作者程式？

| 要求 | 負責位置 |
| --- | --- |
| 人格、NPC 自主日程、知識隔離、因果、劇情 | 角色卡／世界規則，以及故事 AI |
| 開屏、圖鑑、手機選單、圖片翻頁、動畫、按鈕 | 作者正則的 HTML／CSS／JS |
| 現在的時間、地點、已記錄 NPC 與人物狀態 | BAO/LAB 世界狀態；作者腳本需另外取得玩家授權，才能讀有限快照 |
| 介面目前選到哪個分頁 | 作者 JS；選擇常駐並另外授權後，作者可自行保存少量顯示偏好 |
| 按鈕代表玩家說什麼 | 作者 JS 只填入草稿，**由玩家自己按送出**，故事 AI 再回應 |

例如開場文字包含 `【BAO_PANEL】`，正則把它換成作者預先寫好的畫面；玩家按「去圖書館」後填入草稿，玩家確認送出，AI 才接著敘事。不要要求故事 AI 每回合重輸出整份 HTML／CSS／JS。若觸發標記由模型輸出，它仍有一般輸出 Token 成本。

## 沙盒能力與限制（請 AI 不要虛構 API）

- HTML／CSS 可在隔離 iframe 內嘗試顯示，未授權 JS 時腳本與行內事件不執行；原平台的樣式未必完全相同。
- 玩家另行同意才可執行作者 JS。iframe 沒有 `allow-same-origin`，作者程式不能直接讀取主頁 DOM、API Key 或故事 IndexedDB；**沙盒不是完全防外傳保證**。也不能假設可呼叫 `App.sendMessage()`、修改聊天／世界狀態、直接發送任意網路請求或控制外層頁面。
- 外部圖片、字型、媒體**另外授權**，預設僅允許 `data:`，同意後可載入相應 HTTPS 資源。素材提供者可能得知 IP、請求時間與網址內資訊。
- 讀取世界狀態需另行授權，且快照只含時間、地點、部分 NPC 與角色狀態；不是完整故事資料庫。
- 跨回合常駐模式由玩家自行啟用；切換故事、離開聊天或變更權限可能重建／銷毀畫面。
- 小量介面偏好存檔需**常駐、JS 與另行存檔授權**；只有作者明確呼叫接口才保存，並非自動保存整個 DOM、任意 JS 變數或原平台 localStorage。

目前正則處理上限：一次至多 **60 條**；原始輸入最多 **20,000 字元**；單條比對式最多 **3,000 字元**；單條替換字串最多 **200,000 字元**；合成 HTML 最多 **350,000 字元**。超出可能停止渲染並保留原文。多條規則相互依賴的實際效果需要測試。

### 已實作的作者 JS 接口（僅限已授權的隔離介面）

```js
// 玩家點按鈕時：只填入草稿，不會自動發送 AI 請求。
BAOAuthor.draft('我想去圖書館看看');

// 玩家另外開啟世界狀態授權後，才有受限的實際快照。
const state = BAOAuthor.getState();
console.log(state.time, state.location, state.npcs, state.characterStatuses);
window.addEventListener('bao:statechange', event => {
  // 使用 event.detail 更新本沙盒中的顯示；欄位可能不存在。
});

// 僅限常駐介面且另行允許偏好存檔時：
const ui = BAOAuthor.getUIState();
BAOAuthor.saveUIState({ tab: 'photos', page: 2 });
window.addEventListener('bao:uistatechange', event => {
  // 使用 event.detail 恢復分頁等小量顯示偏好。
});
```

`draft(text)` 接受最多 500 字的非空字串，若玩家已有草稿可能會詢問是否覆蓋。`getState()` 未授權時只有空快照。`saveUIState(value)` 僅能保存最多 24 個欄位、總 JSON 最多 4 KB 的扁平物件，值限定短字串、布林、有限數字、短字串陣列；明顯的密碼／Token／Key 欄位名稱會被拒絕。**這不保證其他欄位的內容不含秘密；請勿儲存敏感資訊。** 狀態不會直接加入 AI 提示詞。

## 示範兩份 JSON 要怎麼配合？

[示範角色卡](./example-character.json) 的 `content.greeting` 含 `【BAO_PANEL】`；[示範正則](./example-regex.json) 的 `findRegex` 必須**完全相同**，`replaceString` 放小面板的 HTML／CSS／JS。預期未授權 JS 時只顯示靜態面板；授權後點按鈕才填入「我想去圖書館看看」草稿，不會自動送出。這兩份只是格式及最小互動示例，**不代表已在所有正式網站環境完成實測**。

## 交給 AI 的工作指令（可整段複製）

> 我正在為 BAO/LAB 製作角色卡與互動介面。請先閱讀我提供的《BAO/LAB AI 作者協作理解包 v0.1》，以及我的角色設定、世界書或舊正則。作品名稱：【填寫】；類型：【單角色／世界模擬】；想要的功能：【填寫】；既有來源檔：【有／無】。請先列出：①需求與現有功能對照，②哪些是故事 AI、原生狀態、作者前端程式，③需要玩家額外授權的地方，④不相容的舊平台依賴及可用降級方案。確認後，依 BAO/LAB 1.5 模板產出**獨立且有效的角色卡 JSON**；需要自訂畫面時再另產出**正則 JSON**，核對開場標記與 `findRegex` 一致。不要擅自宣稱舊平台整張卡可直接匯入，不要編造不存在的 BAO/LAB API，不要索取 API Key。最後附電腦／手機、靜態／JS、故事切換、存檔還原等測試步驟，並明確標出未實測項目。

常見疑問：只會寫角色設定的人可先只做角色 JSON；正則不是必備。AI 生成檔案不等於已部署／審核／完整相容。想移植複雜舊卡時先以最小示例驗證，再逐步加圖鑑、手機及狀態綁定。

參考程式：[正則解析](../../js/author-regex-core.js)｜[常駐介面橋接](../../js/author-regex-dock.js)｜[角色結構檢查](../../js/author-diagnostics.js)。此理解包與兩份示例均未包含作者私人作品或原始卡內容。