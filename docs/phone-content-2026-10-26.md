# 手機內容擴充

手機仍為故事的可選介面，沿用同一輪正文回覆與目前故事存檔，不啟動背景 NPC 模型或第二次請求。

## 作者資料

設定位置：本機創作室 → 選用手機互動介面。新增故事時間、日期、日期格式簡易欄位；手機 JSON 的新欄位會隨草稿、原生角色匯入／匯出保留。玩家可在原有「手機設定」的進階 JSON 覆寫相同欄位，只影響目前故事。

| 欄位 | 內容與上限 |
| --- | --- |
| contacts | 30 位；id、name、avatar |
| threads | 30 串；id、name、participants（聯絡人 id）、messages |
| messages | 每串 150 則；from、senderId、senderName、time、text（1,600 字） |
| photos | 80 張；id、src、title、caption（1,600 字） |
| notes | 80 筆；id、title、text（6,000 字） |
| apps | phone、kakao、x、instagram、spotify、photos、notes |
| storyTime / storyDate | 顯示故事時間／日期；留白使用現實時間 |
| locale | zh-TW、ko-KR、ja-JP、en-US；只控制自動日期格式，介面文字為繁體中文 |

各種項目的 id 必須穩定且唯一。`chat` 仍是主要聯絡人的舊聊天串，與 `threads` 獨立。未填 `apps` 或空陣列均顯示預設 App：舊創作室會自動輸出空陣列，因此不可把它解讀成隱藏全部。

```json
{
  "contacts": [{"id":"xia","name":"小夏"},{"id":"man","name":"林曼"}],
  "threads": [{"id":"friends","name":"朋友群","participants":["xia","man"],"messages":[{"from":"them","senderId":"xia","text":"晚點見。"}]}],
  "photos": [],
  "notes": [{"id":"memo","title":"待辦","text":"買牛奶"}],
  "apps": ["kakao","photos","notes"],
  "storyTime": "23:17",
  "storyDate": "雨港・週一"
}
```

照片需使用作者提供的真實 HTTPS 圖片、受限點陣圖 data URL 或網站可存取的安全相對路徑；不會產生圖片，也不會自動取得其他網站的私人照片。ZIP 保留手機 JSON；本次沒有新增手機專屬附件上傳與資產 URI 解析。

## 故事更新與快取

仍沿用 `YORUBAY_PHONE_V1` 區塊，舊欄位繼續有效。每輪最多 3 個新聯絡人／聊天室／照片／筆記，每串最多追加 5 則訊息；整個區塊仍受 8,192 字元限制。聊天室依 id 追加訊息；照片與筆記依 id 更新完整紀錄。區塊只應包含本輪已發生且手機主人可得的資訊。

手機契約為固定前綴；主人、聯絡人／聊天室／文件 id 與顯示時間放在既有「本輪人物覆寫」動態分區。訊息與文件全文不額外塞進固定前綴。同一回覆 id 不會套用兩次。

## 本次範圍

完成獨立私訊／群聊、相簿與筆記清單／內頁、依作品選擇桌面 App、故事時鐘、中文介面、窄螢幕輸入框與觸控關閉入口。沒有新增密碼、讀取條件、跨 App 解鎖或通用事件編排引擎。

對應 MCP 為 yorubay-creator-mcp 0.18。上線順序：先主站，再 MCP；舊 MCP 可繼續製作舊格式。
