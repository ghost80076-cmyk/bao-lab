# 部署資產內容驗證

`scripts/verify-live-assets.sh` 從 checkout 根目錄執行，下載指定資產並以 `cmp` 比對原始 bytes。全部資產必須在同一次重試中下載成功且與 checkout 一致才通過；不累積前一輪成功項目，也不以 marker 或版本字串代替內容。

```bash
SITE_URL=https://ghost80076-cmyk.github.io/bao-lab/ \
GITHUB_SHA=<checked-out-commit> \
bash scripts/verify-live-assets.sh js/chat-reading-scroll.js js/streaming-ui.js
```

| 環境變數 | 預設／要求 |
| --- | --- |
| SITE_URL | 必填，資產根網址 |
| GITHUB_SHA | 必填，快取識別與驗證輸出的 commit |
| LIVE_VERIFY_ATTEMPTS | 36 次，正整數 |
| LIVE_VERIFY_TIMEOUT | 每次下載 15 秒，正整數 |
| LIVE_VERIFY_DELAY | 失敗輪之間等待 5 秒，非負整數；最後一輪不再等待 |
| LIVE_VERIFY_QUERY | commit；可依既有流程使用 ci 或 sha |

每次下載附 `Cache-Control: no-cache`，URL 帶 commit query；仍以實際下載內容判定。暫存目錄由 mktemp 建立，成功／失敗退出時清理。缺少 checkout 檔案、無資產參數或設定格式錯誤會在下載前拒絕。

| 使用流程 | 資產 | 重試設定 | 線上執行條件 |
| --- | --- | --- | --- |
| credits-pilot-integration | credits-pilot.js、global-bridge.js | 36／15 秒／5 秒、ci query | 非 pull_request；保留手動入口 |
| chat-reading-scroll 的 pages-live | chat-reading-scroll.js、streaming-ui.js | 50／12 秒／5 秒、sha query | push，且依賴 reading-scroll job |
| world-mod-packs | world-mod-packs.js | 36／15 秒／5 秒、commit query | push |

新增三個使用者：

| 使用流程 | 資產 | 重試設定 | 執行與保留檢查 |
| --- | --- | --- | --- |
| character-studio-live | character-studio.html、character-library-repair.js、global-bridge.js | 40／12 秒／5 秒、commit query | push／手動；新增 checkout，使線上檔案與指定版本比對，而非只找 recovery marker。 |
| first-run-live | 原有 12 個教學、連結、Builder 與樣式檔 | 50／15 秒／5 秒、verify query | push／手動；語法與教學連結檢查原樣保留，只共用部署下載／比對迴圈。 |
| author-regex-live | author-regex-dock.js、author-regex-core.js、index.html、author-regex-inline.js、regex-chat.js | 60／15 秒／5 秒、ci query | push／手動；index 由 marker 升級為完整 bytes，其餘四檔清單不變，之後仍跑真實線上互動。 |

這三條流程保留 push／手動的線上執行時機；共用腳本與其回歸測試納入 push 的 path filter。作者正則另補 index.html 與 regex-chat.js 的觸發路徑，避免它實際驗證的依賴變更時沒執行。PR 由既有 Maintenance core 驗證共用腳本，不要求尚未合併的內容先上線。

聊天與包包流程也採用同一內容驗證器：

| 使用流程 | 資產 | 重試設定 | 語意檢查 |
| --- | --- | --- | --- |
| chat-experience-live | 原有七檔：chat-shell-fix、chat-presentation-core、chat-experience、對應 CSS、world-module-manager、character-status-ui、player-settings | 48／12 秒／5 秒、sha query | 原 JavaScript 語法與狀態解析回歸保留；部署不再只比舊 marker。 |
| bao-mascot-live | bao-mascot.html、bao-human-v2.webp、mascot JS／CSS、image-quality JS／CSS、bao-visual-ui.js | 60／15 秒／5 秒、commit query | checkout 後檢查功能入口、動畫／reduced-motion、解析度 guard、JS 語法及 WebP 格式；線上七檔須完整一致。頁面連結不再綁死 v=3／v=1。 |

目前共有八個指定部署流程共用內容驗證。這不是所有線上檢查都必須改成 cmp：pages-live-smoke 的 SEO metadata、作者登錄／作品引用、robots／sitemap 與社群圖尺寸驗收仍有獨立語意，保留原責任。其他 Python／Node 下載器與功能互動流程尚未全部收斂。

保留各 workflow 的 job timeout、權限、前置測試及部署時機。測試 `tests/live-assets-verifier.test.cjs` 使用本機 mock curl／sleep，15 項涵蓋匹配、任一檔過期、HTTP 失敗、重試恢復、跨輪不一致、單檔、輸入錯誤及二進位圖片的匹配／單位元組差異，並驗證暫存清理；由 Maintenance core 在 PR 執行。

此 mock 證明的是驗證器行為，不能代替真實部署成功。PR 也不要求未合併內容已上線。其他 marker 型線上檢查仍未在本批全部遷移。
