# YoruBay Experience 3.0｜第十九輪：玩家設定三主題對齊

日期：2026-10-15。

## 問題
故事中的「回覆設定」「記憶管理」「聊天外觀」共用 .bao-player-modal，但播放器設定 CSS 長期使用 #111218、#171820 等硬編碼深色。晨霧和暮玫雖已套用到整站，這三個視窗仍像夜港控制台。

## 修改
- 只為晨霧和暮玫的原生玩家設定視窗覆寫對話框背景、標頭、頁尾、卡片、按鈕、分頁、表單輸入與文字色。
- 沿用 --yoru-surface、--yoru-card、--yoru-control、--yoru-text、--yoru-muted、--yoru-input、--yoru-lantern 等既有主題語義變數。
- 聊天氣泡即時預覽中的角色／玩家自選色仍由 --preview-* 變數決定，不強行被主題覆蓋。
- Night 夜港不變；不進入作者富文字 HTML。
- 更新 player-settings 的 CSS/JS 版本避免混用舊快取。

## 保證不變
Player settings 的保存格式、文本生成、記憶、閱讀背景圖片、字級、角色設定、GameState、BYOK/燈火、API、快取與計費均不更動。

## 回歸
新增 390/1280px Chromium E2E；切換晨霧與暮玫，檢查實際 computed background/color、回覆設定與聊天外觀開關、預覽仍可用、設定與故事物件完全不變、無橫向溢出。納入 Fast Browser E2E 手機閱讀群組。
