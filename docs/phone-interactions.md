# 本機手機機關：密碼、已讀與跨 App 解鎖

主站手機的第二階段，在 `phone_ui.interactions` 定義可選的作者機關。讀取筆記、照片或聊天室，以及輸入故事密碼，會在本機更新目前故事的 `phoneInteractions`；不傳送聊天、不呼叫模型，也不修改作者原始作品。

## 可直接套用的手機資料

創作室勾選「這張作品使用手機介面」，在手機 JSON 填入以下內容。既有故事也能由「手機設定 → 更多設定與匯入資料」套用同樣格式，覆寫只作用於目前故事。

```json
{
  "userName": "玩家",
  "apps": ["notes", "kakao"],
  "contacts": [{"id":"friend","name":"好友"}],
  "notes": [
    {"id":"clue","title":"桌上的便條","text":"舊房間的號碼：0427。"},
    {"id":"safe","title":"加密筆記","text":"原來那個聊天室還在。"}
  ],
  "threads": [{"id":"hidden-chat","name":"舊聊天室","participants":["friend"],"messages":[{"from":"them","senderId":"friend","text":"你找到那張便條了嗎？"}]}],
  "interactions": {
    "version": 1,
    "locks": [
      {"target":{"app":"notes","id":"safe"},"code":"0427","hint":"四位數的房間號碼"},
      {"target":{"app":"kakao","id":"hidden-chat"},"hidden":true}
    ],
    "events": [
      {
        "id":"reveal-chat",
        "when":{"action":"unlock","target":{"app":"notes","id":"safe"}},
        "requires":[{"action":"read","target":{"app":"notes","id":"clue"}}],
        "unlock":[{"app":"kakao","id":"hidden-chat"}],
        "notification":"舊聊天室已解鎖。"
      }
    ]
  }
}
```

先讀便條，再輸入 `0427` 開啟筆記，就能在 KakaoTalk 看到舊聊天室。若先猜中密碼、之後才讀便條，條件補齊時仍會解鎖。照片的目標以 `app:photos` 搭配該張照片的 id 指定；與筆記、聊天室可互相連動。

## 欄位與規則

| 欄位 | 規則 |
| --- | --- |
| version | 固定 1；未提供 interactions 或設 null 沿用舊手機玩法 |
| locks | 最多 80 個，target 不得重複 |
| target | `{app,id}`，app 只能是 notes、photos、kakao；內容 id 必須存在 |
| code | 選填，最多 128 字的**字串**；區分大小寫、不自動去空白，保留開頭的 0 |
| hidden | true 時解鎖前不顯示；這種目標只能由事件解鎖 |
| hint | 最多 300 字；只顯示給可見的鎖定項目 |
| events | 最多 40 個，事件 id 必須唯一 |
| when | `{action,target}`，action 為 read 或 unlock |
| requires | 最多 12 個額外條件，需全部成立；可跨 App |
| unlock | 最多 12 個目標，均需預先設定對應的 lock |
| notification | 最多 300 字，本機通知，可關閉；不代 NPC 送出新對話 |

鎖可只允許線索解鎖（不填 code），或允許密碼與線索任一路徑。事件只會執行一次；解鎖效果可觸發其他 unlock 事件，循環仍會終止。解鎖不等於讀取：事件揭露照片後，需玩家實際打開才會成立 read 條件。無效格式或引用會拒絕作者匯出／玩家設定；異常匯入的機關會保持關閉，避免把失效條件當成已成立。

## 存檔、提示詞與介面

- 已讀、已解鎖與已觸發事件 id 保存於故事狀態，隨儲存、還原、備份和分支快照流動，不共用到其他故事。
- 儲存失敗會還原本次進度；模型回覆中不提交新的機關進度；切換故事後舊介面不能寫入新故事。
- 隱藏項目不出現在清單；鎖定項目不掛載正文、縮圖來源、聊天摘要或傳訊框。
- 密碼、機關規則與鎖定內容不進入系統提示詞。已發生的機關進度放在既有動態覆寫區，固定快取前綴不隨解鎖改變。
- 模型的手機動態區塊及 `modules.phone_ui` 不得覆寫機關規則。一般故事手機動態仍由原本同一輪回覆更新。
- `code` 是本機故事資料，非加密或帳號驗證；原始作品檔可查看。真實 API Key／密碼的既有清除機制保留不變。

## MCP 與範圍

Creator MCP 0.19 同步 `phone_ui.interactions` 的結構與引用驗證，JSON／PNG／ZIP 保留規則。主站與 MCP 使用同一份純機關核心，避免兩邊條件判斷不同。部署順序仍為主站先、MCP 後。

本次提供內容級機關與一次性本機通知，不提供任意腳本、外部網址動作、支付／資源變更、背景模型，或整個 App 圖示的密碼鎖。作者需先把機關引用的內容與 App 配置好。
