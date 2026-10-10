# 夜灣世界書擴充庫 MVP（2026-10-10）

## 目的

把「靜態世界資料」與「可變動世界狀態」分離。**世界書擴充庫不是第二套全局規則、記憶或世界模組 tracker**。世界書提供固定地理、文化、人物背景和事件參考資料；World Modules／世界時鐘／NPC 名冊仍負責實際進度和狀態。

## 目前已接入

1. 故事內「世界模組管理」新增「📚 世界書擴充庫」入口。
2. 同網域唯讀公開目錄：`data/worldbook-library.json`；公開內容需人工審核後由管理者提交程式碼更新，**不存在自動上架入口**。
3. 玩家可選用公開世界包，預設全部關閉；也可匯入既有世界書 JSON（LunaTalk `entries` 或夜灣 `yorubay-worldbook-pack`）。
4. 私人包只記錄在目前故事的 `GameState.current.worldbookLibrary`，跟隨原本的本地存檔／完整故事備份；不存在平台帳號、D1 或遠端作者資料庫。
5. 關鍵字召回根據最新玩家輸入、當前地點、在場 NPC 與最近事件評分；預設每輪最多 4 條、2,200 字。完全不符合時不注入。
6. `foundation` 是可選世界包的短基礎資料；`keyword` 是需要時才載入的延伸資料。
7. 不同 `meta.world` 的世界包在 UI 中互斥，`general` 可共用，避免修仙世界與曙光市互相覆寫。
8. `requires` 指定已解鎖的故事旗標；依 `GameState.current.worldbookFlags` 判斷。當前 **沒有** 提供玩家修改旗標的 UI，也不允許模組自行控制。尚未解鎖不召回。
9. 選用時只更新故事本地設定，並將公開包快照釘在故事存檔，以避免日後更新靜態目錄造成舊故事設定漂移。
10. 只有真正要發送故事模型的 `App.buildMessages` 階段才注入按需資料，附加在動態上下文尾部，不修改現有固定 System Prefix。

## 入庫審核規則

- `LunaTalk entries` 原文保留，但「規則」與「自訂」分類預設 `review_required: true`，不能被自動送進模型。來源沒有關鍵字而無法安全召回的條目同樣等待審核。
- 轉換絕不自動改寫原始創作、把演員角色當 NPC、移除原文或替作者公開。私有匯入的條目仍受故事持久化／備份容量限制。
- 公開檔案只放**已確認可公開且玩家可知**的內容。秘密真相、NPC 私密筆記或尚未公開的核心劇情不應放進公開前端資源。**關鍵字或階段鎖不提供資訊保密，因為靜態檔案所有訪客都能讀取。**
- 舊作裡的全局 OOC 禁令、資訊隔離、時間推進、狀態維護等不搬入通用模組；沿用既有平台規則。
- 動態資料可能送到玩家自己選的模型供應商。匯入或啟用前應審核第三方世界書的內容與來源。

## JSON 範例

```json
{
  "schema": "yorubay-worldbook-pack",
  "version": 1,
  "meta": {
    "id": "city-archive",
    "name": "城市地理",
    "world": "my-city",
    "classification": "world",
    "visibility": "private",
    "author": "作者"
  },
  "entries": [
    {
      "id": "overview",
      "title": "城市概況",
      "mode": "foundation",
      "content": "只有進入此世界時需要的精簡世界資料。"
    },
    {
      "id": "harbor",
      "title": "港口",
      "mode": "keyword",
      "keywords": ["港口", "碼頭"],
      "content": "港口的詳細世界設定。"
    },
    {
      "id": "evidence",
      "title": "案件已公開的證據",
      "mode": "keyword",
      "keywords": ["案件", "證據"],
      "requires": ["public-evidence-discovered"],
      "content": "玩家已知的證據；不能包含未揭露的真正兇手。"
    }
  ]
}
```

## 優先級與相容性

平台規則 > 已建立的故事事實、世界狀態與作品核心設定 > **選用世界包的參考資料**。世界包只是資料，不能要求玩家行動，也不能改寫劇情既有事實。

`data/worldbook-library.json` 當前四套公開試用包中，曙光市／三界九域兩套是原世界書的**地理節選**，通用生活場景與曙光市調查題材則是夜灣**新編示例**；都不是完整轉移。尚未公開的來源內容完整保留在作者上傳檔案與原評估文件，下一階段應逐條整理、檢查重複和標記劇情秘密後再公布。

## 後續工作（這版未做）

- 作者／玩家公開世界書投稿與審核／版本管理。
- 超大型世界書跨檔全文檢索、類似詞或語意召回，以及專用 Token 預算頁面。
- AI 導演與事件／任務解鎖規格正式化，遊戲進度旗標透過可信狀態更新。
- 秘密劇情保密方案。**不要**用靜態前端 JSON 或 CSS 隱藏來假裝保密。
- 舊 LunaTalk 七套世界書逐條審核，拆分通用資料、作品專屬資料、需審核規則與成人題材。這是獨立的內容審核與移植任務，不能視作本次 MVP 自動完成。

## 驗證

```bash
node --check js/worldbook-library-core.js
node --check js/worldbook-library.js
node tests/worldbook-library-core.cjs
node tests/lorebook-core.cjs
```

回歸測試應確認未選用時完全不改 prompt、關鍵詞／地點召回、世界互斥、規則待審、解鎖旗標與備份還原。請在 PR 通過後，以開啟一份現有故事手動檢查桌面及手機世界書入口，並確認故事回合的 cache／token 用量沒有意外增大。
