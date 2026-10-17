# 角色知情範圍：Canon 與世界書的 Prompt 入場門檻（2026-10-18）

## 目的

接續 #686 與 #689 的有來源事件知情召回，讓 **明確宣告角色知情範圍** 的 Canon 記事本與故事內世界書章節，在送模型前採用相同的多人共通知情門檻；不新增第二套索引、資料庫或 API 呼叫，也不更動玩家原始存檔。

## 同一份本輪角色名單

`BAOEpisodicMemory.audience({state, config, primary})`：單角色模式包含主要角色與 `presence=present` 的 NPC；世界模式只取在場 NPC。作品名稱、對話裡被提到的人物，以及不在場人物，都不能被推定為本輪說話者。多人共用模型請求時，指定角色資料必須對**所有**名單中的角色開放；角色未知時拒絕私密項目。

## Canon（玩家已確認的記事本）

正常筆記的 `knowledge_scope` 預設 `shared`（既有行為不變）；玩家可在 Canon 進階「檢索標籤與知情權限」將整本記事本設為 `actors`，用 `known_by` 填正式角色名。例如：

```json
{
  "category": "current",
  "tier": "relevant",
  "knowledge_scope": "actors",
  "known_by": ["艾琳"],
  "content": "只有艾琳得知的消息"
}
```

即使記事本是 Core，單獨的艾琳可取得，艾琳與守衛共同出場則不送；空的 `known_by` 不送。現有 `category=knowledge` 仍不會無條件送模型。Canon 提取提示亦要求將非公開私人認知歸入 `knowledge`，避免自動分類到全域 Core。

## 世界書

每個條目可選用相同欄位，支援 constant / foundation / keyword：

```json
{
  "id": "keeper-secret",
  "mode": "keyword",
  "keywords": ["密令"],
  "title": "守塔人密令",
  "content": "艾琳獨自知道的密令",
  "knowledge_scope": "actors",
  "known_by": ["艾琳"]
}
```

`worldbook-library-core.normalizePack()` 會保留欄位，`constants()` 與 `select()` 在組裝前擋掉未授權項目。原本的旗標 `requires`、玩家手動開關、世界選擇與字元預算繼續有效。特別注意：`meta.visibility=private` 只代表世界書的**發布／存放範圍**，不是 NPC 的知情權限。

## 相容與安全界線

- 未標記範圍的現有 Canon／世界書保持 `shared`，不能反向推斷其內容必然是公開事實。若同一本筆記混合公開與秘密，應先拆成不同筆記／條目，再標記各自範圍。
- **尚未處理所有資料來源的硬隔離。** `Chat.summary` 是不帶來源權限的自由文字；早期原始對話、人物卡主提示、世界狀態、動態作者設定、手動記憶也可能暴露秘密。沒有證據就不能自動安全分割這些舊文字；本 PR 不嘗試以關鍵字刪除或假稱已達成真正的 NPC 硬隔離。
- 角色名稱精確匹配；演員別名、本體／戲中身份的對應與多人輸出角色預測仍是後續整合工作。標記的世界書內容仍會在**至少一個**合法 speaker 無權時整段省略，可能降低回憶命中，避免共用請求跨角色洩漏。
- 本 PR 不是防玩家從本地檔案查看作品內容的存取控制，也不是加密；只控制哪些段落進入同一次 LLM 請求。
- 所有篩選在瀏覽器完成，沒有額外付費模型呼叫；新增資料只在原有 Canon 與故事世界書快照裡保存。

## 回歸

- `node tests/episodic-memory-core.cjs`：共用角色名單、世界模式、未知角色、多角不同知情。
- `node tests/canon-workbench-core.cjs`：Core 限定記事本不能跨角色、在場／不在場判定、既有共用規則。
- `node tests/worldbook-library-core.cjs`：固定規則和關鍵詞召回的受限條目、空名單拒絕、序列化後保留以及未標記的舊條目相容。
