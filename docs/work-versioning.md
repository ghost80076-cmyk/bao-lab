# 作品公開版本與 NEW / UPDATED

夜灣探索頁把「作品最近被編輯」和「玩家錯過了新版」分開處理。

## Catalog 欄位

公開作品條目可使用：

- `published_at`：第一次公開時間。
- `updated_at`：這筆 catalog / metadata 最後修改時間。改封面文字、分類、標籤等維護也可以更新它。
- `published_version`：玩家可感知的公開內容版本，正整數，第一個受追蹤版本為 `1`。
- `version_published_at`：目前 `published_version` 正式發布的時間。

## 什麼時候要升版

只有玩家重新進入作品時，會明顯得到不同故事內容或玩法設定時，才增加 `published_version`，並同步更新 `version_published_at`。

例如：

- 修改角色核心設定、世界規則、開場白。
- 新增／修改會影響故事的 World Module。
- 修改作品提供的 Regex / 互動 UI，玩家會得到新的玩法。
- 其他足以讓既有玩家值得回來看一次的公開內容更新。

只有 metadata 維護時不要升版，例如：

- 修正錯字。
- 改標籤或分類。
- 調整搜尋描述。
- 修封面或不影響故事內容的展示資訊。

這些情況可以更新 `updated_at`，但保留 `published_version` 與 `version_published_at`。

## 玩家看到什麼

夜灣在本機保存玩家最後看過的版本：

- 從沒看過，且作品最近首次公開／發布新版 → `NEW`
- 看過舊版，且 `seenVersion < published_version` → `UPDATED`
- 已看過目前版本 → 不顯示 badge

`UPDATED` 是玩家相對狀態，不受 30 天「最近更新」時間窗限制；玩家沒有看過新版前會持續存在。

「最近更新」篩選仍只顯示近期發布的作品版本，排序依 `version_published_at`。因此 metadata 維護不會把作品推回「最近更新」。

## 舊資料相容

舊版 continuity 只有 `seenUpdatedAt`、沒有 `seenVersion`。

如果舊紀錄的 `seenUpdatedAt >= version_published_at`，系統會視為玩家已看過目前版本，避免版本制度上線後所有舊作品突然變成 `UPDATED`。

## 現行基準

版本追蹤導入時，既有正式作品以當時公開內容建立 `published_version: 1` 基準。這不是歷史更新次數，而是「從這個版本開始正式追蹤」。
