# 齊格飛《借來的人生｜公園外的六條救贖路》｜六線轉盤與圖片修復

**正式作品 ID：** `jielai-rensheng`  
**原作者：** 齊格飛（`chicofy`）  
**內容分級：** 成人向／男性向，遵守既有成人內容探索過濾。

## 問題與修正

初版角色卡已正確上架，卻把作者六線選擇轉盤的左右箭頭與觸控滑動綁在需要額外允許的 iframe JavaScript；首次進入的玩家只看到固定畫面。初版人物圖片又使用第三方 `objects.lunatalk.ai` 連結，但 iframe 的 CSP 在玩家未授權外部資源時會直接阻擋，導致破圖。

本次修正讓正式開場不需要擅自提高腳本或圖片權限即可顯示本地作品素材，並提供可操作的六線轉盤。

- `roleWelcome_original.html`：**作者原始 HTML 完全不變**，保留全部文案、原本圖片來源網址與 12 條角色 `send`。
- `roleWelcome_yorubay.html` 和正式 `jielai-rensheng.regex.json`：沿用作者 `perspective`、`rotateY` 六面環及卡片文字，增加 CSS `:has(input:checked)` 和原生 radio／label。左右箭頭及六個路線切換即使在 `sandbox=""` / `script-src 'none'` 仍能操作；腳本獲授權後額外支援水平滑動。十二個原文字 `send` 不改，只轉成夜灣 `BAOAuthor.draft()`。
- `assets.json` 保留六張圖片的原始 URL、原樣 PNG 快照與 WebP 最佳化路徑。此次在 GitHub Actions 從原始網址取回 **六張 PNG 原圖**，檢查 PNG header 與像素尺寸後存入 `assets/characters/chicofy-six-timelines/*.png`，另生成約 49–97 KB 的 `*.webp` 專供開場使用。也保留 `cover.png` 與約 140 KB 的 `cover.webp` 作為第一方作品封面。外部人物圖及封面不再被玩家端熱連結。
- `js/author-regex-inline.js` 僅為正式卡 `jielai-rensheng` 的隔離 iframe 放行 **當前網站的圖片 origin**；既有其他作者作品的外部來源、腳本、狀態讀取及 iframe 跨域隔離權限皆不變。
- 首次進入轉盤與角色圖不需任何額外授權，但 **「確認選角」要填入玩家輸入框仍須明確同意作者互動腳本**。新增開場旁「啟用選角確認」入口，確認後只允許在 opaque iframe 內執行腳本；不會自動送出訊息、不讀取狀態、不授權第三方外部資源。
- 無須修改卡片內容：`data/characters/general/jielai-rensheng.json` 的 `system_prompt`、13 條世界書、時間線、資金及作者署名 `齊格飛/chicofy` 原封不動。

## 圖像範圍與限制

六張選角立繪及作者提供的封面 `https://i.meee.com.tw/BORVsUi.png` **均已鏡像保存 PNG 原檔及本地 WebP**。正式作品目錄和角色卡封面改用 `assets/characters/chicofy-six-timelines/cover.webp`；世界書中的 Cloudinary 圖像網址仍是第三方來源，**本次未整批鏡像世界書 72 個參照網址**。若後續玩家在**劇情內插圖**遇到圖片不可用，不應與本次已修復的六張**選角圖**混為一談。

## 驗收

- `tests/chicofy-six-timelines.test.cjs`：保留原作 `system_prompt`／`author_instructions` SHA256、13 條世界書、六張 PNG/WebP 二進位格式、原始文案、12 份選角 `send`、六路線切換與 Regex 正規化。
- `tests/e2e/chicofy-six-timelines.spec.cjs`：390px／1280px 無腳本時轉盤箭頭及路線切換能改變 CSS rotation、六張同站 WebP 實際完成圖片載入，正式站的 sidecar 自動關聯、玩家明確授權後按鈕填入草稿，以及故事與 token 使用量不變。

靜態與 CI 測試不能替代正式站真實玩家長篇劇情驗收；網站部署後仍需確認登入狀態及跨裝置快取差異。
