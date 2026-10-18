# UI／CSS 載入與責任盤點（2026-10-18）

## 本批修正

`index.html` 已宣告 `bao-brand-v2.css?v=yorubay-brand-2`，但 `bao-visual-ui.js` 以完整 URL 判斷，認為 fallback 的 `?v=original-violet-mint-1` 是另一份樣式，於 head 尾端再加一次。雖然檔案路徑相同，第二份的 cascade 位置晚於首頁宣告的 editorial、作品專用 CSS 與 gameplay CSS，造成重複載入與隱性覆蓋責任。

目前將該 loader 的樣式識別改為忽略 query／fragment 的路徑。已有 link 時保留頁面選擇的版本、節點及位置；沒有 link 的舊頁面仍依原 fallback 順序補載。不刪除其他 loader 的 link，也不全面搬動動態樣式。

回歸先在原程式重現：首頁品牌樣式兩份、不同 query／fragment 重複插入（兩個失敗）；修正後三項測試通過，包含缺少預載樣式時的 fallback 與重複執行。真實瀏覽器的手機／桌面 editorial 測試另驗證唯一性、順序、版面與原有操作，實跑結果以 PR CI 為準。

## 主頁主要責任

| 範圍 | 載入來源／先後依據 | 責任與後續原則 |
| --- | --- | --- |
| 基礎與品牌 | index.html：brand-home → base → 探索與社群 → cinematic → visual → brand-v2 → editorial → image-quality | 首頁預載位置是本批的權威；後續 loader 只補缺少的四份 visual／brand／editorial／image-quality。品牌、base 的全站規則仍有交疊，未在本批重排。 |
| 作品專用與玩法 | index.html：structured-opening → 三作品 CSS → action-choice-dock → player-shell-v2 → gameplay-ui → pwa-install | 作品與玩法繼續保有原位置；本批不以重複品牌載入覆蓋它們。 |
| 發現與首頁精修 | site-ui 的品牌鏈載入 bao-visual-ui；它啟動 bao-gallery-focus，後者依序補 editorial-polish、editorial-cinema | 這兩份本來就是後置精修層；不能只因名稱帶 editorial 就合併進首頁基礎檔案。 |
| 聊天基本樣式 | site-ui 的功能鏈 → chat-shell-fix → chat-experience.css | 管聊天基本外觀；不同於品牌鏈，不宣稱兩條鏈之間存在固定全序。 |
| 聊天工具與補正 | site-ui 功能鏈中的 chat-tool-navigation、chat-experience-repairs | 前者載入工具 CSS；後者建立內嵌 style。後續應按 selector 與互動責任整理，不能直接刪補正。 |
| 手機閱讀 | site-ui 功能鏈 → mobile-reading-layout → mobile-reading-layout.css | 核心手機區間為 max-width 820px；包含 viewport／安全區域與固定閱讀區域，屬高風險佈局。 |
| 桌面閱讀 | author-regex-mobile → chat-desktop-reading.css | min-width 1081px 的閱讀尺寸與留白。821–1080px 的平板還受其他規則控制，不能從兩個檔名推論已完整覆蓋。 |
| 工具功能面板 | 各模組載入對應 CSS，如 story-reader、story-tools、reader-context、world-module-manager | 維持模組責任；目前多數 loader 有各自判斷方式，尚未全面移入共用載入器。 |

## 保留界線與下一批

本盤點追蹤主頁與聊天的主要載入路徑，不是全站 selector 清單或所有頁面完整 cascade 證明。沒有把所有 `!important`、inline style 或多份品牌檔都視為可刪除技術債。

下一批先挑一個有限表面，列出 selector 的來源、媒體條件與實際勝出規則，再用桌面、手機、平板及配色回歸判定可移除的重複規則。避免僅憑靜態文字相同刪 CSS，也不重新設計使用者已確認的配色。
