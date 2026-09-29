# 夜灣 YoruBay 品牌遷移

> 目標：把對外品牌從 BAO/LAB 遷移為「夜灣 / YoruBay」，保留既有內部識別與存檔相容性。

## 品牌核心

- **Yoru**：取自日文「夜」的讀音意象。
- **Bay**：港灣、停靠之處。
- **品牌畫面**：夜晚停靠、進入故事的港灣。
- **核心方向**：夜 × 港灣 × 故事。
- **主文案**：今晚，想走進誰的故事？
- **品牌句**：替你留了一盞燈。

## 首頁原則

網站名稱只在主要品牌列出現一次。

角色 Hero 不再重複：
- BAO/LAB
- YoruBay
- CINEMATIC NIGHT
- 包包夜讀書房

Hero 只服務故事與情緒，不再重複網站名稱或英文品牌副標。

## 這次會改

- 網站標題、導覽、About、教學、帳號、隱私等玩家可見品牌文字。
- 首頁 Hero 的重複品牌文字。
- 吉祥物、記憶工作台、模型說明、LM Studio、Hosted AI 等玩家可見文案。
- canonical / Open Graph / sitemap / robots 的正式網址，預計改為 `https://yorubay.com/`。
- 對外顯示的 Context Pack 名稱改為「夜灣 / YoruBay」，但保留舊格式相容。

## 刻意保留 BAO/LAB 的地方

以下屬於內部識別或既有檔案格式，相容性優先，暫不重命名：

- `BAO*` JavaScript globals
- `bao-*` CSS class、DOM id、檔名與 asset 路徑
- LocalStorage / IndexedDB key
- Worker / service id
- repository 名稱 `bao-lab`
- 舊故事備份、Context Pack、裝置搬家包與角色 JSON 內的相容識別

玩家看到舊格式名稱時，文案應明確標示為「相容舊 BAO/LAB 格式」，而不是把舊識別直接破壞掉。

## 上線前檢查

- [ ] `yorubay.com` DNS / Cloudflare / GitHub Pages 自訂網域已確認。
- [ ] 決定是否由 GitHub Pages 使用根目錄 `CNAME`；未確認前不要只靠 canonical 假裝完成換網域。
- [ ] 新夜灣 Logo / favicon 是否沿用現有星球圖標。
- [ ] `assets/bao-social-card.png` 是否需要換成夜灣版社群分享圖。
- [ ] Core tests 通過。
- [ ] Chromium E2E 通過。
- [ ] 320 / 390 手機與桌機首頁無橫向溢出。
- [ ] 舊存檔、舊角色 JSON、Context Pack、裝置搬家包仍可匯入。
