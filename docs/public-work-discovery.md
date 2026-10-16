# 公開作品介紹頁

`/works/` 是不依賴 JavaScript 的作品目錄；`/works/<id>` 是固定作品介紹網址。Cloudflare Pages 會將對應的 `.html` 檔案以無副檔名網址提供。每頁提供公開簡介、作者、題材、封面、Canonical、社群分享資訊與結構化資料，按鈕沿用 `/?work=<id>` 進入既有作品預覽，不會直接建立或覆寫存檔。

## 維護

1. 在 `data/public-works.json` 編輯經人工檢查的作品 ID。
2. 修改公開目錄資料後執行 `npm run build:public-works`。
3. 提交 `works/` 與 `sitemap.xml` 的產出。CI 用 `npm run check:public-works` 阻止過期產出。

產生器只讀 `data/characters.json` 與社群目錄分頁的公開 metadata，明確挑選標題、簡介、作者、題材與封面欄位，不讀角色卡、世界書、開場白、提示詞、D1 或玩家資料。第一批限作者「班長」且 `rating: general` 的四部已審選作品；一般分級不是自動公開的充分條件，新增作品仍需人工審查。外部作者與成人分級作品會被產生器拒絕，若未來擴大範圍，需先建立相應授權及公開內容審核規則。

移除選單中的 ID 再產生，會刪除該頁並從 Sitemap 移除。不使用虛構更新日期；作品頁 Sitemap 不填 lastmod。這次沿用既有 Canonical 與重新導向規則。

## 上線後觀察

在 Search Console 逐一檢查 `/works/` 及作品網址是否可讀取，持續觀察索引與查詢曝光。靜態內容與網站結構化資料增加可發現入口，但不保證收錄或排名。既有 HTTP／`.html` 成效紀錄不會因部署而消失。
