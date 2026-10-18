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

保留各 workflow 的 job timeout、權限、前置測試及部署時機。測試 `tests/live-assets-verifier.test.cjs` 使用本機 mock curl／sleep，涵蓋匹配、任一檔過期、HTTP 失敗、重試恢復、跨輪不一致、單檔及輸入錯誤，並驗證暫存清理；由 Maintenance core 在 PR 執行。

此 mock 證明的是驗證器行為，不能代替真實部署成功。PR 也不要求未合併內容已上線。其他 marker 型線上檢查仍未在本批全部遷移。
