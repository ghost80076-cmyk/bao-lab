# BAO/LAB Player UI 2.0

Player 2.0 的目標不是重做 Story Engine，而是把既有能力重新包裝成玩家容易理解的產品表面。

## 目前確認的產品邊界

- 首頁與作品區負責「找故事」。
- 故事書庫負責「繼續故事」；分支、回溯、備份等能力留在進階管理，不佔主要導覽。
- 「我的」承接帳號、Hosted API 額度、故事入口、Google Drive 與本機角色實驗室。
- 手機主要導覽固定收斂為「首頁 / 故事 / 我的」；建立故事與聊天時隱藏底部導覽，避免干擾閱讀與輸入。
- BAO Account 是可選服務層。BYOK、本地故事與本地角色不要求登入。
- Story Engine、Memory、Context Pack、Prompt Cache、World State、Branch/Rollback 不因本輪 UI 改造而改變資料結構或模型上下文策略。

## 這個 PR 的範圍

這一版先建立 Player 2.0 的殼層：

1. 新增「我的」玩家中心。
2. 新增手機三項底部導覽。
3. 手機隱藏工程型頂部導覽，把帳號、同步與本機角色工具收進「我的」。
4. 保留桌面既有導覽並加入「我的」入口。
5. 不修改 Story Engine、BYOK、Hosted Worker、Wallet 計價或角色卡資料。

後續 UI 改造應以同一原則繼續：故事優先、工具按需出現、手機不是桌面版縮小。
